"""Global thresholds: settings plus what the admin saved (spec §6.4, Phase 10).

Each process keeps a copy and reloads it every 30 seconds, because the many callers are
synchronous. Sessions hold their own snapshot, so a change never alters one in progress.
"""

import logging
from typing import Any

from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.thresholds import Thresholds
from app.models.platform import PlatformSetting

logger = logging.getLogger(__name__)

SETTING_KEY = "thresholds"
RELOAD_SECONDS = 30

_current: Thresholds | None = None


def current_thresholds() -> Thresholds:
    return _current if _current is not None else get_settings().thresholds


def apply_overrides(overrides: dict[str, Any] | None) -> Thresholds:
    """Raises ValidationError on an unknown key or a value out of range."""
    global _current
    _current = get_settings().thresholds.with_overrides(overrides) if overrides else None
    return current_thresholds()


async def reload_thresholds(session: AsyncSession) -> None:
    row = await session.get(PlatformSetting, SETTING_KEY, populate_existing=True)
    try:
        apply_overrides(row.value if row is not None else None)
    except ValidationError:
        # Can follow a release that renamed a threshold: keep running on the previous values.
        logger.error("stored_thresholds_invalid")
