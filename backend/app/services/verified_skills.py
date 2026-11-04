"""Verified skills: earning them, reusing them, and who may see them (spec Phase 8, §9)."""

import math
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import ColumnElement, and_, exists, func, or_, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFoundError
from app.core.thresholds import Thresholds, VerifiedSkillThresholds
from app.models import (
    Application,
    Assessment,
    AssessmentQuestion,
    CandidateProfile,
    InterviewSession,
    PracticalTask,
    Question,
    Skill,
    User,
)
from app.models.enums import InterviewStage, UserRole
from app.models.verified_skill import VerifiedSkill
from app.schemas.verified_skill import (
    PublicProfile,
    ReuseOfferOut,
    ReuseSkillOut,
    SkillBadge,
    TalentPage,
    VerifiedSkillOut,
)
from app.services.assessments import effective_thresholds
from app.services.companies import get_membership


def _now() -> datetime:
    return datetime.now(UTC)


def level_for(score: float, t: VerifiedSkillThresholds) -> str:
    if score >= t.advanced_from:
        return "advanced"
    if score >= t.intermediate_from:
        return "intermediate"
    return "basic"


# --- earning --------------------------------------------------------------------------------------
async def record(
    session: AsyncSession,
    app: Application,
    stage1: InterviewSession | None,
    stage2: InterviewSession | None,
    fresh_skills: list[dict[str, Any]],
    disqualifying_signal: bool,
    lifted_disqualification: bool,
) -> None:
    """A verified skill is a platform-wide claim, so it rests on the machine's result only: global
    thresholds, no HR override and no company's pass mark can create one (D-130). `fresh_skills`
    holds what this application measured itself: a reused score never renews its own validity."""
    t = Thresholds().verified
    if (
        stage1 is None
        or stage2 is None
        or stage1.passed is not True
        or stage2.passed is not True
        or stage1.needs_review
        or stage2.needs_review
        or app.suspicion_label == "high"
        or app.disqualification_reason is not None
        or disqualifying_signal
        or lifted_disqualification
    ):
        return
    at = stage2.completed_at or _now()
    valid_until = at + timedelta(days=t.validity_days)
    for row in fresh_skills:
        if row["percent"] is None or row["percent"] < t.min_percent:
            continue
        values = {
            "score": row["percent"],
            "stage1_score": row["stage1_percent"],
            "stage2_score": row["stage2_percent"],
            "level": level_for(row["percent"], t),
            "source_application_id": app.id,
            "verified_at": at,
            "valid_until": valid_until,
        }
        stmt = insert(VerifiedSkill).values(
            id=uuid.uuid4(),
            candidate_id=app.candidate_id,
            skill_id=uuid.UUID(row["skill_id"]),
            is_public=False,
            **values,
        )
        # The better valid result stands; once expired, any new one replaces it (D-132).
        await session.execute(
            stmt.on_conflict_do_update(
                index_elements=[VerifiedSkill.candidate_id, VerifiedSkill.skill_id],
                set_=values,
                where=or_(
                    VerifiedSkill.valid_until <= at, stmt.excluded.score >= VerifiedSkill.score
                ),
            )
        )


# --- reuse ----------------------------------------------------------------------------------------
@dataclass
class ReusePlan:
    skills: list[ReuseSkillOut] = field(default_factory=list)
    task_ids: set[str] = field(default_factory=set)
    question_ids: set[str] = field(default_factory=set)
    tasks_total: int = 0
    questions_total: int = 0
    stage1: list[dict[str, Any]] = field(default_factory=list)  # one entry per skipped task
    stage2: list[dict[str, Any]] = field(default_factory=list)  # one entry per skill


def _entry(v: VerifiedSkill, name: str, stage: str, percent: float) -> dict[str, Any]:
    return {
        "skill_id": str(v.skill_id),
        "name": name,
        "stage": stage,
        "percent": percent,
        "verified_at": v.verified_at.isoformat(),
        "valid_until": v.valid_until.isoformat(),
        "source_application_id": str(v.source_application_id or ""),
    }


