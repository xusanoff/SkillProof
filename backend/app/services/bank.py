"""Question bank and practical-task bank. company_id NULL = global template (admin only)."""

import uuid
from typing import Any, cast

from sqlalchemy import ColumnElement, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError, NotFoundError, PermissionDeniedError
from app.models import PracticalTask, Question, Skill, User
from app.models.enums import ItemSource, UserRole, VerificationStatus
from app.schemas.assessment import Page, QuestionIn, QuestionOut, TaskIn, TaskOut
from app.services import audit
from app.services.companies import get_membership

Item = Question | PracticalTask


def _meta(item: Item) -> dict[str, Any]:
    return {
        "id": item.id,
        "company_id": item.company_id,
        "is_global": item.company_id is None,
        "source": item.source,
        "is_approved": item.is_approved,
        "verification_status": item.verification_status,
        "verification_report": item.verification_report or {},
        "model": item.model,
        "prompt_version": item.prompt_version,
        "created_at": item.created_at,
        "updated_at": item.updated_at,
    }


def question_out(q: Question) -> QuestionOut:
    return QuestionOut(
        **_meta(q),
        skill_id=q.skill_id,
        type=q.type,
        difficulty=q.difficulty,
        text=q.text,
        options=q.options,
        correct_answer=q.correct_answer,
        rubric=q.rubric or {},
        reference_answer=q.reference_answer,
        language=q.language,
    )


def task_out(t: PracticalTask) -> TaskOut:
    return TaskOut(
        **_meta(t),
        skill_id=t.skill_id,
        task_type=t.task_type,
        difficulty=t.difficulty,
        title=t.title,
        statement=t.statement,
        allowed_languages=t.allowed_languages,
        starter_code=t.starter_code,
        visible_tests=t.visible_tests,
        hidden_tests=t.hidden_tests,
        time_limit_minutes=t.time_limit_minutes,
        cpu_time_limit_s=t.cpu_time_limit_s,
        memory_limit_mb=t.memory_limit_mb,
        rubric=t.rubric or {},
        reference_solution=t.reference_solution,
        language=t.language,
    )


async def _check_skill(session: AsyncSession, skill_id: uuid.UUID | None) -> None:
    if skill_id and await session.get(Skill, skill_id) is None:
        raise AppError(
            "validation_error",
            "Unknown skill",
            422,
            {"fields": [{"loc": ["body", "skill_id"], "msg": "unknown", "type": "value"}]},
        )


async def _scope(
    session: AsyncSession, company_id: uuid.UUID | None, user: User
) -> uuid.UUID | None:
    """company_id None means the global template scope (admins only)."""
    if company_id is None:
        if user.role is not UserRole.admin:
            raise PermissionDeniedError("Only platform admins manage global templates")
        return None
    await get_membership(session, company_id, user)
    return company_id


def _fields(data: QuestionIn | TaskIn) -> dict[str, Any]:
    return data.model_dump(mode="json") | {"skill_id": data.skill_id}


async def list_items(
    session: AsyncSession,
    model: type[Item],
    company_id: uuid.UUID | None,
    user: User,
    *,
    include_global: bool,
    skill_id: uuid.UUID | None,
    approved: bool | None,
    source: ItemSource | None,
    q: str | None,
    page: int,
    size: int,
) -> tuple[list[Item], int]:
    if company_id is not None:
        await get_membership(session, company_id, user)
    scope: ColumnElement[bool] = (
        model.company_id.is_(None)
        if company_id is None
        else (
            or_(model.company_id == company_id, model.company_id.is_(None))
            if include_global
            else model.company_id == company_id
        )
    )
    where = [scope]
    if company_id is not None and include_global:
        # Other companies never see unapproved global drafts.
        where.append(or_(model.company_id.is_not(None), model.is_approved.is_(True)))
    if skill_id:
        where.append(model.skill_id == skill_id)
    if approved is not None:
        where.append(model.is_approved.is_(approved))
    if source:
        where.append(model.source == source)
    if q:
        column = Question.text if model is Question else PracticalTask.title
        where.append(column.ilike(f"%{q.strip()}%"))
    total = await session.scalar(select(func.count()).select_from(model).where(*where)) or 0
    rows = await session.scalars(
        select(model)
        .where(*where)
        .order_by(model.created_at.desc(), model.id)
        .limit(size)
        .offset((page - 1) * size)
    )
    return [cast(Item, r) for r in rows], total


