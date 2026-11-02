"""Reference data kept in the database, not in code (spec §1.1: countries/cities are data)."""

from typing import Any

from sqlalchemy import Integer, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base
from app.models.base import UUIDPk


class Region(Base):
    __tablename__ = "regions"

    code: Mapped[str] = mapped_column(String(10), primary_key=True)  # ISO 3166-2, e.g. UZ-TK
    country: Mapped[str] = mapped_column(String(2), index=True)
    names: Mapped[dict[str, Any]] = mapped_column(JSONB)  # {"uz": ..., "ru": ..., "en": ...}
    sort_order: Mapped[int] = mapped_column(Integer, default=0)


class ProfessionArea(Base):
    __tablename__ = "profession_areas"

    slug: Mapped[str] = mapped_column(String(60), primary_key=True)
    names: Mapped[dict[str, Any]] = mapped_column(JSONB)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)


class Skill(UUIDPk, Base):
    __tablename__ = "skills"

    name: Mapped[str] = mapped_column(String(100))
    slug: Mapped[str] = mapped_column(String(100), unique=True)
    category: Mapped[str] = mapped_column(String(60), index=True)
