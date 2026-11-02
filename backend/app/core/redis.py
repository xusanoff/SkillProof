from redis.asyncio import Redis

from app.core.config import get_settings

redis_client: Redis = Redis.from_url(get_settings().redis_url, socket_timeout=2)


async def check_redis() -> bool:
    return bool(await redis_client.ping())
