"""Records what AI calls took and cost (spec §9). Never fails the call it describes."""

import logging
from dataclasses import dataclass

from app.core.config import get_settings
from app.core.db import SessionLocal
from app.models.platform import AiUsage

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class Call:
    kind: str
    provider: str
    model: str = ""
    role: str = ""
    input_tokens: int = 0
    output_tokens: int = 0
    seconds: float = 0.0
    characters: int = 0
    latency_ms: int = 0
    outcome: str = "ok"


def estimate_cost(call: Call) -> float | None:
    """LLM prices are per model, speech prices per provider. None when no price is set."""
    prices = get_settings().ai_prices
    price = prices.get(call.model) or prices.get(call.provider)
    if price is None:
        return None
    return round(
        call.input_tokens / 1_000_000 * price.input_per_mtok
        + call.output_tokens / 1_000_000 * price.output_per_mtok
        + call.seconds / 60 * price.per_minute
        + call.characters / 1_000_000 * price.per_mchar,
        6,
    )


async def record(call: Call) -> None:
    try:
        async with SessionLocal() as session:
            session.add(
                AiUsage(
                    kind=call.kind,
                    provider=call.provider,
                    model=call.model[:120],
                    role=call.role[:60],
                    input_tokens=call.input_tokens,
                    output_tokens=call.output_tokens,
                    seconds=call.seconds,
                    characters=call.characters,
                    latency_ms=call.latency_ms,
                    outcome=call.outcome,
                    cost_usd=estimate_cost(call),
                )
            )
            await session.commit()
    except Exception as exc:
        logger.warning("ai_usage_not_recorded", extra={"error": type(exc).__name__})
