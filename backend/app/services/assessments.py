"""Per-vacancy assessment configuration, readiness, and the 'Generate with AI' job."""

import logging
import uuid
from typing import Any, Protocol

from pydantic import ValidationError
from sqlalchemy import delete, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.llm_client import LLMClient
from app.ai.question_generator import VacancyContext, generate_questions, generate_task
from app.core.errors import AppError, NotFoundError
from app.core.live_thresholds import current_thresholds
from app.core.thresholds import Thresholds
from app.models import (
    Assessment,
    AssessmentQuestion,
    GenerationJob,
    PracticalTask,
    Question,
    Skill,
    User,
    Vacancy,
    VacancySkill,
)
from app.models.enums import ItemSource, JobStatus, VerificationStatus
from app.sandbox.client import Sandbox
from app.schemas.assessment import AssessmentIn, AssessmentOut, GenerateIn, ReadinessIssue
from app.services import audit
from app.services.bank import question_out, task_out
from app.services.companies import get_membership

logger = logging.getLogger(__name__)


async def _vacancy(
    session: AsyncSession, company_id: uuid.UUID, vacancy_id: uuid.UUID, user: User
) -> Vacancy:
    await get_membership(session, company_id, user)
    v = await session.get(Vacancy, vacancy_id)
    if v is None or v.company_id != company_id:
        raise NotFoundError("Vacancy not found")
    return v


def effective_thresholds(a: Assessment | AssessmentIn) -> Thresholds:
    s1 = a.stage1_config if isinstance(a, Assessment) else a.stage1_config.model_dump()
    s2 = a.stage2_config if isinstance(a, Assessment) else a.stage2_config.model_dump()
    overrides: dict[str, Any] = {"stage1": {}, "stage2": {}, "integrity": dict(a.integrity_config)}
    overrides["budget"] = s1.get("budget") or {}
    if s1.get("pass_threshold") is not None:
        overrides["stage1"]["pass_threshold"] = s1["pass_threshold"]
    if s1.get("duration_minutes") is not None:
        overrides["stage1"]["task_time_limit_minutes"] = s1["duration_minutes"]
    for key, target in (
        ("pass_threshold", "pass_threshold"),
        ("duration_minutes", "session_minutes"),
        ("question_count", "question_count"),
    ):
        if s2.get(key) is not None:
            overrides["stage2"][target] = s2[key]
    return current_thresholds().with_overrides(overrides)


def _usable(model: type[Question] | type[PracticalTask], company_id: uuid.UUID) -> Any:
    return or_(
        model.company_id == company_id,
        (model.company_id.is_(None)) & model.is_approved.is_(True),
    )


async def _load(
    session: AsyncSession, a: Assessment
) -> tuple[list[PracticalTask], list[tuple[Question, AssessmentQuestion]]]:
    ids = [uuid.UUID(str(i)) for i in a.stage1_config.get("task_ids", [])]
    tasks_by_id = {
        t.id: t
        for t in await session.scalars(select(PracticalTask).where(PracticalTask.id.in_(ids)))
    }
    tasks = [tasks_by_id[i] for i in ids if i in tasks_by_id]
    rows = await session.execute(
        select(Question, AssessmentQuestion)
        .join(AssessmentQuestion, AssessmentQuestion.question_id == Question.id)
        .where(AssessmentQuestion.assessment_id == a.id)
        .order_by(AssessmentQuestion.order)
    )
    return tasks, list(rows.all())


def _readiness(
    a: Assessment,
    tasks: list[PracticalTask],
    questions: list[tuple[Question, AssessmentQuestion]],
    thresholds: Thresholds,
) -> list[ReadinessIssue]:
    issues: list[ReadinessIssue] = []
    if not tasks:
        issues.append(ReadinessIssue(code="stage1_no_tasks"))
    for t in tasks:
        if not t.is_approved:
            issues.append(ReadinessIssue(code="task_not_approved", details={"id": str(t.id)}))
        if t.verification_status is VerificationStatus.sandbox_pending:
            issues.append(
                ReadinessIssue(
                    code="task_not_sandbox_validated", severity="warning", details={"id": str(t.id)}
                )
            )
    approved = [q for q, _ in questions if q.is_approved]
    for q, _ in questions:
        if not q.is_approved:
            issues.append(ReadinessIssue(code="question_not_approved", details={"id": str(q.id)}))
        if q.language != a.language:
            issues.append(
                ReadinessIssue(
                    code="question_language_mismatch", severity="warning", details={"id": str(q.id)}
                )
            )
    need = thresholds.stage2.question_count
    if len(approved) < need:
        issues.append(
            ReadinessIssue(
                code="stage2_not_enough_questions",
                details={"needed": need, "approved": len(approved)},
            )
        )
    mandatory = sum(1 for _, link in questions if link.is_mandatory)
    if mandatory > need:
        issues.append(
            ReadinessIssue(
                code="too_many_mandatory_questions",
                details={"mandatory": mandatory, "question_count": need},
            )
        )
    return issues


