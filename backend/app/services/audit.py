import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AuditLog


def record(
    session: AsyncSession,
    actor_id: uuid.UUID | None,
    action: str,
    entity_type: str,
    entity_id: uuid.UUID | str,
    diff: dict[str, Any] | None = None,
) -> None:
    session.add(
        AuditLog(
            actor_id=actor_id,
            action=action,
            entity_type=entity_type,
            entity_id=str(entity_id),
            diff=diff or {},
        )
    )
