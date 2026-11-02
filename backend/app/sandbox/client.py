"""Code execution behind one interface (spec §3). Candidate and generated code never runs
in the API process. StubSandbox reports `unavailable`, so generated tasks stay
`sandbox_pending` instead of pretending they were validated."""

import base64
import logging
from dataclasses import dataclass
from typing import Any, Literal, Protocol

import httpx

from app.core.config import Settings, get_settings

logger = logging.getLogger(__name__)

RunStatus = Literal["passed", "failed", "error", "timeout", "unavailable"]


@dataclass(frozen=True)
class Limits:
    cpu_time_s: int = 2
    memory_mb: int = 256


@dataclass(frozen=True)
class RunResult:
    status: RunStatus
    stdout: str = ""
    stderr: str = ""
    time_ms: int = 0


class Sandbox(Protocol):
    async def run(self, language: str, code: str, stdin: str, limits: Limits) -> RunResult: ...


class StubSandbox:
    async def run(self, language: str, code: str, stdin: str, limits: Limits) -> RunResult:
        return RunResult("unavailable")


def _b64(text: str) -> str:
    return base64.b64encode(text.encode()).decode()


def _unb64(value: str | None) -> str:
    return base64.b64decode(value).decode(errors="replace") if value else ""


# Judge0 status ids: 3 accepted, 5 time limit, 6 compile error, 7-12 runtime errors, 13-14 internal.
def _status(status_id: int) -> RunStatus:
    if status_id == 3:
        return "passed"
    if status_id == 5:
        return "timeout"
    if status_id in (1, 2, 13, 14):
        return "unavailable"
    return "error"


class Judge0Sandbox:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    async def run(self, language: str, code: str, stdin: str, limits: Limits) -> RunResult:
        s = self._settings
        profile = s.sandbox_profiles.get(language)
        if profile is None:
            return RunResult("error", stderr=f"Unsupported language: {language}")
        cpu = limits.cpu_time_s + profile["extra_cpu_s"]
        body: dict[str, Any] = {
            "source_code": _b64(code),
            "language_id": profile["id"],
            "stdin": _b64(stdin),
            "cpu_time_limit": cpu,
            "wall_time_limit": cpu * 3,
            "memory_limit": (limits.memory_mb + profile["extra_memory_mb"]) * 1024,
            "max_processes_and_or_threads": profile["processes"],
            "enable_per_process_and_thread_time_limit": True,
            "enable_per_process_and_thread_memory_limit": True,
            "enable_network": False,
        }
        headers = {"X-Auth-Token": s.judge0_authn_token} if s.judge0_authn_token else {}
        try:
            async with httpx.AsyncClient(
                base_url=s.judge0_url, timeout=s.judge0_timeout_s, headers=headers
            ) as client:
                r = await client.post(
                    "/submissions", params={"base64_encoded": "true", "wait": "true"}, json=body
                )
                r.raise_for_status()
                data = r.json()
        except (httpx.HTTPError, ValueError) as exc:
            logger.warning("sandbox_unavailable: %s", type(exc).__name__)
            return RunResult("unavailable")
        cap = s.sandbox_output_max_chars
        err = _unb64(data.get("compile_output")) or _unb64(data.get("stderr"))
        return RunResult(
            _status(data["status"]["id"]),
            _unb64(data.get("stdout"))[:cap],
            err[:cap],
            int(float(data.get("time") or 0) * 1000),
        )


def normalize_output(text: str) -> str:
    """Trailing whitespace per line and trailing blank lines do not matter."""
    return "\n".join(line.rstrip() for line in text.strip("\n").splitlines()).strip()


@dataclass(frozen=True)
class TestOutcome:
    __test__ = False
    name: str
    passed: bool
    status: RunStatus
    stdout: str = ""
    stderr: str = ""
    time_ms: int = 0


async def run_tests(
    sandbox: Sandbox, language: str, code: str, tests: list[dict[str, str]], limits: Limits
) -> list[TestOutcome]:
    outcomes = []
    for i, case in enumerate(tests):
        result = await sandbox.run(language, code, case.get("input", ""), limits)
        ok = result.status != "unavailable" and normalize_output(result.stdout) == normalize_output(
            case["output"]
        )
        outcomes.append(
            TestOutcome(
                case.get("name") or f"#{i + 1}",
                ok,
                result.status,
                result.stdout,
                result.stderr,
                result.time_ms,
            )
        )
    return outcomes


def get_sandbox(settings: Settings | None = None) -> Sandbox:
    settings = settings or get_settings()
    if settings.sandbox_provider == "stub":
        return StubSandbox()
    return Judge0Sandbox(settings)
