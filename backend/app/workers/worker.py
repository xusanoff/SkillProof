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


async def sweep_stage2(ctx: dict[str, Any]) -> None:
    from app.core.db import SessionLocal
    from app.services.stage2 import sweep

    async with SessionLocal() as session:
        await sweep(session)


async def finalize_application(ctx: dict[str, Any], application_id: str) -> None:
    from app.ai.llm_client import get_llm_client
    from app.core.db import SessionLocal
    from app.services.reports import finalize

    async with SessionLocal() as session:
        await finalize(session, uuid.UUID(application_id), get_llm_client())


async def sweep_reports(ctx: dict[str, Any]) -> None:
    from app.core.db import SessionLocal
    from app.services.reports import due

    async with SessionLocal() as session:
        applications = await due(session)
    for application_id in applications:
        await ctx["redis"].enqueue_job(
            "finalize_application", str(application_id), _job_id=f"report-{application_id}"
        )


async def deliver_notifications(ctx: dict[str, Any]) -> None:
    from app.core.db import SessionLocal
    from app.services.email import get_email_sender
    from app.services.notifications import deliver_due
    from app.services.telegram import get_telegram_sender

    async with SessionLocal() as session:
        await deliver_due(session, get_email_sender(), get_telegram_sender())


async def purge_expired_data(ctx: dict[str, Any]) -> None:
    from app.core.db import SessionLocal
    from app.services.privacy import purge_expired
    from app.services.storage import get_storage

    async with SessionLocal() as session:
        purged = await purge_expired(session, get_storage())
    logger.info("retention_purge", extra={"sessions": purged})


async def reload_live_thresholds(ctx: dict[str, Any]) -> None:
    from app.core.db import SessionLocal
    from app.core.live_thresholds import reload_thresholds

    async with SessionLocal() as session:
        await reload_thresholds(session)


async def startup(ctx: dict[str, Any]) -> None:
    configure_logging(get_settings().log_level)
    await reload_live_thresholds(ctx)
    logger.info("worker_started")


class WorkerSettings:
    functions: ClassVar[list[Any]] = [
        ping,
        generate_assessment_items,
        # keep_result=0: a stored result would block the retry that reuses this job id.
        func(evaluate_stage1, keep_result=0),
        func(finalize_application, keep_result=0),
    ]
    cron_jobs: ClassVar[list[Any]] = [
        cron(sweep_stage1, second={0, 15, 30, 45}),
        cron(sweep_stage2, second={5, 20, 35, 50}),
        cron(sweep_reports, second={10, 25, 40, 55}),
        cron(deliver_notifications, second={12, 42}),
        cron(reload_live_thresholds, second={22, 52}),
        cron(purge_expired_data, hour={3}, minute={17}, second={0}),
    ]
    job_timeout = 600
    on_startup = startup
    redis_settings = RedisSettings.from_dsn(get_settings().redis_url)
