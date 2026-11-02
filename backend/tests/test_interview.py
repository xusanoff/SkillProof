import asyncio
import json
import socket
import uuid
from collections.abc import AsyncIterator, Callable
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
import pytest
import uvicorn
import websockets
from fastapi import FastAPI
from httpx import AsyncClient
from sqlalchemy import select, update

from app.api.deps import ACCESS_COOKIE
from app.api.v1.interview import sandbox_dep
from app.core.config import Settings
from app.core.db import SessionLocal
from app.models import (
    Application,
    EditorEvent,
    IntegritySignal,
    InterviewSession,
)
from app.models.interview import PAGE_SEQ
from app.sandbox.client import Judge0Sandbox, Limits, RunResult
from tests.conftest import SignUp

RUBRIC = {"criteria": [{"key": "depth", "name": "Chuqurlik", "max_points": 5}]}
TASK = {
    "title": "Yig'indi",
    "statement": "Ikki sonni qo'shing.",
    "allowed_languages": ["python"],
    "starter_code": {"python": "a, b = map(int, input().split())\n"},
    "visible_tests": [{"name": "ex", "input": "2 3\n", "output": "5"}],
    "hidden_tests": [{"name": "secret-case", "input": "1 1\n", "output": "2"}],
    "rubric": RUBRIC,
    "reference_solution": {"language": "python", "code": "print(sum(map(int,input().split())))"},
}
QUESTION = {
    "type": "open",
    "text": "FastAPI'da dependency injection qanday ishlaydi va nima uchun foydali?",
    "rubric": RUBRIC,
    "reference_answer": "Depends orqali bog'liqliklar so'rov bo'yicha yaratiladi.",
}
Ctx = dict[str, Any]


class EchoSandbox:
    """Answers `5` for code that prints, so visible-test results are predictable."""

    async def run(self, language: str, code: str, stdin: str, limits: Limits) -> RunResult:
        return RunResult("passed", "5\n" if "print" in code else "", "", 7)


async def _setup(signup: SignUp, app: FastAPI, tasks: int = 1) -> Ctx:
    app.dependency_overrides[sandbox_dep] = EchoSandbox
    hr = await signup("hr")
    cid = (await hr.post("/api/v1/companies", json={"name": f"Co {uuid.uuid4().hex[:6]}"})).json()[
        "id"
    ]
    vacancy = await hr.post(
        f"/api/v1/companies/{cid}/vacancies",
        json={
            "title": "Backend",
            "profession_area": "it",
            "region_code": "UZ-TK",
            "remote_type": "office",
            "employment_type": "full_time",
            "experience_level": "between_1_3",
            "description": "Backend dasturchi kerak",
            "skills": [],
        },
    )
    assert vacancy.status_code == 201, vacancy.text
    vid = vacancy.json()["id"]
    published = await hr.patch(
        f"/api/v1/companies/{cid}/vacancies/{vid}", json={"status": "published"}
    )
    assert published.status_code == 200, published.text
    task_ids = []
    for _ in range(tasks):
        t = await hr.post(f"/api/v1/companies/{cid}/tasks", json=TASK)
        assert t.status_code == 201, t.text
        task_ids.append(t.json()["id"])
        await hr.post(
            f"/api/v1/companies/{cid}/tasks/{task_ids[-1]}/approve", json={"approved": True}
        )
    question_ids = []
    for i in range(8):
        q = await hr.post(
            f"/api/v1/companies/{cid}/questions",
            json={**QUESTION, "text": f"{QUESTION['text']} {i}"},
        )
        assert q.status_code == 201, q.text
        question_ids.append(q.json()["id"])
        await hr.post(
            f"/api/v1/companies/{cid}/questions/{q.json()['id']}/approve", json={"approved": True}
        )
    saved = await hr.put(
        f"/api/v1/companies/{cid}/vacancies/{vid}/assessment",
        json={
            "language": "uz",
            "stage1_config": {"task_ids": task_ids},
            "stage2_config": {"question_count": 8, "mode": "text"},
            "questions": [{"question_id": q} for q in question_ids],
            "question_mode": "manual",
        },
    )
    assert saved.status_code == 200, saved.text
    assert saved.json()["ready"], saved.json()
    candidate = await signup("candidate")
    applied = await candidate.post(f"/api/v1/vacancies/{vid}/apply", json={"cover_note": "Salom"})
    assert applied.status_code == 201, applied.text
    return {
        "hr": hr,
        "c": candidate,
        "aid": applied.json()["id"],
        "tasks": task_ids,
    }


