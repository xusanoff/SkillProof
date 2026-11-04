"""Saved interview questions and their audio, so a repeat needs no provider call.

A hit needs the exact same input, so nobody gets a question built from someone else's answer.
Best effort: a cache failure only means asking the provider again.
"""

import hashlib
import json
import logging
from typing import Any

from sqlalchemy import func, update
from sqlalchemy.dialects.postgresql import insert

from app.core.db import SessionLocal
from app.models.platform import QuestionCache

logger = logging.getLogger(__name__)

AUDIO_PREFIX = "tts-cache"


def make_key(*parts: Any) -> str:
    text = json.dumps(parts, ensure_ascii=False, sort_keys=True, default=str)
    return hashlib.sha256(text.encode()).hexdigest()


async def get(key: str) -> dict[str, Any] | None:
    try:
        async with SessionLocal() as session:
            value = await session.scalar(
                update(QuestionCache)
                .where(QuestionCache.key == key)
                .values(hits=QuestionCache.hits + 1, last_used_at=func.now())
                .returning(QuestionCache.value)
            )
            await session.commit()
            return value
    except Exception as exc:
        logger.warning("question_cache_read_failed", extra={"error": type(exc).__name__})
        return None


async def put(key: str, kind: str, value: dict[str, Any]) -> None:
    try:
        async with SessionLocal() as session:
            await session.execute(
                insert(QuestionCache)
                .values(key=key, kind=kind, value=value)
                .on_conflict_do_nothing(index_elements=[QuestionCache.key])
            )
            await session.commit()
    except Exception as exc:
        logger.warning("question_cache_write_failed", extra={"error": type(exc).__name__})
