from arq.constants import default_queue_name, health_check_key_suffix
from redis.asyncio import Redis

from app.core.config import get_settings

redis_client: Redis = Redis.from_url(get_settings().redis_url, socket_timeout=2)


async def check_redis() -> bool:
    return bool(await redis_client.ping())


async def check_worker() -> bool:
    return bool(await redis_client.exists(default_queue_name + health_check_key_suffix))