async def _start(ctx: Ctx) -> Ctx:
    c: AsyncClient = ctx["c"]
    version = (await c.get(f"/api/v1/applications/{ctx['aid']}/interview")).json()["rules_version"]
    r = await c.post(
        f"/api/v1/applications/{ctx['aid']}/interview/rules", json={"rules_version": version}
    )
    assert r.status_code == 200 and r.json()["rules_accepted"]
    s = await c.post(f"/api/v1/applications/{ctx['aid']}/interview/stage1")
    assert s.status_code == 201, s.text
    return s.json()


async def _set_session(sid: str, **values: Any) -> None:
    async with SessionLocal() as db:
        await db.execute(
            update(InterviewSession).where(InterviewSession.id == uuid.UUID(sid)).values(**values)
        )
        await db.commit()


async def _application_status(aid: str) -> str:
    async with SessionLocal() as db:
        return str((await db.get(Application, uuid.UUID(aid))).status.value)  # type: ignore[union-attr]


# ------------------------------------------------------------------ REST flow


async def test_start_requires_rules_and_never_leaks_hidden_tests(
    signup: SignUp, app: FastAPI
) -> None:
    ctx = await _setup(signup, app)
    c = ctx["c"]
    assert (await c.post(f"/api/v1/applications/{ctx['aid']}/interview/stage1")).status_code == 409
    wrong = await c.post(
        f"/api/v1/applications/{ctx['aid']}/interview/rules", json={"rules_version": "old"}
    )
    assert wrong.json()["error"]["code"] == "rules_version_mismatch"
    session = await _start(ctx)
    assert session["status"] == "in_progress"
    assert await _application_status(ctx["aid"]) == "stage1_in_progress"
    body = json.dumps((await c.get(f"/api/v1/interview-sessions/{session['id']}")).json())
    assert "secret-case" not in body and "reference_solution" not in body
    # Starting again returns the same session, not a second one.
    again = await c.post(f"/api/v1/applications/{ctx['aid']}/interview/stage1")
    assert again.json()["id"] == session["id"]


async def test_other_users_get_404(signup: SignUp, app: FastAPI) -> None:
    ctx = await _setup(signup, app)
    session = await _start(ctx)
    other = await signup("candidate")
    assert (await other.get(f"/api/v1/applications/{ctx['aid']}/interview")).status_code == 404
    assert (await other.get(f"/api/v1/interview-sessions/{session['id']}")).status_code == 404
    run = await other.post(
        f"/api/v1/interview-sessions/{session['id']}/tasks/{ctx['tasks'][0]}/run",
        json={"language": "python", "code": "print(5)"},
    )
    assert run.status_code == 404


async def test_run_records_results_and_submit_advances_to_completion(
    signup: SignUp, app: FastAPI
) -> None:
    ctx = await _setup(signup, app, tasks=2)
    c, session = ctx["c"], await _start(ctx)
    sid, first, second = session["id"], ctx["tasks"][0], ctx["tasks"][1]
    assert [t["state"] for t in session["tasks"]] == ["current", "pending"]
    assert session["tasks"][1]["title"] is None  # the next task stays closed

    run = await c.post(
        f"/api/v1/interview-sessions/{sid}/tasks/{first}/run",
        json={"language": "python", "code": "print(5)"},
    )
    assert run.status_code == 200 and run.json()["results"][0]["passed"] is True
    bad = await c.post(
        f"/api/v1/interview-sessions/{sid}/tasks/{first}/run",
        json={"language": "go", "code": "x"},
    )
    assert bad.json()["error"]["code"] == "language_not_allowed"
    early = await c.post(
        f"/api/v1/interview-sessions/{sid}/tasks/{second}/submit",
        json={"language": "python", "code": "x"},
    )
    assert early.json()["error"]["code"] == "task_not_current"

    done = await c.post(
        f"/api/v1/interview-sessions/{sid}/tasks/{first}/submit",
        json={"language": "python", "code": "print(5)"},
    )
    assert [t["state"] for t in done.json()["tasks"]] == ["submitted", "current"]
    done = await c.post(
        f"/api/v1/interview-sessions/{sid}/tasks/{second}/submit",
        json={"language": "python", "code": "print(5)"},
    )
    assert done.json()["status"] == "completed"
    async with SessionLocal() as db:
        kinds = (
            await db.scalars(
                select(EditorEvent.seq).where(EditorEvent.session_id == uuid.UUID(sid))
            )
        ).all()
    assert kinds == [-1]  # the one successful run, written by the server
    late = await c.post(
        f"/api/v1/interview-sessions/{sid}/tasks/{second}/run",
        json={"language": "python", "code": "print(5)"},
    )
    assert late.json()["error"]["code"] == "session_not_active"


