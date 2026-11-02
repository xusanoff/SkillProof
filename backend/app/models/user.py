import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base
from app.models.base import CreatedAt, Timestamps, UUIDPk
from app.models.enums import TokenPurpose, UserRole


def str_enum(enum: type) -> Enum:
    """Enums are stored as varchar + CHECK (not native PG enums) so values are cheap to add."""
    return Enum(enum, native_enum=False, length=32, values_callable=lambda e: [m.value for m in e])


class User(UUIDPk, Timestamps, Base):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(320), unique=True)  # stored lower-cased
    password_hash: Mapped[str] = mapped_column(String(255))
    full_name: Mapped[str] = mapped_column(String(200))
    role: Mapped[UserRole] = mapped_column(str_enum(UserRole))
    locale: Mapped[str] = mapped_column(String(8), default="uz")
    timezone: Mapped[str] = mapped_column(String(64), default="Asia/Tashkent")
    is_email_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class AuthToken(UUIDPk, CreatedAt, Base):
    """Single-use opaque tokens; only the SHA-256 hash is stored."""

    __tablename__ = "auth_tokens"
    __table_args__ = (Index("ix_auth_tokens_user_purpose", "user_id", "purpose"),)

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    purpose: Mapped[TokenPurpose] = mapped_column(str_enum(TokenPurpose))
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
