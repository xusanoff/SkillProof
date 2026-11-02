import uuid

from arq import create_pool
from arq.connections import ArqRedis, RedisSettings

from app.core.config import get_settings

_pool: ArqRedis | None = None


class ArqJobQueue:
    async def enqueue(self, job_id: uuid.UUID) -> None:
        global _pool
        if _pool is None:
            _pool = await create_pool(RedisSettings.from_dsn(get_settings().redis_url))
        await _pool.enqueue_job("generate_assessment_items", str(job_id))


def get_job_queue() -> ArqJobQueue:
    return ArqJobQueue()