async def test_time_limit_submits_the_last_draft(signup: SignUp, app: FastAPI) -> None:
    ctx = await _setup(signup, app)
    c, session = ctx["c"], await _start(ctx)
    await _set_session(
        session["id"], expires_at=datetime.now(UTC) - timedelta(seconds=1), disconnected_at=None
    )
    out = (await c.get(f"/api/v1/interview-sessions/{session['id']}")).json()
    assert out["status"] == "expired"
    assert out["tasks"][0]["state"] == "submitted"
    assert out["tasks"][0]["code"] == TASK["starter_code"]["python"]  # type: ignore[index]


async def test_inactivity_disqualifies_only_while_connected(signup: SignUp, app: FastAPI) -> None:
    ctx = await _setup(signup, app)
    c, session = ctx["c"], await _start(ctx)
    sid, long_ago = session["id"], datetime.now(UTC) - timedelta(seconds=120)
    # Disconnected: the timer is paused (§7.1b) even though the last activity is old.
    await _set_session(sid, last_activity_at=long_ago, disconnected_at=datetime.now(UTC))
    assert (await c.get(f"/api/v1/interview-sessions/{sid}")).json()["status"] == "in_progress"
    await _set_session(sid, disconnected_at=None)
    out = (await c.get(f"/api/v1/interview-sessions/{sid}")).json()
    assert out["status"] == "disqualified" and out["disqualification_reason"] == "inactivity"
    assert await _application_status(ctx["aid"]) == "stage1_disqualified"


async def test_reconnect_window_abandons_the_session(signup: SignUp, app: FastAPI) -> None:
    ctx = await _setup(signup, app)
    c, session = ctx["c"], await _start(ctx)
    await _set_session(session["id"], disconnected_at=datetime.now(UTC) - timedelta(seconds=301))
    out = (await c.get(f"/api/v1/interview-sessions/{session['id']}")).json()
    assert out["status"] == "abandoned"
    assert await _application_status(ctx["aid"]) == "stage1_failed"


async def test_warmup_runs_and_is_not_recorded(signup: SignUp, app: FastAPI) -> None:
    ctx = await _setup(signup, app)
    state = (await ctx["c"].get(f"/api/v1/applications/{ctx['aid']}/interview")).json()
    assert state["warmup"]["languages"] == ["python"]
    r = await ctx["c"].post(
        f"/api/v1/applications/{ctx['aid']}/interview/warmup/run",
        json={"language": "python", "code": "print(5)"},
    )
    assert r.status_code == 200 and r.json()["results"][0]["passed"] is True
    async with SessionLocal() as db:
        assert (await db.scalars(select(EditorEvent))).first() is None


# ------------------------------------------------------------------ WebSocket


@pytest.fixture
async def live_server(app: FastAPI) -> AsyncIterator[str]:
    """Real uvicorn on the test's event loop, so the socket handler shares its database pool."""
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        port = probe.getsockname()[1]
    server = uvicorn.Server(
        uvicorn.Config(app, host="127.0.0.1", port=port, log_level="error", lifespan="off")
    )
    task = asyncio.create_task(server.serve())
    while not server.started:  # noqa: ASYNC110
        await asyncio.sleep(0.01)
    yield f"ws://127.0.0.1:{port}"
    server.should_exit = True
    await task


Connect = Callable[..., Any]


def _connect(
    url: str,
    c: AsyncClient,
    sid: str,
    origin: str = "http://localhost:3000",
    page: int | None = None,
) -> Any:
    token = c.cookies.get(ACCESS_COOKIE)
    query = f"?page={page}" if page else ""
    return websockets.connect(
        f"{url}/api/v1/interview-sessions/{sid}/events{query}",
        origin=origin,  # type: ignore[arg-type]
        additional_headers={"Cookie": f"{ACCESS_COOKIE}={token}"},
    )