async def plan(
    session: AsyncSession, candidate_id: uuid.UUID, assessment: Assessment, now: datetime
) -> ReusePlan:
    """A result counts only when it meets this vacancy's own pass mark, and a question HR marked as
    mandatory is always asked (D-131)."""
    t = effective_thresholds(assessment)
    task_ids = [uuid.UUID(str(i)) for i in assessment.stage1_config.get("task_ids", [])]
    tasks = [
        (row.id, row.skill_id)
        for row in await session.execute(
            select(PracticalTask.id, PracticalTask.skill_id).where(PracticalTask.id.in_(task_ids))
        )
    ]
    questions = [
        (row.id, row.skill_id, row.is_mandatory)
        for row in await session.execute(
            select(Question.id, Question.skill_id, AssessmentQuestion.is_mandatory)
            .join(AssessmentQuestion, AssessmentQuestion.question_id == Question.id)
            .where(
                AssessmentQuestion.assessment_id == assessment.id,
                Question.is_approved.is_(True),
            )
        )
    ]
    out = ReusePlan(tasks_total=len(tasks), questions_total=len(questions))
    if not assessment.allow_skill_reuse:
        return out
    rows = await session.execute(
        select(VerifiedSkill, Skill.name)
        .join(Skill, Skill.id == VerifiedSkill.skill_id)
        .where(VerifiedSkill.candidate_id == candidate_id, VerifiedSkill.valid_until > now)
        .order_by(Skill.name)
    )
    for v, name in rows:
        skipped_tasks = (
            [task_id for task_id, skill in tasks if skill == v.skill_id]
            if v.stage1_score is not None and v.stage1_score >= t.stage1.pass_threshold
            else []
        )
        skipped_questions = (
            [q for q, skill, mandatory in questions if skill == v.skill_id and not mandatory]
            if v.stage2_score is not None and v.stage2_score >= t.stage2.pass_threshold
            else []
        )
        if not skipped_tasks and not skipped_questions:
            continue
        out.task_ids |= {str(i) for i in skipped_tasks}
        out.question_ids |= {str(i) for i in skipped_questions}
        if skipped_tasks:
            assert v.stage1_score is not None
            entry = _entry(v, name, "stage1", v.stage1_score)
            out.stage1.extend(entry for _ in skipped_tasks)
        if skipped_questions:
            assert v.stage2_score is not None
            out.stage2.append(_entry(v, name, "stage2", v.stage2_score))
        out.skills.append(
            ReuseSkillOut(
                skill_id=v.skill_id,
                name=name,
                score=v.score,
                level=v.level,
                valid_until=v.valid_until,
                tasks_skipped=len(skipped_tasks),
                questions_skipped=len(skipped_questions),
            )
        )
    return out


def offer(p: ReusePlan) -> ReuseOfferOut | None:
    if not p.skills:
        return None
    return ReuseOfferOut(
        skills=p.skills,
        tasks_total=p.tasks_total,
        tasks_skipped=len(p.task_ids),
        questions_total=p.questions_total,
        questions_skipped=len(p.question_ids),
    )


def stage1_reuse(entries: list[dict[str, Any]]) -> dict[str, Any]:
    """`weight` is how many tasks the reused result stands for in the Stage 1 score."""
    unique = {e["skill_id"]: e for e in entries}
    return {
        "skills": list(unique.values()),
        "percent": round(sum(e["percent"] for e in entries) / len(entries), 1),
        "weight": len(entries),
    }


def stage2_size(count: int, total: int, left: int, own_code: int) -> int:
    """How many main questions remain after dropping skills already verified. 0: nothing to ask."""
    if left == 0:
        return own_code
    if left == total:
        return count
    size = max(1, min(count - 1, math.ceil(count * left / total)))
    return max(size, own_code)


def blended(fresh: float | None, n: int, reused: dict[str, Any] | None) -> float | None:
    """The stage score out of everything the vacancy asks: measured now plus reused."""
    if not reused:
        return fresh
    if fresh is None or n == 0:
        return float(reused["percent"])
    weight = float(reused["weight"])
    return round((fresh * n + float(reused["percent"]) * weight) / (n + weight), 1)


