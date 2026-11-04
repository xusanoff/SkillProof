"""A candidate's reusable, platform-wide result for one skill (spec §5, Phase 8)."""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base
from app.models.base import Timestamps, UUIDPk


class VerifiedSkill(UUIDPk, Timestamps, Base):
    """One row per candidate and skill. The stage scores say what may be reused: a skill checked
    only orally never replaces a coding task (D-131)."""

    __tablename__ = "verified_skills"
    __table_args__ = (UniqueConstraint("candidate_id", "skill_id"),)

    candidate_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    skill_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("skills.id", ondelete="CASCADE"), index=True
    )
    score: Mapped[float] = mapped_column()
    stage1_score: Mapped[float | None] = mapped_column()
    stage2_score: Mapped[float | None] = mapped_column()
    level: Mapped[str] = mapped_column(String(16))
    source_application_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("applications.id", ondelete="SET NULL")
    )
    verified_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    valid_until: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    is_public: Mapped[bool] = mapped_column(Boolean, default=False)
