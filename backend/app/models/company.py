import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base
from app.models.base import CreatedAt, Timestamps, UUIDPk
from app.models.enums import MemberRole
from app.models.user import str_enum


class Company(UUIDPk, Timestamps, Base):
    __tablename__ = "companies"

    name: Mapped[str] = mapped_column(String(200))
    slug: Mapped[str] = mapped_column(String(120), unique=True)
    description: Mapped[str | None] = mapped_column(Text)
    logo_key: Mapped[str | None] = mapped_column(String(500))  # storage key; URL is derived
    website: Mapped[str | None] = mapped_column(String(500))
    industry: Mapped[str | None] = mapped_column(String(120))
    country: Mapped[str | None] = mapped_column(String(2))  # ISO 3166-1 alpha-2
    city: Mapped[str | None] = mapped_column(String(120))
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    # Set by a platform admin: the company and its vacancies leave the public site.
    blocked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    block_reason: Mapped[str | None] = mapped_column(String(500))


class CompanyMember(CreatedAt, Base):
    __tablename__ = "company_members"

    company_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("companies.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True, index=True
    )
    member_role: Mapped[MemberRole] = mapped_column(str_enum(MemberRole))


class CompanyInvitation(UUIDPk, CreatedAt, Base):
    __tablename__ = "company_invitations"
    __table_args__ = (Index("ix_company_invitations_company_email", "company_id", "email"),)

    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"))
    email: Mapped[str] = mapped_column(String(320))
    member_role: Mapped[MemberRole] = mapped_column(str_enum(MemberRole), default=MemberRole.hr)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    invited_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
