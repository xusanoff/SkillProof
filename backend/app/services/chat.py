import uuid

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.elements import ColumnElement

from app.core.errors import NotFoundError, PermissionDeniedError
from app.models import Application, Company, CompanyMember, User, Vacancy
from app.models.chat import ChatMessage, ChatRead
from app.models.enums import UserRole
from app.schemas.chat import MessageIn, MessageOut, MessagePage, ThreadOut, ThreadPage
from app.services.companies import get_membership


def _scope(user: User) -> ColumnElement[bool]:
    if user.role is UserRole.candidate:
        return Application.candidate_id == user.id
    if user.role is UserRole.hr:
        return Vacancy.company_id.in_(
            select(CompanyMember.company_id).where(CompanyMember.user_id == user.id)
        )
    raise PermissionDeniedError("Only candidates and company members can use chat")


async def _application(
    session: AsyncSession, user: User, aid: uuid.UUID, *, lock: bool = False
) -> Application:
    query = (
        select(Application)
        .join(Vacancy, Vacancy.id == Application.vacancy_id)
        .where(Application.id == aid, _scope(user))
    )
    if lock:
        query = query.with_for_update(of=Application)
    app = await session.scalar(query)
    if app is None:
        raise NotFoundError("Conversation not found")
    return app


async def _thread(session: AsyncSession, user: User, app: Application) -> ThreadOut:
    vacancy = await session.get(Vacancy, app.vacancy_id)
    assert vacancy is not None
    company = await session.get(Company, vacancy.company_id)
    candidate = await session.get(User, app.candidate_id)
    assert company is not None and candidate is not None
    read = await session.get(ChatRead, (app.id, user.id))
    unread = await session.scalar(
        select(func.count())
        .select_from(ChatMessage)
        .where(
            ChatMessage.application_id == app.id,
            ChatMessage.sequence > (read.last_sequence if read else 0),
            ChatMessage.sender_id.is_distinct_from(user.id),
        )
    )
    last = await session.scalar(
        select(ChatMessage)
        .where(ChatMessage.application_id == app.id)
        .order_by(ChatMessage.sequence.desc())
        .limit(1)
    )
    return ThreadOut(
        application_id=app.id,
        vacancy_title=vacancy.title,
        company_id=company.id,
        company_name=company.name,
        candidate_id=candidate.id,
        candidate_name=candidate.full_name,
        application_status=app.status.value,
        cover_note=app.cover_note,
        unread_count=unread or 0,
        last_message=MessageOut.model_validate(last) if last else None,
    )


async def threads(
    session: AsyncSession, user: User, company_id: uuid.UUID | None, page: int, page_size: int
) -> ThreadPage:
    where = [_scope(user)]
    if company_id is not None:
        if user.role is not UserRole.hr:
            raise PermissionDeniedError("Company filter is for employers")
        await get_membership(session, company_id, user)
        where.append(Vacancy.company_id == company_id)
    base = select(Application).join(Vacancy, Vacancy.id == Application.vacancy_id).where(*where)
    total = await session.scalar(select(func.count()).select_from(base.subquery()))
    latest = (
        select(func.max(ChatMessage.sequence))
        .where(ChatMessage.application_id == Application.id)
        .correlate(Application)
        .scalar_subquery()
    )
    apps = await session.scalars(
        base.order_by(latest.desc().nullslast(), Application.created_at.desc(), Application.id)
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    return ThreadPage(
        items=[await _thread(session, user, app) for app in apps],
        total=total or 0,
        page=page,
        page_size=page_size,
    )


async def messages(
    session: AsyncSession,
    user: User,
    aid: uuid.UUID,
    before: int | None,
    after: int | None,
    limit: int,
) -> MessagePage:
    app = await _application(session, user, aid)
    query = select(ChatMessage).where(ChatMessage.application_id == aid)
    if before is not None:
        query = query.where(ChatMessage.sequence < before)
    if after is not None:
        query = query.where(ChatMessage.sequence > after)
    query = query.order_by(
        ChatMessage.sequence.asc() if after is not None else ChatMessage.sequence.desc()
    )
    rows = list(await session.scalars(query.limit(limit + 1)))
    more = len(rows) > limit
    rows = rows[:limit]
    if after is None:
        rows.reverse()
    return MessagePage(
        thread=await _thread(session, user, app),
        items=[MessageOut.model_validate(m) for m in rows],
        has_more=more,
    )


async def send(session: AsyncSession, user: User, aid: uuid.UUID, data: MessageIn) -> MessageOut:
    await _application(session, user, aid, lock=True)
    existing = await session.scalar(
        select(ChatMessage).where(
            ChatMessage.application_id == aid,
            ChatMessage.sender_id == user.id,
            ChatMessage.client_id == data.client_id,
        )
    )
    if existing is not None:
        return MessageOut.model_validate(existing)
    message = ChatMessage(
        application_id=aid, sender_id=user.id, client_id=data.client_id, text=data.text
    )
    session.add(message)
    await session.commit()
    await session.refresh(message)
    return MessageOut.model_validate(message)


async def mark_read(session: AsyncSession, user: User, aid: uuid.UUID, sequence: int) -> None:
    await _application(session, user, aid)
    exists = await session.scalar(
        select(ChatMessage.id).where(
            ChatMessage.application_id == aid, ChatMessage.sequence == sequence
        )
    )
    if exists is None:
        raise NotFoundError("Message not found")
    statement = insert(ChatRead).values(application_id=aid, user_id=user.id, last_sequence=sequence)
    await session.execute(
        statement.on_conflict_do_update(
            index_elements=[ChatRead.application_id, ChatRead.user_id],
            set_={"last_sequence": func.greatest(ChatRead.last_sequence, sequence)},
        )
    )
    await session.commit()