def reused_entries(sessions: list[InterviewSession | None]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for s in sessions:
        if s is not None and s.config.get("reused"):
            out.extend(s.config["reused"]["skills"])
    return out


async def stage2_offer(session: AsyncSession, application_id: uuid.UUID) -> list[dict[str, Any]]:
    """Chosen once, when Stage 1 starts: Stage 2 uses that snapshot even if a result expires."""
    stage1 = await session.scalar(
        select(InterviewSession).where(
            InterviewSession.application_id == application_id,
            InterviewSession.stage == InterviewStage.stage1,
        )
    )
    return list(stage1.config.get("reuse_stage2", [])) if stage1 is not None else []


# --- the candidate's own list ---------------------------------------------------------------------
def _own_out(v: VerifiedSkill, name: str, now: datetime) -> VerifiedSkillOut:
    return VerifiedSkillOut(
        id=v.id,
        skill_id=v.skill_id,
        name=name,
        score=v.score,
        level=v.level,
        verified_at=v.verified_at,
        valid_until=v.valid_until,
        is_public=v.is_public,
        is_valid=v.valid_until > now,
    )


async def list_own(session: AsyncSession, user: User) -> list[VerifiedSkillOut]:
    now = _now()
    rows = await session.execute(
        select(VerifiedSkill, Skill.name)
        .join(Skill, Skill.id == VerifiedSkill.skill_id)
        .where(VerifiedSkill.candidate_id == user.id)
        .order_by(VerifiedSkill.valid_until.desc(), Skill.name)
    )
    return [_own_out(v, name, now) for v, name in rows]


async def set_public(
    session: AsyncSession, user: User, verified_id: uuid.UUID, is_public: bool
) -> VerifiedSkillOut:
    row = (
        await session.execute(
            select(VerifiedSkill, Skill.name)
            .join(Skill, Skill.id == VerifiedSkill.skill_id)
            .where(VerifiedSkill.id == verified_id, VerifiedSkill.candidate_id == user.id)
        )
    ).first()
    if row is None:
        raise NotFoundError("Verified skill not found")
    v, name = row
    v.is_public = is_public
    await session.commit()
    return _own_out(v, name, _now())


# --- what others see ------------------------------------------------------------------------------
def _visible(now: datetime) -> ColumnElement[bool]:
    return and_(VerifiedSkill.is_public.is_(True), VerifiedSkill.valid_until > now)


async def _badges(
    session: AsyncSession, candidate_ids: list[uuid.UUID], now: datetime
) -> dict[uuid.UUID, list[SkillBadge]]:
    rows = await session.execute(
        select(VerifiedSkill, Skill.name)
        .join(Skill, Skill.id == VerifiedSkill.skill_id)
        .where(VerifiedSkill.candidate_id.in_(candidate_ids), _visible(now))
        .order_by(VerifiedSkill.score.desc(), Skill.name)
    )
    out: dict[uuid.UUID, list[SkillBadge]] = {}
    for v, name in rows:
        out.setdefault(v.candidate_id, []).append(
            SkillBadge(
                skill_id=v.skill_id,
                name=name,
                score=v.score,
                level=v.level,
                verified_at=v.verified_at,
                valid_until=v.valid_until,
            )
        )
    return out


def _profile(
    user: User, profile: CandidateProfile | None, skills: list[SkillBadge]
) -> PublicProfile:
    return PublicProfile(
        candidate_id=user.id,
        full_name=user.full_name,
        headline=profile.headline if profile else None,
        country=profile.country if profile else None,
        city=profile.city if profile else None,
        experience_years=profile.experience_years if profile else None,
        skills=skills,
    )


async def public_profile(session: AsyncSession, candidate_id: uuid.UUID) -> PublicProfile:
    """A candidate with nothing public has no public page at all."""
    now = _now()
    user = await session.get(User, candidate_id)
    skills = (await _badges(session, [candidate_id], now)).get(candidate_id, [])
    if user is None or not user.is_active or user.role is not UserRole.candidate or not skills:
        raise NotFoundError("Profile not found")
    return _profile(user, await session.get(CandidateProfile, candidate_id), skills)


async def search_talent(
    session: AsyncSession,
    company_id: uuid.UUID,
    user: User,
    skill_ids: list[uuid.UUID],
    min_score: float | None,
    page: int,
    size: int,
) -> TalentPage:
    """Open-to-work candidates who hold every requested skill, publicly and still valid. Best first,
    by the requested skills only."""
    await get_membership(session, company_id, user)
    now = _now()
    where: list[ColumnElement[bool]] = [
        User.is_active.is_(True),
        User.role == UserRole.candidate,
        # No profile row yet means the default, which is open to work (candidates._get_or_new).
        or_(CandidateProfile.user_id.is_(None), CandidateProfile.open_to_work.is_(True)),
        exists().where(VerifiedSkill.candidate_id == User.id, _visible(now)),
    ]
    for skill_id in skill_ids:
        conditions = [
            VerifiedSkill.candidate_id == User.id,
            VerifiedSkill.skill_id == skill_id,
            _visible(now),
        ]
        if min_score is not None:
            conditions.append(VerifiedSkill.score >= min_score)
        where.append(exists().where(*conditions))
    if min_score is not None and not skill_ids:
        where.append(
            exists().where(
                VerifiedSkill.candidate_id == User.id,
                _visible(now),
                VerifiedSkill.score >= min_score,
            )
        )
    base = select(User, CandidateProfile).outerjoin(
        CandidateProfile, CandidateProfile.user_id == User.id
    )
    total = await session.scalar(select(func.count()).select_from(base.where(*where).subquery()))
    rank_on = [VerifiedSkill.candidate_id == User.id, _visible(now)]
    if skill_ids:
        rank_on.append(VerifiedSkill.skill_id.in_(skill_ids))
    rank = select(func.avg(VerifiedSkill.score)).where(*rank_on).scalar_subquery()
    rows = (
        await session.execute(
            base.where(*where).order_by(rank.desc(), User.id).offset((page - 1) * size).limit(size)
        )
    ).all()
    badges = await _badges(session, [u.id for u, _ in rows], now)
    return TalentPage(
        items=[_profile(u, p, badges.get(u.id, [])) for u, p in rows],
        total=total or 0,
        page=page,
        page_size=size,
    )
