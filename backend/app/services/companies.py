"""Companies, membership and HR invitations. Every member-scoped read goes through
`get_membership`, so HR of company A can never reach company B (spec Phase 1)."""

import re
import secrets
import unicodedata
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.errors import AppError, NotFoundError, PermissionDeniedError
from app.core.security import hash_token, new_opaque_token
from app.models import Company, CompanyInvitation, CompanyMember, User
from app.models.enums import MemberRole, UserRole
from app.schemas.company import (
    CompanyCreate,
    CompanyOut,
    CompanyPublic,
    CompanyUpdate,
    InvitationCompany,
    InvitationOut,
    InvitationPublic,
    MemberOut,
)
from app.services import audit
from app.services.email import EmailSender, render, send_best_effort
from app.services.files import check_size, detect_image
from app.services.storage import Storage


def _now() -> datetime:
    return datetime.now(UTC)


def logo_url(company: Company) -> str | None:
    if not company.logo_key:
        return None
    # The key's random part changes on every upload, so it doubles as a cache buster.
    return f"/api/v1/companies/{company.id}/logo?v={company.logo_key.rsplit('/', 1)[-1][:8]}"


def to_public(company: Company) -> CompanyPublic:
    return CompanyPublic(
        id=company.id,
        name=company.name,
        slug=company.slug,
        description=company.description,
        website=company.website,
        industry=company.industry,
        country=company.country,
        city=company.city,
        logo_url=logo_url(company),
        is_verified=company.is_verified,
        created_at=company.created_at,
    )


def to_out(company: Company, role: MemberRole) -> CompanyOut:
    return CompanyOut(**to_public(company).model_dump(), member_role=role)


_APOSTROPHES = str.maketrans("", "", "'\u02bb\u02bc\u2018\u2019`")


def slugify(name: str) -> str:
    # Uzbek Latin apostrophes (o', g', ma'lumot) belong to the letter: drop them, don't split.
    ascii_name = (
        unicodedata.normalize("NFKD", name.translate(_APOSTROPHES))
        .encode("ascii", "ignore")
        .decode()
    )
    slug = re.sub(r"[^a-z0-9]+", "-", ascii_name.lower()).strip("-")[:60]
    return slug or "company"


async def _unique_slug(session: AsyncSession, name: str) -> str:
    base = slugify(name)
    slug = base
    while await session.scalar(select(Company.id).where(Company.slug == slug)):
        slug = f"{base}-{secrets.token_hex(2)}"
    return slug


async def get_membership(
    session: AsyncSession, company_id: uuid.UUID, user: User, *, owner: bool = False
) -> tuple[Company, MemberRole]:
    """Non-members get 404 (no existence leak); non-owners get 403 on owner actions."""
    row = (
        await session.execute(
            select(Company, CompanyMember.member_role)
            .join(CompanyMember, CompanyMember.company_id == Company.id)
            .where(Company.id == company_id, CompanyMember.user_id == user.id)
        )
    ).first()
    if row is None:
        raise NotFoundError("Company not found")
    company, role = row
    if owner and role is not MemberRole.owner:
        raise PermissionDeniedError("Only the company owner can do this")
    return company, role


async def create_company(session: AsyncSession, user: User, data: CompanyCreate) -> CompanyOut:
    if user.role is not UserRole.hr:
        raise PermissionDeniedError("Only employer accounts can create companies")
    values = data.model_dump(mode="json")
    company = Company(**values, slug=await _unique_slug(session, data.name))
    session.add(company)
    await session.flush()
    session.add(CompanyMember(company_id=company.id, user_id=user.id, member_role=MemberRole.owner))
    audit.record(session, user.id, "company.create", "company", company.id, {"name": data.name})
    await session.commit()
    await session.refresh(company)
    return to_out(company, MemberRole.owner)


async def list_mine(session: AsyncSession, user: User) -> list[CompanyOut]:
    rows = await session.execute(
        select(Company, CompanyMember.member_role)
        .join(CompanyMember, CompanyMember.company_id == Company.id)
        .where(CompanyMember.user_id == user.id)
        .order_by(Company.name)
    )
    return [to_out(c, r) for c, r in rows.all()]