async def get_item(
    session: AsyncSession,
    model: type[Item],
    company_id: uuid.UUID | None,
    item_id: uuid.UUID,
    user: User,
    *,
    for_write: bool = False,
) -> Item:
    if company_id is not None:
        await get_membership(session, company_id, user)
    item = cast(Item | None, await session.get(model, item_id))
    if item is None:
        raise NotFoundError("Item not found")
    if item.company_id is None:
        if company_id is not None and (for_write or not item.is_approved):
            raise NotFoundError("Item not found")  # templates are read-only for companies
        if company_id is None and user.role is not UserRole.admin:
            raise PermissionDeniedError("Only platform admins manage global templates")
    elif item.company_id != company_id:
        raise NotFoundError("Item not found")
    return item


async def create_question(
    session: AsyncSession, company_id: uuid.UUID | None, user: User, data: QuestionIn
) -> QuestionOut:
    scope = await _scope(session, company_id, user)
    await _check_skill(session, data.skill_id)
    q = Question(**_fields(data), company_id=scope, created_by=user.id, source=ItemSource.manual)
    session.add(q)
    await session.flush()
    audit.record(session, user.id, "question.create", "question", q.id)
    await session.commit()
    await session.refresh(q)
    return question_out(q)


async def create_task(
    session: AsyncSession, company_id: uuid.UUID | None, user: User, data: TaskIn
) -> TaskOut:
    scope = await _scope(session, company_id, user)
    await _check_skill(session, data.skill_id)
    t = PracticalTask(**_fields(data), company_id=scope, created_by=user.id)
    session.add(t)
    await session.flush()
    audit.record(session, user.id, "task.create", "task", t.id)
    await session.commit()
    await session.refresh(t)
    return task_out(t)


async def update_item(
    session: AsyncSession,
    model: type[Item],
    company_id: uuid.UUID | None,
    item_id: uuid.UUID,
    user: User,
    data: QuestionIn | TaskIn,
) -> Item:
    item = await get_item(session, model, company_id, item_id, user, for_write=True)
    await _check_skill(session, data.skill_id)
    for key, value in _fields(data).items():
        setattr(item, key, value)
    # An edited item is the human's own version: re-check status starts over.
    item.verification_status = VerificationStatus.not_checked
    item.verification_report = {}
    audit.record(session, user.id, f"{model.__tablename__}.update", model.__tablename__, item.id)
    await session.commit()
    await session.refresh(item)
    return item


async def set_approved(
    session: AsyncSession,
    model: type[Item],
    company_id: uuid.UUID | None,
    item_id: uuid.UUID,
    user: User,
    approved: bool,
) -> Item:
    item = await get_item(session, model, company_id, item_id, user, for_write=True)
    item.is_approved = approved
    audit.record(
        session,
        user.id,
        f"{model.__tablename__}.approve",
        model.__tablename__,
        item.id,
        {"approved": approved},
    )
    await session.commit()
    await session.refresh(item)
    return item


async def delete_item(
    session: AsyncSession,
    model: type[Item],
    company_id: uuid.UUID | None,
    item_id: uuid.UUID,
    user: User,
) -> None:
    item = await get_item(session, model, company_id, item_id, user, for_write=True)
    await session.delete(item)
    audit.record(session, user.id, f"{model.__tablename__}.delete", model.__tablename__, item_id)
    await session.commit()


def to_out(item: Item) -> QuestionOut | TaskOut:
    return question_out(item) if isinstance(item, Question) else task_out(item)


def page_of[T](items: list[T], total: int, page: int, size: int) -> Page[T]:
    return Page[T](items=items, total=total, page=page, page_size=size)