async def _send(ws: Any, *events: dict[str, Any]) -> dict[str, Any]:
    await ws.send(json.dumps({"type": "events", "sent_t_ms": 5000, "events": list(events)}))
    return json.loads(await ws.recv())  # type: ignore[no-any-return]


def _event(seq: int, kind: str, task: str, **payload: Any) -> dict[str, Any]:
    return {"seq": seq, "task_id": task, "t_ms": 4000 + seq, "type": kind, "payload": payload}


async def _events(sid: str) -> list[EditorEvent]:
    async with SessionLocal() as db:
        rows = await db.scalars(
            select(EditorEvent)
            .where(EditorEvent.session_id == uuid.UUID(sid))
            .order_by(EditorEvent.seq)
        )
        return list(rows)


async def _signals(sid: str) -> list[IntegritySignal]:
    async with SessionLocal() as db:
        rows = await db.scalars(
            select(IntegritySignal).where(IntegritySignal.session_id == uuid.UUID(sid))
        )
        return list(rows)


async def test_socket_rejects_foreign_origin_and_missing_cookie(
    signup: SignUp, app: FastAPI, live_server: str
) -> None:
    ctx = await _setup(signup, app)
    session = await _start(ctx)
    with pytest.raises(websockets.exceptions.InvalidStatus):
        async with _connect(live_server, ctx["c"], session["id"], origin="https://evil.example"):
            pass
    with pytest.raises(websockets.exceptions.InvalidStatus):
        async with websockets.connect(
            f"{live_server}/api/v1/interview-sessions/{session['id']}/events",
            origin="http://localhost:3000",  # type: ignore[arg-type]
        ):
            pass
    other = await signup("candidate")
    with pytest.raises(websockets.exceptions.InvalidStatus):
        async with _connect(live_server, other, session["id"]):
            pass


async def test_socket_stores_events_once_with_server_clock(
    signup: SignUp, app: FastAPI, live_server: str
) -> None:
    ctx = await _setup(signup, app)
    session, task = await _start(ctx), ctx["tasks"][0]
    sid = session["id"]
    await _set_session(sid, started_at=datetime.now(UTC) - timedelta(seconds=60))
    async with _connect(live_server, ctx["c"], sid) as ws:
        hello = json.loads(await ws.recv())
        assert hello["status"] == "in_progress"
        batch = [
            _event(1, "insert", task, text="a", source="keyboard"),
            _event(2, "focus_lost", task),
            # `run` from a client is ignored: only the server records real runs.
            _event(3, "run", task),
        ]
        assert (await _send(ws, *batch))["ack_seq"] == 3
        assert (await _send(ws, *batch))["ack_seq"] == 3  # resend after a reconnect
        await ws.send("not json")
        assert json.loads(await ws.recv())["code"] == "invalid_message"
    rows = await _events(sid)
    assert [(e.seq, e.type.value) for e in rows] == [
        (PAGE_SEQ + 1, "insert"),
        (PAGE_SEQ + 2, "focus_lost"),
    ]
    assert rows[0].t_ms <= rows[1].t_ms
    assert rows[1].t_ms - rows[0].t_ms == 1  # client spacing survives the batching


@pytest.mark.parametrize(
    ("payload", "status"),
    [
        ({"length": 81, "lines": 1}, "disqualified"),  # over the character limit
        ({"length": 20, "lines": 3}, "disqualified"),  # over the line limit
        ({"length": 80, "lines": 2}, "in_progress"),  # exactly at the limits
    ],
)
async def test_external_paste_rule(
    signup: SignUp, app: FastAPI, live_server: str, payload: dict[str, int], status: str
) -> None:
    ctx = await _setup(signup, app)
    session, task = await _start(ctx), ctx["tasks"][0]
    sid = session["id"]
    async with _connect(live_server, ctx["c"], sid) as ws:
        await ws.recv()
        reply = await _send(ws, _event(1, "paste_external_blocked", task, **payload))
    assert reply["status"] == status
    signals = await _signals(sid)
    if status == "disqualified":
        assert reply["reason"] == "external_paste"
        assert signals[0].severity.value == "disqualifying"
        assert await _application_status(ctx["aid"]) == "stage1_disqualified"
        out = await ctx["c"].post(
            f"/api/v1/interview-sessions/{sid}/tasks/{task}/submit",
            json={"language": "python", "code": "print(5)"},
        )
        assert out.json()["error"]["code"] == "session_not_active"
    else:
        assert signals[0].severity.value == "low"
        assert await _application_status(ctx["aid"]) == "stage1_in_progress"


