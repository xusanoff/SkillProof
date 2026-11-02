"""Registration, login, refresh rotation, email verification and password reset."""

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.errors import AppError
from app.core.security import (
    create_access_token,
    hash_password,
    hash_token,
    needs_rehash,
    new_opaque_token,
    verify_password,
)
from app.models import AuthToken, Company, CompanyMember, User
from app.models.enums import TokenPurpose, UserRole
from app.schemas.auth import Me, MeCompany, MeUpdate, RegisterIn
from app.services import audit
from app.services.email import EmailSender, render


@dataclass(frozen=True)
class SessionTokens:
    access_token: str
    refresh_token: str


def _now() -> datetime:
    return datetime.now(UTC)


async def _issue_token(
    session: AsyncSession, user_id: uuid.UUID, purpose: TokenPurpose, ttl: timedelta
) -> str:
    raw, digest = new_opaque_token()
    session.add(
        AuthToken(user_id=user_id, purpose=purpose, token_hash=digest, expires_at=_now() + ttl)
    )
    return raw


async def issue_session(session: AsyncSession, user: User) -> SessionTokens:
    refresh = await _issue_token(
        session, user.id, TokenPurpose.refresh, timedelta(days=get_settings().refresh_token_days)
    )
    return SessionTokens(create_access_token(user.id, user.role.value), refresh)


async def _revoke_all(session: AsyncSession, user_id: uuid.UUID, purpose: TokenPurpose) -> None:
    await session.execute(
        update(AuthToken)
        .where(
            AuthToken.user_id == user_id, AuthToken.purpose == purpose, AuthToken.used_at.is_(None)
        )
        .values(used_at=_now())
    )


async def _send_verification(session: AsyncSession, user: User, sender: EmailSender) -> None:
    settings = get_settings()
    raw = await _issue_token(
        session,
        user.id,
        TokenPurpose.email_verification,
        timedelta(hours=settings.email_verification_hours),
    )
    link = f"{settings.frontend_url}/{user.locale}/verify-email?token={raw}"
    await sender.send(render("verify_email", user.locale, user.email, link=link))


async def register(
    session: AsyncSession, data: RegisterIn, sender: EmailSender
) -> tuple[User, SessionTokens]:
    email = data.email.lower()
    if await session.scalar(select(User.id).where(User.email == email)):
        raise AppError("email_taken", "An account with this email already exists", 409)
    user = User(
        email=email,
        password_hash=hash_password(data.password),
        full_name=data.full_name,
        role=UserRole(data.role),
        locale=data.locale.value,
        timezone=data.timezone,
    )
    session.add(user)
    await session.flush()
    await _send_verification(session, user, sender)
    tokens = await issue_session(session, user)
    audit.record(session, user.id, "user.register", "user", user.id, {"role": data.role})
    await session.commit()
    return user, tokens


async def login(session: AsyncSession, email: str, password: str) -> tuple[User, SessionTokens]:
    user = await session.scalar(select(User).where(User.email == email.lower()))
    if not verify_password(password, user.password_hash if user else None) or user is None:
        raise AppError("invalid_credentials", "Email or password is incorrect", 401)
    if not user.is_active:
        raise AppError("account_disabled", "This account is disabled", 403)
    if needs_rehash(user.password_hash):
        user.password_hash = hash_password(password)
    tokens = await issue_session(session, user)
    await session.commit()
    return user, tokens


async def _consume(session: AsyncSession, raw: str, purpose: TokenPurpose) -> AuthToken | None:
    """Marks a valid token used and returns it; None when unknown, used or expired."""
    token = await session.scalar(
        select(AuthToken)
        .where(AuthToken.token_hash == hash_token(raw), AuthToken.purpose == purpose)
        .with_for_update()
    )
    if token is None:
        return None
    if token.used_at is not None:
        if purpose is TokenPurpose.refresh:
            # A rotated refresh token was replayed: assume theft, end every session.
            await _revoke_all(session, token.user_id, TokenPurpose.refresh)
            await session.commit()
        return None
    if token.expires_at <= _now():
        return None
    token.used_at = _now()
    return token


async def refresh(session: AsyncSession, raw: str | None) -> tuple[User, SessionTokens]:
    token = await _consume(session, raw, TokenPurpose.refresh) if raw else None
    user = await session.get(User, token.user_id) if token else None
    if token is None or user is None or not user.is_active:
        raise AppError("invalid_refresh_token", "Session expired, please sign in again", 401)
    tokens = await issue_session(session, user)
    await session.commit()
    return user, tokens


async def logout(session: AsyncSession, raw: str | None) -> None:
    if not raw:
        return
    token = await session.scalar(select(AuthToken).where(AuthToken.token_hash == hash_token(raw)))
    if token is not None and token.used_at is None:
        token.used_at = _now()
        await session.commit()


async def verify_email(session: AsyncSession, raw: str) -> None:
    token = await _consume(session, raw, TokenPurpose.email_verification)
    if token is None:
        raise AppError("invalid_token", "The link is invalid or has expired", 400)
    user = await session.get(User, token.user_id)
    assert user is not None
    user.is_email_verified = True
    await session.commit()


async def resend_verification(session: AsyncSession, user: User, sender: EmailSender) -> None:
    if user.is_email_verified:
        return
    await _revoke_all(session, user.id, TokenPurpose.email_verification)
    await _send_verification(session, user, sender)
    await session.commit()


async def forgot_password(session: AsyncSession, email: str, sender: EmailSender) -> None:
    user = await session.scalar(select(User).where(User.email == email.lower()))
    if user is None or not user.is_active:
        return  # same response either way: no account enumeration
    settings = get_settings()
    await _revoke_all(session, user.id, TokenPurpose.password_reset)
    raw = await _issue_token(
        session,
        user.id,
        TokenPurpose.password_reset,
        timedelta(minutes=settings.password_reset_minutes),
    )
    link = f"{settings.frontend_url}/{user.locale}/reset-password?token={raw}"
    await sender.send(render("reset_password", user.locale, user.email, link=link))
    await session.commit()


async def reset_password(session: AsyncSession, raw: str, password: str) -> None:
    token = await _consume(session, raw, TokenPurpose.password_reset)
    if token is None:
        raise AppError("invalid_token", "The link is invalid or has expired", 400)
    user = await session.get(User, token.user_id)
    assert user is not None
    user.password_hash = hash_password(password)
    # Whoever could read the reset email owns the mailbox, so the email is verified too.
    user.is_email_verified = True
    await _revoke_all(session, user.id, TokenPurpose.refresh)
    audit.record(session, user.id, "user.password_reset", "user", user.id)
    await session.commit()


async def update_me(session: AsyncSession, user: User, data: MeUpdate) -> User:
    for field, value in data.model_dump(exclude_unset=True, exclude_none=True).items():
        setattr(user, field, value.value if hasattr(value, "value") else value)
    await session.commit()
    return user


async def build_me(session: AsyncSession, user: User) -> Me:
    rows = await session.execute(
        select(Company.id, Company.name, Company.slug, CompanyMember.member_role)
        .join(CompanyMember, CompanyMember.company_id == Company.id)
        .where(CompanyMember.user_id == user.id)
        .order_by(Company.name)
    )
    companies = [MeCompany(id=r[0], name=r[1], slug=r[2], member_role=r[3]) for r in rows]
    return Me(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=user.role,
        locale=user.locale,
        timezone=user.timezone,
        is_email_verified=user.is_email_verified,
        created_at=user.created_at,
        companies=companies,
    )