async def to_out(session: AsyncSession, a: Assessment) -> AssessmentOut:
    tasks, questions = await _load(session, a)
    thresholds = effective_thresholds(a)
    issues = _readiness(a, tasks, questions, thresholds)
    return AssessmentOut(
        id=a.id,
        vacancy_id=a.vacancy_id,
        language=a.language,
        stage1_config=a.stage1_config,
        stage2_config=a.stage2_config,
        integrity_config=a.integrity_config,
        question_mode=a.question_mode,
        allow_skill_reuse=a.allow_skill_reuse,
        auto_approve_ai_items=a.auto_approve_ai_items,
        tasks=[task_out(t) for t in tasks],
        questions=[question_out(q) for q, _ in questions],
        mandatory_question_ids=[q.id for q, link in questions if link.is_mandatory],
        effective_thresholds=thresholds.model_dump(),
        ready=not any(i.severity == "blocking" for i in issues),
        issues=issues,
        updated_at=a.updated_at,
    )


async def get(
    session: AsyncSession, company_id: uuid.UUID, vacancy_id: uuid.UUID, user: User
) -> AssessmentOut:
    await _vacancy(session, company_id, vacancy_id, user)
    a = await session.scalar(select(Assessment).where(Assessment.vacancy_id == vacancy_id))
    if a is None:
        raise NotFoundError("This vacancy has no assessment yet")
    return await to_out(session, a)


async def _check_items(session: AsyncSession, company_id: uuid.UUID, data: AssessmentIn) -> None:
    task_ids = data.stage1_config.task_ids
    q_ids = [q.question_id for q in data.questions]
    if len(set(q_ids)) != len(q_ids) or len(set(task_ids)) != len(task_ids):
        raise AppError("duplicate_items", "An item is listed twice", 422)
    found_tasks = set(
        await session.scalars(
            select(PracticalTask.id).where(
                PracticalTask.id.in_(task_ids), _usable(PracticalTask, company_id)
            )
        )
    )
    found_q = set(
        await session.scalars(
            select(Question.id).where(Question.id.in_(q_ids), _usable(Question, company_id))
        )
    )
    missing = [str(i) for i in task_ids if i not in found_tasks]
    missing += [str(i) for i in q_ids if i not in found_q]
    if missing:
        raise AppError(
            "unknown_items", "Some tasks or questions are not available", 422, {"ids": missing}
        )


async def upsert(
    session: AsyncSession,
    company_id: uuid.UUID,
    vacancy_id: uuid.UUID,
    user: User,
    data: AssessmentIn,
) -> AssessmentOut:
    await _vacancy(session, company_id, vacancy_id, user)
    try:
        effective_thresholds(data)
    except ValidationError as exc:
        fields = [
            {
                "loc": ["body", "integrity_config", *map(str, e["loc"])],
                "msg": e["msg"],
                "type": e["type"],
            }
            for e in exc.errors()
        ]
        raise AppError(
            "validation_error", "Invalid threshold override", 422, {"fields": fields}
        ) from exc
    await _check_items(session, company_id, data)
    a = await session.scalar(select(Assessment).where(Assessment.vacancy_id == vacancy_id))
    if a is None:
        a = Assessment(vacancy_id=vacancy_id)
        session.add(a)
    a.language = data.language
    a.stage1_config = data.stage1_config.model_dump(mode="json")
    a.stage2_config = data.stage2_config.model_dump(mode="json")
    a.integrity_config = data.integrity_config
    a.question_mode = data.question_mode
    a.allow_skill_reuse = data.allow_skill_reuse
    a.auto_approve_ai_items = data.auto_approve_ai_items
    await session.flush()
    await session.execute(
        delete(AssessmentQuestion).where(AssessmentQuestion.assessment_id == a.id)
    )
    for order, q in enumerate(data.questions):
        session.add(
            AssessmentQuestion(
                assessment_id=a.id,
                question_id=q.question_id,
                order=order,
                is_mandatory=q.is_mandatory,
            )
        )
    audit.record(session, user.id, "assessment.save", "assessment", a.id)
    await session.commit()
    await session.refresh(a)
    return await to_out(session, a)


# ---------------------------------------------------------------- generation job


class JobQueue(Protocol):
    async def enqueue(self, job_id: uuid.UUID) -> None: ...


async def start_generation(
    session: AsyncSession,
    company_id: uuid.UUID,
    vacancy_id: uuid.UUID,
    user: User,
    params: GenerateIn,
    queue: JobQueue,
) -> GenerationJob:
    await _vacancy(session, company_id, vacancy_id, user)
    a = await session.scalar(select(Assessment).where(Assessment.vacancy_id == vacancy_id))
    if a is None:
        raise NotFoundError("Save the assessment settings first")
    running = await session.scalar(
        select(GenerationJob.id).where(
            GenerationJob.assessment_id == a.id,
            GenerationJob.status.in_([JobStatus.queued, JobStatus.running]),
        )
    )
    if running:
        raise AppError("generation_in_progress", "A generation is already running", 409)
    job = GenerationJob(
        company_id=company_id,
        assessment_id=a.id,
        created_by=user.id,
        params=params.model_dump(mode="json"),
    )
    session.add(job)
    await session.commit()
    await session.refresh(job)
    try:
        await queue.enqueue(job.id)
    except Exception as exc:
        logger.exception("generation_enqueue_failed")
        job.status, job.error = JobStatus.failed, "queue_unavailable"
        await session.commit()
        raise AppError("queue_unavailable", "Background worker is unavailable", 503) from exc
    return job


