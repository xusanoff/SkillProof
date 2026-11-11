"""One durable conversation per application, including automatic status events."""

import uuid
from typing import Any

from sqlalchemy import (
    BigInteger,
    ForeignKey,
    Identity,
    Index,
    String,
    Text,
    UniqueConstraint,
    event,
    inspect,
)
from sqlalchemy.orm import Mapped, Session, mapped_column, relationship

from app.core.db import Base
from app.models.base import CreatedAt, UUIDPk
from app.models.vacancy import Application


class ChatMessage(UUIDPk, CreatedAt, Base):
    __tablename__ = "chat_messages"
    __table_args__ = (
        Index("ix_chat_messages_thread_sequence", "application_id", "sequence"),
        UniqueConstraint("application_id", "sender_id", "client_id", name="uq_chat_message_retry"),
    )
    application_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("applications.id", ondelete="CASCADE")
    )
    sequence: Mapped[int] = mapped_column(BigInteger, Identity(), unique=True)
    sender_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    client_id: Mapped[uuid.UUID | None]
    kind: Mapped[str] = mapped_column(String(24), default="message")
    text: Mapped[str | None] = mapped_column(Text)
    application_status: Mapped[str | None] = mapped_column(String(40))
    application: Mapped[Application] = relationship(lazy="raise")


class ChatRead(Base):
    __tablename__ = "chat_reads"
    application_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("applications.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    last_sequence: Mapped[int] = mapped_column(BigInteger, default=0)


@event.listens_for(Session, "before_flush")
def announce_chat_status(session: Session, _context: Any, _instances: Any) -> None:
    for app in (*session.new, *session.dirty):
        if not isinstance(app, Application):
            continue
        if app in session.dirty and not inspect(app).attrs.status.history.has_changes():
            continue
        session.add(
            ChatMessage(
                application=app, kind="status", application_status=str(app.status or "applied")
            )
        )
