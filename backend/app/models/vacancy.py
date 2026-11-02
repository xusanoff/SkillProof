import uuid
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Computed,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import TSVECTOR
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base
from app.models.base import CreatedAt, Timestamps, UUIDPk
from app.models.enums import (
    ApplicationStatus,
    EmploymentType,
    ExperienceLevel,
    RemoteType,
    VacancyStatus,
)
from app.models.user import str_enum

# 'simple' config: no language-specific stemming, so uz/ru/en text is indexed the same way.
_SEARCH_EXPR = (
    "setweight(to_tsvector('simple', coalesce(title, '')), 'A') || "
    "setweight(to_tsvector('simple', coalesce(skills_text, '')), 'A') || "
    "setweight(to_tsvector('simple', coalesce(requirements, '')), 'B') || "
    "setweight(to_tsvector('simple', coalesce(description, '')), 'C')"
)


class Vacancy(UUIDPk, Timestamps, Base):
    __tablename__ = "vacancies"
    __table_args__ = (
        Index("ix_vacancies_search", "search_vector", postgresql_using="gin"),
        Index("ix_vacancies_status_published", "status", "published_at"),
        CheckConstraint(
            "salary_min IS NULL OR salary_max IS NULL OR salary_min <= salary_max",
            name="salary_range",
        ),
    )

    company_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("companies.id", ondelete="CASCADE"), index=True
    )
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    requirements: Mapped[str | None] = mapped_column(Text)
    profession_area: Mapped[str] = mapped_column(ForeignKey("profession_areas.slug"), index=True)
    country: Mapped[str] = mapped_column(String(2), default="UZ")
    region_code: Mapped[str | None] = mapped_column(ForeignKey("regions.code"), index=True)
    city: Mapped[str | None] = mapped_column(String(120))
    remote_type: Mapped[RemoteType] = mapped_column(str_enum(RemoteType))
    employment_type: Mapped[EmploymentType] = mapped_column(str_enum(EmploymentType))
    experience_level: Mapped[ExperienceLevel] = mapped_column(str_enum(ExperienceLevel))
    salary_min: Mapped[int | None] = mapped_column(BigInteger)
    salary_max: Mapped[int | None] = mapped_column(BigInteger)
    currency: Mapped[str] = mapped_column(String(3), default="UZS")
    status: Mapped[VacancyStatus] = mapped_column(
        str_enum(VacancyStatus), default=VacancyStatus.draft
    )
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    # Space-joined skill names, kept in sync by services.vacancies so skills are searchable.
    skills_text: Mapped[str] = mapped_column(Text, default="")
    search_vector: Mapped[str] = mapped_column(
        TSVECTOR, Computed(_SEARCH_EXPR, persisted=True), deferred=True
    )


class VacancySkill(Base):
    __tablename__ = "vacancy_skills"
    __table_args__ = (CheckConstraint("weight BETWEEN 1 AND 5", name="weight_range"),)

    vacancy_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("vacancies.id", ondelete="CASCADE"), primary_key=True
    )
    skill_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("skills.id", ondelete="CASCADE"), primary_key=True, index=True
    )
    weight: Mapped[int] = mapped_column(SmallInteger, default=3)
    is_required: Mapped[bool] = mapped_column(Boolean, default=False)


class Application(UUIDPk, Timestamps, Base):
    __tablename__ = "applications"
    __table_args__ = (UniqueConstraint("vacancy_id", "candidate_id"),)

    vacancy_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("vacancies.id", ondelete="CASCADE"), index=True
    )
    candidate_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    cover_note: Mapped[str | None] = mapped_column(Text)
    status: Mapped[ApplicationStatus] = mapped_column(
        str_enum(ApplicationStatus), default=ApplicationStatus.applied
    )
    # Filled from Phase 5-7 on (spec §5).
    final_score: Mapped[float | None] = mapped_column()
    suspicion_percent: Mapped[int | None] = mapped_column(Integer)
    suspicion_label: Mapped[str | None] = mapped_column(String(16))
    disqualification_reason: Mapped[str | None] = mapped_column(String(32))
    # HR has opened the application at least once (for "+N new" badges).
    seen_by_hr_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class SavedVacancy(CreatedAt, Base):
    __tablename__ = "saved_vacancies"

    candidate_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    vacancy_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("vacancies.id", ondelete="CASCADE"), primary_key=True, index=True
    )