async def get_job(
    session: AsyncSession, company_id: uuid.UUID, job_id: uuid.UUID, user: User
) -> GenerationJob:
    await get_membership(session, company_id, user)
    job = await session.get(GenerationJob, job_id)
    if job is None or job.company_id != company_id:
        raise NotFoundError("Job not found")
    return job


async def _context(session: AsyncSession, a: Assessment, params: GenerateIn) -> VacancyContext:
    v = await session.get(Vacancy, a.vacancy_id)
    assert v is not None
    rows = await session.execute(
        select(Skill, VacancySkill.weight)
        .join(VacancySkill, VacancySkill.skill_id == Skill.id)
        .where(VacancySkill.vacancy_id == v.id)
        .order_by(VacancySkill.weight.desc())
    )
    skills = [
        {"id": s.id, "name": s.name, "weight": w}
        for s, w in rows.all()
        if not params.skill_ids or s.id in params.skill_ids
    ]
    return VacancyContext(
        title=v.title,
        description=v.description,
        requirements=v.requirements,
        experience_level=v.experience_level.value,
        skills=skills,
        language=a.language,
        difficulty=params.difficulty,
        time_limit_minutes=a.stage1_config.get("duration_minutes") or 30,
    )


async def run_generation(
    session: AsyncSession, job_id: uuid.UUID, llm: LLMClient, sandbox: Sandbox
) -> None:
    job = await session.get(GenerationJob, job_id)
    if job is None or job.status is not JobStatus.queued:
        return
    job.status = JobStatus.running
    await session.commit()
    try:
        a = await session.get(Assessment, job.assessment_id)
        assert a is not None
        params = GenerateIn.model_validate(job.params)
        ctx = await _context(session, a, params)
        result = await _generate_and_store(session, job, a, ctx, params, llm, sandbox)
        job.result, job.status = result, JobStatus.succeeded
    except Exception:
        logger.exception("generation_failed", extra={"job_id": str(job_id)})
        await session.rollback()
        job = await session.get(GenerationJob, job_id)
        assert job is not None
        job.status, job.error = JobStatus.failed, "generation_failed"
    await session.commit()


async def _generate_and_store(
    session: AsyncSession,
    job: GenerationJob,
    a: Assessment,
    ctx: VacancyContext,
    params: GenerateIn,
    llm: LLMClient,
    sandbox: Sandbox,
) -> dict[str, Any]:
    def approve(status: VerificationStatus) -> bool:
        return a.auto_approve_ai_items and status in (
            VerificationStatus.passed,
            VerificationStatus.sandbox_pending,
        )

    common = {
        "company_id": job.company_id,
        "source": ItemSource.ai_generated,
        "created_by": job.created_by,
    }
    question_ids, flagged = [], 0
    if params.question_count:
        for item in await generate_questions(llm, ctx, params.question_count):
            q = Question(
                **item.data,
                **common,
                is_approved=approve(item.status),
                verification_status=item.status,
                verification_report=item.report,
                model=item.model,
                prompt_version=item.prompt_version,
            )
            session.add(q)
            await session.flush()
            question_ids.append(q.id)
            flagged += item.status is VerificationStatus.flagged
    task_ids = []
    skills = [s["name"] for s in ctx.skills] or [ctx.title]
    for i in range(params.task_count):
        generated = await generate_task(llm, ctx, sandbox, skills[i % len(skills)])
        if generated is None:
            continue
        t = PracticalTask(
            **generated.data,
            **common,
            is_approved=approve(generated.status),
            verification_status=generated.status,
            verification_report=generated.report,
            model=generated.model,
            prompt_version=generated.prompt_version,
        )
        session.add(t)
        await session.flush()
        task_ids.append(t.id)
        flagged += generated.status is VerificationStatus.flagged
    # Attach to the assessment: new questions after existing ones; tasks only if Stage 1 is empty.
    existing = await session.scalar(
        select(AssessmentQuestion.order)
        .where(AssessmentQuestion.assessment_id == a.id)
        .order_by(AssessmentQuestion.order.desc())
        .limit(1)
    )
    start = (existing + 1) if existing is not None else 0
    for offset, qid in enumerate(question_ids):
        session.add(AssessmentQuestion(assessment_id=a.id, question_id=qid, order=start + offset))
    if task_ids and not a.stage1_config.get("task_ids"):
        a.stage1_config = {**a.stage1_config, "task_ids": [str(t) for t in task_ids]}
    return {
        "question_ids": [str(q) for q in question_ids],
        "task_ids": [str(t) for t in task_ids],
        "flagged": flagged,
    }
