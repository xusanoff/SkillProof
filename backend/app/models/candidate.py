import uuid
from datetime import datetime

from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base
from app.models.base import Timestamps


class CandidateProfile(Timestamps, Base):
    __tablename__ = "candidate_profiles"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    headline: Mapped[str | None] = mapped_column(String(200))
    country: Mapped[str | None] = mapped_column(String(2))
    city: Mapped[str | None] = mapped_column(String(120))
    experience_years: Mapped[int | None] = mapped_column(Integer)
    about: Mapped[str | None] = mapped_column(Text)
    desired_salary_min: Mapped[int | None] = mapped_column(BigInteger)
    desired_salary_max: Mapped[int | None] = mapped_column(BigInteger)
    currency: Mapped[str] = mapped_column(String(3), default="UZS")
    open_to_work: Mapped[bool] = mapped_column(Boolean, default=True)
    # Resume file (spec: resume_file_url) — we store the storage key + metadata.
    resume_key: Mapped[str | None] = mapped_column(String(500))
    resume_filename: Mapped[str | None] = mapped_column(String(255))
    resume_content_type: Mapped[str | None] = mapped_column(String(120))
    resume_size_bytes: Mapped[int | None] = mapped_column(Integer)
    resume_uploaded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