async def test_internal_paste_must_match_a_copy_from_this_session(
    signup: SignUp, app: FastAPI, live_server: str
) -> None:
    ctx = await _setup(signup, app)
    session, task = await _start(ctx), ctx["tasks"][0]
    block = "def foo():\n    return 1\n\n\nprint(foo())\n"
    async with _connect(live_server, ctx["c"], session["id"]) as ws:
        await ws.recv()
        await _send(ws, _event(1, "copy", task, text=block))
        ok = await _send(ws, _event(2, "paste_internal", task, text=block))
        assert ok["status"] == "in_progress"
        forged = await _send(ws, _event(3, "paste_internal", task, text=block + "print(2)\n"))
    assert forged["status"] == "disqualified" and forged["reason"] == "external_paste"


async def test_injected_insert_counts_as_external_but_undo_does_not(
    signup: SignUp, app: FastAPI, live_server: str
) -> None:
    ctx = await _setup(signup, app)
    session, task = await _start(ctx), ctx["tasks"][0]
    long_text = "x" * 200
    async with _connect(live_server, ctx["c"], session["id"]) as ws:
        await ws.recv()
        undo = await _send(ws, _event(1, "insert", task, text=long_text, source="undo"))
        assert undo["status"] == "in_progress"
        injected = await _send(ws, _event(2, "insert", task, text=long_text, source="unknown"))
    assert injected["status"] == "disqualified"


async def test_injected_replace_counts_as_external(
    signup: SignUp, app: FastAPI, live_server: str
) -> None:
    ctx = await _setup(signup, app)
    session, task = await _start(ctx), ctx["tasks"][0]
    async with _connect(live_server, ctx["c"], session["id"]) as ws:
        await ws.recv()
        reply = await _send(ws, _event(1, "replace", task, text="x" * 200, source="unknown"))
    assert reply["status"] == "disqualified" and reply["reason"] == "external_paste"


async def test_only_editing_resets_the_inactivity_timer(
    signup: SignUp, app: FastAPI, live_server: str
) -> None:
    ctx = await _setup(signup, app)
    session, task = await _start(ctx), ctx["tasks"][0]
    sid = session["id"]
    async with _connect(live_server, ctx["c"], sid) as ws:
        await ws.recv()
        await _set_session(sid, last_activity_at=datetime.now(UTC) - timedelta(seconds=70))
        moved = await _send(ws, _event(1, "cursor", task, line=1))
        assert moved["inactive_s"] >= 70  # moving around is not activity (§7.1b)
        typed = await _send(ws, _event(2, "insert", task, text="a", source="keyboard"))
        assert typed["inactive_s"] <= 1


async def test_disconnect_pauses_inactivity_and_reconnect_resumes(
    signup: SignUp, app: FastAPI, live_server: str
) -> None:
    ctx = await _setup(signup, app)
    session = await _start(ctx)
    sid = session["id"]
    async with _connect(live_server, ctx["c"], sid) as ws:
        await ws.recv()
    await asyncio.sleep(0.1)
    async with SessionLocal() as db:
        s = await db.get(InterviewSession, uuid.UUID(sid))
        assert s is not None and s.disconnected_at is not None
    # 80 s of silence, 200 s of them offline: only the 80 before the drop count on return.
    now = datetime.now(UTC)
    await _set_session(
        sid,
        last_activity_at=now - timedelta(seconds=280),
        disconnected_at=now - timedelta(seconds=200),
    )
    async with _connect(live_server, ctx["c"], sid) as ws:
        hello = json.loads(await ws.recv())
    assert hello["status"] == "in_progress" and 79 <= hello["inactive_s"] <= 82


