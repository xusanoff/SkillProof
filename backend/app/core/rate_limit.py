"""Fixed-window rate limiting backed by Redis (spec §9: auth and interview endpoints)."""

import time
from typing import Protocol

from app.core.errors import AppError
from app.core.redis import redis_client


class RateLimitBackend(Protocol):
    async def hit(self, key: str, window_s: int) -> int: ...


class RedisRateLimitBackend:
    async def hit(self, key: str, window_s: int) -> int:
        bucket = f"rl:{key}:{int(time.time() // window_s)}"
        pipe = redis_client.pipeline()
        pipe.incr(bucket)
        pipe.expire(bucket, window_s)
        count, _ = await pipe.execute()
        return int(count)


class MemoryRateLimitBackend:
    def __init__(self) -> None:
        self.counts: dict[str, int] = {}

    async def hit(self, key: str, window_s: int) -> int:
        bucket = f"{key}:{int(time.time() // window_s)}"
        self.counts[bucket] = self.counts.get(bucket, 0) + 1
        return self.counts[bucket]


class RateLimiter:
    def __init__(self, backend: RateLimitBackend) -> None:
        self.backend = backend

    async def check(self, scope: str, identity: str, rule: str) -> None:
        """`rule` is "<count>/<seconds>". Raises 429 rate_limited when exceeded."""
        limit, window = (int(x) for x in rule.split("/"))
        if await self.backend.hit(f"{scope}:{identity}", window) > limit:
            raise AppError("rate_limited", "Too many requests, try again later", 429)


_limiter = RateLimiter(RedisRateLimitBackend())


def get_rate_limiter() -> RateLimiter:
    return _limiter
