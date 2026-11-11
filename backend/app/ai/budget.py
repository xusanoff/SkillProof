"""Durable AI reservations shared by an application's stages and report."""

import logging
import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from contextvars import ContextVar
from typing import Literal

from sqlalchemy import text
from sqlalchemy.dialects.postgresql import insert

from app.core.db import SessionLocal
from app.core.thresholds import BudgetThresholds
from app.models.platform import AiBudget

logger = logging.getLogger(__name__)
_current: ContextVar[tuple[uuid.UUID, BudgetThresholds] | None] = ContextVar(
    "ai_budget", default=None
)
Resource = Literal["tokens", "stt_ms", "tts_characters"]


class BudgetExceeded(Exception):
    """Use the provider-failure fallback without spending more."""


@contextmanager
def scope(application_id: uuid.UUID, limits: BudgetThresholds) -> Iterator[None]:
    token = _current.set((application_id, limits))
    try:
        yield
    finally:
        _current.reset(token)


async def reserve(resource: Resource, amount: int) -> None:
    context = _current.get()
    if context is None or amount == 0:
        return
    if amount < 0:
        raise ValueError("negative AI reservation")
    application_id, limits = context
    limit = {
        "tokens": limits.token_limit,
        "stt_ms": limits.stt_seconds_limit * 1000,
        "tts_characters": limits.tts_characters_limit,
    }[resource]
    if amount > limit:
        raise BudgetExceeded(f"AI budget exhausted: {resource}")
    column = getattr(AiBudget, resource)
    statement = insert(AiBudget).values(application_id=application_id, **{resource: amount})
    reservation = statement.on_conflict_do_update(
        index_elements=[AiBudget.application_id],
        set_={resource: column + amount},
        where=column + amount <= limit,
    ).returning(AiBudget.application_id)
    try:
        async with SessionLocal() as session:
            await session.execute(text("SET LOCAL statement_timeout = '3000ms'"))
            accepted = (await session.execute(reservation)).scalar_one_or_none()
            await session.commit()
    except Exception as exc:
        logger.warning("ai_budget_unavailable", extra={"error": type(exc).__name__})
        raise BudgetExceeded("AI budget unavailable") from None
    if accepted is None:
        logger.info("ai_budget_exhausted", extra={"resource": resource})
        raise BudgetExceeded(f"AI budget exhausted: {resource}")
