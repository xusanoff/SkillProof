"""arq worker entrypoint: `arq app.workers.worker.WorkerSettings`."""

import logging
import uuid
from typing import Any, ClassVar

from arq import cron, func
from arq.connections import RedisSettings

from app.core.config import get_settings
from app.core.logging import configure_logging

logger = logging.getLogger(__name__)


async def ping(ctx: dict[str, Any]) -> str:
    return "pong"


async def generate_assessment_items(ctx: dict[str, Any], job_id: str) -> None:
    from app.ai.llm_client import get_llm_client
    from app.core.db import SessionLocal
    from app.sandbox.client import get_sandbox
    from app.services.assessments import run_generation

    async with SessionLocal() as session:
        await run_generation(session, uuid.UUID(job_id), get_llm_client(), get_sandbox())


async def evaluate_stage1(ctx: dict[str, Any], session_id: str) -> None:
    from app.ai.llm_client import get_llm_client
    from app.core.db import SessionLocal
    from app.sandbox.client import get_sandbox
    from app.services.stage1_evaluation import evaluate_session

    async with SessionLocal() as session:
        await evaluate_session(session, uuid.UUID(session_id), get_llm_client(), get_sandbox())


async def sweep_stage1(ctx: dict[str, Any]) -> None:
    from app.core.db import SessionLocal
    from app.services.stage1_evaluation import sessions_to_process

    async with SessionLocal() as session:
        due = await sessions_to_process(session)
    for session_id in due:
        await ctx["redis"].enqueue_job(
            "evaluate_stage1", str(session_id), _job_id=f"eval-{session_id}"
        )


async def startup(ctx: dict[str, Any]) -> None:
    configure_logging(get_settings().log_level)
    logger.info("worker_started")


class WorkerSettings:
    functions: ClassVar[list[Any]] = [
        ping,
        generate_assessment_items,
        # keep_result=0: a stored result would block the retry that reuses this job id.
        func(evaluate_stage1, keep_result=0),
    ]
    cron_jobs: ClassVar[list[Any]] = [cron(sweep_stage1, second={0, 15, 30, 45})]
    job_timeout = 600
    on_startup = startup
    redis_settings = RedisSettings.from_dsn(get_settings().redis_url)