async def get_by_slug(session: AsyncSession, slug: str) -> CompanyPublic:
    company = await session.scalar(select(Company).where(Company.slug == slug))
    if company is None:
        raise NotFoundError("Company not found")
    return to_public(company)


async def update_company(
    session: AsyncSession, company_id: uuid.UUID, user: User, data: CompanyUpdate
) -> CompanyOut:
    company, role = await get_membership(session, company_id, user)
    changes = data.model_dump(mode="json", exclude_unset=True)
    if changes.get("name") is None:
        changes.pop("name", None)  # name is required; null means "unchanged"
    for field, value in changes.items():
        setattr(company, field, value)
    audit.record(session, user.id, "company.update", "company", company.id, changes)
    await session.commit()
    await session.refresh(company)
    return to_out(company, role)


async def set_logo(
    session: AsyncSession,
    company_id: uuid.UUID,
    user: User,
    data: bytes,
    storage: Storage,
) -> CompanyOut:
    company, role = await get_membership(session, company_id, user)
    check_size(data, get_settings().logo_max_bytes)
    kind = detect_image(data)
    old_key = company.logo_key
    company.logo_key = await storage.save(f"logos/{company.id}", kind.extension, data)
    audit.record(session, user.id, "company.logo", "company", company.id)
    await session.commit()
    if old_key:
        await storage.delete(old_key)
    await session.refresh(company)
    return to_out(company, role)


async def read_logo(
    session: AsyncSession, company_id: uuid.UUID, storage: Storage
) -> tuple[bytes, str]:
    company = await session.get(Company, company_id)
    if company is None or not company.logo_key:
        raise NotFoundError("Logo not found")
    ext = company.logo_key.rsplit(".", 1)[-1]
    content_type = {"png": "image/png", "jpg": "image/jpeg", "webp": "image/webp"}[ext]
    return await storage.read(company.logo_key), content_type


async def list_members(session: AsyncSession, company_id: uuid.UUID, user: User) -> list[MemberOut]:
    await get_membership(session, company_id, user)
    rows = await session.execute(
        select(User, CompanyMember)
        .join(CompanyMember, CompanyMember.user_id == User.id)
        .where(CompanyMember.company_id == company_id)
        .order_by(CompanyMember.created_at)
    )
    return [
        MemberOut(
            user_id=u.id,
            email=u.email,
            full_name=u.full_name,
            member_role=m.member_role,
            joined_at=m.created_at,
        )
        for u, m in rows.all()
    ]


async def remove_member(
    session: AsyncSession, company_id: uuid.UUID, user: User, member_user_id: uuid.UUID
) -> None:
    await get_membership(session, company_id, user, owner=True)
    member = await session.get(CompanyMember, (company_id, member_user_id))
    if member is None:
        raise NotFoundError("Member not found")
    if member.member_role is MemberRole.owner:
        owners = await session.scalar(
            select(func.count())
            .select_from(CompanyMember)
            .where(
                CompanyMember.company_id == company_id,
                CompanyMember.member_role == MemberRole.owner,
            )
        )
        if (owners or 0) <= 1:
            raise AppError("last_owner", "A company must keep at least one owner", 409)
    await session.delete(member)
    audit.record(
        session,
        user.id,
        "company.member_remove",
        "company",
        company_id,
        {"user_id": str(member_user_id)},
    )
    await session.commit()


def _invitation_status(inv: CompanyInvitation) -> str:
    if inv.accepted_at:
        return "accepted"
    if inv.revoked_at:
        return "revoked"
    if inv.expires_at <= _now():
        return "expired"
    return "pending"