async def test_server_ends_the_socket_on_inactivity(
    signup: SignUp, app: FastAPI, live_server: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.core.config import get_settings

    monkeypatch.setattr(get_settings(), "interview_ws_tick_s", 0.05)
    ctx = await _setup(signup, app)
    session = await _start(ctx)
    sid = session["id"]
    async with _connect(live_server, ctx["c"], sid) as ws:
        await ws.recv()
        await _set_session(sid, last_activity_at=datetime.now(UTC) - timedelta(seconds=95))
        last: dict[str, Any] = {}
        async for raw in ws:
            last = json.loads(raw)
    assert last["status"] == "disqualified" and last["reason"] == "inactivity"


async def test_late_batch_from_a_closing_page_cannot_collide_with_the_new_page(
    signup: SignUp, app: FastAPI, live_server: str
) -> None:
    """Reload: the old page's last batch reaches the server after the new page's first events,
    with the same client seq. Both must survive, the old page's first."""
    ctx = await _setup(signup, app)
    session, task = await _start(ctx), ctx["tasks"][0]
    sid = session["id"]
    async with (
        _connect(live_server, ctx["c"], sid) as old,
        _connect(live_server, ctx["c"], sid) as new,
    ):
        assert json.loads(await old.recv())["page"] == 1
        assert json.loads(await new.recv())["page"] == 2
        await _send(new, _event(1, "editor_reset", task, language="python", code="x"))
        await _send(old, _event(1, "insert", task, text="a", source="keyboard"))
    rows = await _events(sid)
    assert [e.type.value for e in rows] == ["insert", "editor_reset"]


async def test_reconnect_keeps_its_page_so_a_resend_is_still_a_duplicate(
    signup: SignUp, app: FastAPI, live_server: str
) -> None:
    ctx = await _setup(signup, app)
    session, task = await _start(ctx), ctx["tasks"][0]
    sid = session["id"]
    event = _event(1, "insert", task, text="a", source="keyboard")
    async with _connect(live_server, ctx["c"], sid) as ws:
        page = json.loads(await ws.recv())["page"]
        await _send(ws, event)
    async with _connect(live_server, ctx["c"], sid, page=page) as ws:
        assert json.loads(await ws.recv())["page"] == page
        await _send(ws, event)
    # A number never given out cannot be claimed: it gets the next page instead.
    async with _connect(live_server, ctx["c"], sid, page=99) as ws:
        assert json.loads(await ws.recv())["page"] == page + 1
    assert len(await _events(sid)) == 1


async def test_draft_is_kept_for_reconnect(signup: SignUp, app: FastAPI, live_server: str) -> None:
    ctx = await _setup(signup, app)
    session, task = await _start(ctx), ctx["tasks"][0]
    sid = session["id"]
    async with _connect(live_server, ctx["c"], sid) as ws:
        await ws.recv()
        await ws.send(
            json.dumps({"type": "draft", "task_id": task, "language": "python", "code": "print(9)"})
        )
        await ws.recv()
    out = (await ctx["c"].get(f"/api/v1/interview-sessions/{sid}")).json()
    assert out["tasks"][0]["code"] == "print(9)"


# ------------------------------------------------------------------ Judge0 client


async def test_judge0_client_maps_statuses_and_limits(monkeypatch: pytest.MonkeyPatch) -> None:
    seen: dict[str, Any] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["body"] = json.loads(request.content)
        seen["token"] = request.headers.get("X-Auth-Token")
        return httpx.Response(
            201,
            json={
                "stdout": "NQo=",
                "stderr": None,
                "compile_output": None,
                "time": "0.012",
                "status": {"id": seen.get("status", 3)},
            },
        )

    real = httpx.AsyncClient
    monkeypatch.setattr(
        "app.sandbox.client.httpx.AsyncClient",
        lambda **kw: real(transport=httpx.MockTransport(handler), **kw),
    )
    settings = Settings(judge0_url="http://j", judge0_authn_token="t")
    sandbox = Judge0Sandbox(settings)
    out = await sandbox.run("java", "code", "in", Limits(2, 256))
    assert (out.status, out.stdout, out.time_ms) == ("passed", "5\n", 12)
    body = seen["body"]
    assert body["language_id"] == 62 and body["memory_limit"] == (256 + 3840) * 1024
    assert body["enable_network"] is False and seen["token"] == "t"
    for status_id, expected in ((5, "timeout"), (6, "error"), (11, "error"), (13, "unavailable")):
        seen["status"] = status_id
        assert (await sandbox.run("python", "c", "", Limits())).status == expected
    assert (await sandbox.run("cobol", "c", "", Limits())).status == "error"


async def test_judge0_down_reports_unavailable(monkeypatch: pytest.MonkeyPatch) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("down")

    real = httpx.AsyncClient
    monkeypatch.setattr(
        "app.sandbox.client.httpx.AsyncClient",
        lambda **kw: real(transport=httpx.MockTransport(handler), **kw),
    )
    out = await Judge0Sandbox(Settings(judge0_url="http://j")).run("python", "c", "", Limits())
    assert out.status == "unavailable"
