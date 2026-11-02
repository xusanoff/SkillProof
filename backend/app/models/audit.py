import uuid
from typing import Any

from sqlalchemy import ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base
from app.models.base import CreatedAt, UUIDPk


class AuditLog(UUIDPk, CreatedAt, Base):
    __tablename__ = "audit_log"

    actor_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    action: Mapped[str] = mapped_column(String(80))
    entity_type: Mapped[str] = mapped_column(String(60))
    entity_id: Mapped[str] = mapped_column(String(64), index=True)
    diff: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
