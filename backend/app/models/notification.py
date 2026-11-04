"""Notification outbox (spec §5, Phase 9).

A row is written in the same transaction as the status change it announces, so a change
can neither lose its notification nor announce something that was rolled back.
"""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, event, func, inspect, text
from sqlalchemy.orm import Mapped, Session, mapped_column, relationship

from app.core.db import Base
from app.models.base import CreatedAt, UUIDPk
from app.models.enums import (
    ApplicationStatus,
    NotificationChannel,
    NotificationEvent,
    NotificationStatus,
)
from app.models.user import str_enum
from app.models.vacancy import Application


class Notification(UUIDPk, CreatedAt, Base):
    """Without a recipient the row is a raw event; the worker expands it per person and channel."""

    __tablename__ = "notifications"
    __table_args__ = (
        Index(
            "ix_notifications_due",
            "next_attempt_at",
            postgresql_where=text("status = 'pending'"),
        ),
    )

    application_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("applications.id", ondelete="CASCADE"), index=True
    )
    event: Mapped[NotificationEvent] = mapped_column(str_enum(NotificationEvent))
    recipient_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    channel: Mapped[NotificationChannel | None] = mapped_column(str_enum(NotificationChannel))
    status: Mapped[NotificationStatus] = mapped_column(
        str_enum(NotificationStatus), default=NotificationStatus.pending
    )
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    next_attempt_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    # The exception's class name only: messages can carry a bot token or an address.
    last_error: Mapped[str | None] = mapped_column(String(64))
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Also orders the flush: a new application is inserted before its outbox row.
    application: Mapped[Application] = relationship(lazy="raise", passive_deletes=True)


STATUS_EVENTS: dict[ApplicationStatus, tuple[NotificationEvent, ...]] = {
    ApplicationStatus.applied: (NotificationEvent.new_applicant, NotificationEvent.stage1_invite),
    ApplicationStatus.stage1_failed: (NotificationEvent.stage1_failed,),
    ApplicationStatus.stage1_disqualified: (NotificationEvent.disqualified,),
    ApplicationStatus.stage2_pending: (NotificationEvent.stage2_invite,),
    ApplicationStatus.stage2_disqualified: (NotificationEvent.disqualified,),
    ApplicationStatus.evaluated: (NotificationEvent.results_ready, NotificationEvent.report_ready),
    ApplicationStatus.shortlisted: (NotificationEvent.shortlisted,),
    ApplicationStatus.rejected: (NotificationEvent.rejected,),
    ApplicationStatus.hired: (NotificationEvent.hired,),
}


@event.listens_for(Session, "before_flush")
def _announce_status_changes(session: Session, _context: Any, _instances: Any) -> None:
    """Status is set in many services; watching it here means no transition can be forgotten."""
    for obj in (*session.new, *session.dirty):
        if not isinstance(obj, Application):
            continue
        if obj in session.dirty and not inspect(obj).attrs.status.history.has_changes():
            continue
        for name in STATUS_EVENTS.get(obj.status, ()):
            session.add(Notification(application=obj, event=name))