async def create_invitation(
    session: AsyncSession,
    company_id: uuid.UUID,
    user: User,
    email: str,
    sender: EmailSender,
) -> InvitationOut:
    company, _ = await get_membership(session, company_id, user, owner=True)
    email = email.lower()
    already_member = await session.scalar(
        select(CompanyMember.user_id)
        .join(User, User.id == CompanyMember.user_id)
        .where(CompanyMember.company_id == company_id, User.email == email)
    )
    if already_member:
        raise AppError("already_member", "This person is already in the team", 409)
    pending = await session.scalar(
        select(CompanyInvitation.id).where(
            CompanyInvitation.company_id == company_id,
            CompanyInvitation.email == email,
            CompanyInvitation.accepted_at.is_(None),
            CompanyInvitation.revoked_at.is_(None),
            CompanyInvitation.expires_at > _now(),
        )
    )
    if pending:
        raise AppError("invitation_pending", "An invitation was already sent to this email", 409)
    raw, digest = new_opaque_token()
    settings = get_settings()
    inv = CompanyInvitation(
        company_id=company_id,
        email=email,
        member_role=MemberRole.hr,
        token_hash=digest,
        invited_by=user.id,
        expires_at=_now() + timedelta(days=settings.invitation_days),
    )
    session.add(inv)
    await session.flush()
    audit.record(session, user.id, "company.invite", "company", company_id, {"email": email})
    await session.commit()
    link = f"{settings.frontend_url}/{user.locale}/invitations/{raw}"
    await send_best_effort(
        sender, render("company_invitation", user.locale, email, company=company.name, link=link)
    )
    await session.refresh(inv)
    return _invitation_out(inv, user.full_name)


def _invitation_out(inv: CompanyInvitation, invited_by_name: str | None) -> InvitationOut:
    return InvitationOut(
        id=inv.id,
        email=inv.email,
        member_role=inv.member_role,
        invited_by_name=invited_by_name,
        created_at=inv.created_at,
        expires_at=inv.expires_at,
    )


async def list_invitations(
    session: AsyncSession, company_id: uuid.UUID, user: User
) -> list[InvitationOut]:
    await get_membership(session, company_id, user, owner=True)
    rows = await session.execute(
        select(CompanyInvitation, User.full_name)
        .outerjoin(User, User.id == CompanyInvitation.invited_by)
        .where(
            CompanyInvitation.company_id == company_id,
            CompanyInvitation.accepted_at.is_(None),
            CompanyInvitation.revoked_at.is_(None),
            CompanyInvitation.expires_at > _now(),
        )
        .order_by(CompanyInvitation.created_at.desc())
    )
    return [_invitation_out(inv, name) for inv, name in rows.all()]


async def revoke_invitation(
    session: AsyncSession, company_id: uuid.UUID, user: User, invitation_id: uuid.UUID
) -> None:
    await get_membership(session, company_id, user, owner=True)
    inv = await session.get(CompanyInvitation, invitation_id)
    if inv is None or inv.company_id != company_id:
        raise NotFoundError("Invitation not found")
    inv.revoked_at = inv.revoked_at or _now()
    audit.record(
        session, user.id, "company.invite_revoke", "company", company_id, {"email": inv.email}
    )
    await session.commit()


async def _invitation_by_token(session: AsyncSession, raw: str) -> CompanyInvitation:
    inv = await session.scalar(
        select(CompanyInvitation).where(CompanyInvitation.token_hash == hash_token(raw))
    )
    if inv is None:
        raise NotFoundError("Invitation not found")
    return inv


async def get_invitation(session: AsyncSession, raw: str) -> InvitationPublic:
    inv = await _invitation_by_token(session, raw)
    company = await session.get(Company, inv.company_id)
    assert company is not None
    return InvitationPublic(
        company=InvitationCompany(name=company.name, slug=company.slug, logo_url=logo_url(company)),
        email=inv.email,
        status=_invitation_status(inv),
    )


async def accept_invitation(session: AsyncSession, raw: str, user: User) -> CompanyOut:
    inv = await _invitation_by_token(session, raw)
    status = _invitation_status(inv)
    if status == "expired":
        raise AppError("invitation_expired", "This invitation has expired", 410)
    if status != "pending":
        raise AppError("invitation_used", "This invitation is no longer valid", 410)
    if user.email != inv.email:
        raise AppError("email_mismatch", "Sign in with the email the invitation was sent to", 403)
    if user.role is not UserRole.hr:
        raise AppError("role_mismatch", "Only employer accounts can join a company", 403)
    if await session.get(CompanyMember, (inv.company_id, user.id)) is None:
        session.add(
            CompanyMember(company_id=inv.company_id, user_id=user.id, member_role=inv.member_role)
        )
    inv.accepted_at = _now()
    audit.record(session, user.id, "company.join", "company", inv.company_id)
    await session.commit()
    company = await session.get(Company, inv.company_id)
    assert company is not None
    return to_out(company, inv.member_role)
