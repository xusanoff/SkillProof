# SkillProof — AI skill-verified hiring platform

## Current handoff (2026-11-06)
Read `docs/NEXT_SESSION.md` before continuing the frontend redesign. The reviewed implementation plan is `docs/REDESIGN_PLAN.md`; user-provided originals are in `skillproof-redesign/` and `SkillProof — yangi dizayn.html`. All existing UI screens have been adapted to the supplied redesign. See `docs/reports/redesign/REPORT.md` for validation and screenshots; Git author is now configured locally; scoped redesign commits and remaining earlier uncommitted work are documented in the handoff.

Spec: `PROJECT_SPEC.md` (big — read only the section you need, use `grep -n "^##\|^###"` to find it).
Work phase by phase (spec §10). Done: Phases 0–10 (real LLM/speech providers, real SMTP/Telegram checks and Phase 9 audio heuristics still open; production refuses to start until the providers are real). Reports: `docs/reports/phase-N/REPORT.md` (+ `img/`), written in Uzbek.

## Where things are
- Backend `backend/` — FastAPI, async SQLAlchemy, Alembic, uv, Python 3.12. Business logic in `app/services/` (no FastAPI imports), routers `app/api/v1/`, schemas `app/schemas/`, thresholds registry `app/core/thresholds.py`, reference data `app/seed/reference.py`, demo seed `app/seed/demo.py`.
- Frontend `frontend/` — Next.js 16 App Router, Tailwind v4, shadcn/ui, next-intl (uz/ru/en), TanStack Query, openapi-fetch. Done by the `frontend-dev` agent (`.claude/agents/frontend-dev.md`, skills in `.claude/skills/`).
- API contract: `docs/API.md` (source of truth between backend and frontend). Decisions: `docs/DECISIONS.md` (backend IDs D-022…D-029, D-050+; frontend D-016…D-021, D-030+). `docs/CHANGELOG.md` per phase.
- Browser → `/api/<path>` (Next proxy) → API `/<path>`; so browser calls `/api/api/v1/...`. Cookies: `sp_access` Path=/, `sp_refresh` Path=/api. Exception: the interview WebSocket goes directly to the API (`NEXT_PUBLIC_WS_URL`).
- Sandbox: Judge0 in compose, config `infra/judge0.conf`, client `app/sandbox/client.py`. Interview: `app/services/interview.py`, frontend `src/features/interview/`, `src/lib/telemetry/`. Evaluation: `app/services/stage1_evaluation.py`, `app/ai/code_reviewer.py`, signals `app/ai/integrity/stage1.py` (`docs/INTEGRITY.md`), HR `app/services/stage1_report.py`, frontend `src/features/hr-stage1/`, `src/features/hr-replay/`. Stage 2: `app/services/stage2.py`, `app/ai/interviewer.py`, `app/ai/integrity/stage2.py`, frontend `src/features/interview-stage2/`, `src/components/voice/`. Reports: `app/services/reports.py`, `app/ai/report_writer.py`, frontend `src/features/hr-report/`, `src/features/candidate-results/`. Verified skills: `app/services/verified_skills.py`, frontend `src/features/verified-skills/`. Admin: `app/services/admin.py`, `app/core/live_thresholds.py`, `app/ai/usage.py`, frontend `src/features/admin/`. Analytics: `app/services/analytics.py`, frontend `src/features/hr-analytics/`. Privacy: `app/services/privacy.py`. Deploy: `docker-compose.prod.yml`, `Caddyfile`, `scripts/backup.sh`, `docs/DEPLOY.md`; security `docs/SECURITY_REVIEW.md`. Notifications: `app/models/notification.py` (outbox, status listener), `app/services/notifications.py`, `app/services/telegram.py`, `docs/NOTIFICATIONS.md`.

## Commands
- Stack: `make up` (api :8000, web :3000, postgres, redis, worker), `make seed`, `make bench-search`.
- Backend: `cd backend && uv run pytest -q -p no:logging --tb=short`, `uv run ruff check . && uv run mypy app`. Tests use DB `skillproof_test` on the compose postgres.
- Frontend: `pnpm -s lint && pnpm -s typecheck && pnpm -s test && pnpm -s build`. e2e/screenshots need browser libs: run `scripts/pw-libs.sh` once, then `LD_LIBRARY_PATH=~/.cache/skillproof/pwlibs/root/usr/lib/x86_64-linux-gnu`.
- e2e, two modes: `pnpm test:e2e` (mocked API; app must not reach a backend: `API_INTERNAL_URL=http://127.0.0.1:9 PORT=3100 pnpm start`, `BASE_URL=http://localhost:3100`), `pnpm test:e2e:live` (real stack, seeded; `responsive-a11y` sweeps pages for overflow and axe, use `--workers=1`). Live runs take over 10 minutes: run them in the background. Demo admin: `demo.admin@example.com`. Login is limited to 10/min: leave about 60 s between live runs, or the run slows down (live specs wait on `429`). Check nothing old holds port 3100 before a mock run.
- Screenshots: `DEMO_HR_EMAIL=demo.hr@example.com DEMO_CANDIDATE_EMAIL=demo.candidate@example.com DEMO_PASSWORD=Demo-parol-2026 PHASE=N BASE_URL=http://localhost:3000 pnpm screenshots` (local only).
- Owner's own Postgres `hr_db` is not reachable from WSL yet; dev uses the compose postgres.

## Token economy (owner asked to cut token usage)
- Don't re-read files already summarised here or in docs; read files partially (`offset`/`limit`, `grep -n`) instead of whole.
- Quiet tool output: `-q`, `-s`, `--tb=short`, `| tail -n 20`; never print full tracebacks or logs.
- Don't open full-page screenshots to review; check at most 1–2 key ones, viewport-sized.
- Prefer doing work inline. Spawn a subagent only for a large, self-contained frontend chunk; resume the same agent (SendMessage) instead of starting a new one; give it exact file paths and the contract so it doesn't explore.
- Keep messages to the owner short (Uzbek).
