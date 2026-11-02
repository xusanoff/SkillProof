# Changelog

## Phase 5 — Stage 1 evaluation, integrity signals, gate, replay (2026-11-02)
- Evaluation job (15 s sweep): hidden tests, `code_reviewer.v1` with guardrails and double-check, weighted score, gate to Stage 2; retries when the sandbox is down; an LLM failure never fails a candidate.
- Stage 1 signal detectors and suspicion score (`docs/INTEGRITY.md`); evaluator-injection lines removed before the model sees the code.
- Candidate result screens; HR Stage 1 report and code replay player; compact interview room; runtime version labels.
- Telemetry: `editor_reset` event; pages numbered by the server, so a reload can no longer lose events (D-090). `Session.next_seq` removed.
- Tests: 134 backend, 174 frontend unit/component, 28 mock e2e, 4 live e2e.

## Phase 4 — Stage 1: rules, editor, sandbox, telemetry (2026-11-02)
- Judge0 in docker-compose (internal network, per-process limits on cgroup v2); `Judge0Sandbox` for Python, JS, TS, SQL (SQLite), Go, Java.
- Backend: rules acceptance, warm-up, Stage 1 session with task timers, Run, Submit, drafts; telemetry WebSocket into `editor_events`; server-enforced paste rule (§7.1) and inactivity rule (§7.1b); `integrity_signals`.
- Frontend: rules page, system check (microphone stub until Phase 6), warm-up, Monaco editor, timers, reconnect, end-of-stage screens; `lib/telemetry`.
- Playwright split into mock (`test:e2e`) and live (`test:e2e:live`) modes; `scripts/pw-libs.sh`.
- Tests: 96 backend, 149 frontend unit/component, 28 mock e2e, 3 live e2e.

## Phase 3 — Questions, tasks, assessments (2026-10-30)
- Backend: question bank and coding-task bank (rubrics, visible/hidden tests, reference solutions), company-scoped with admin-managed global templates; per-vacancy assessment config with effective thresholds and readiness checks.
- AI: versioned prompts `question_generator.v1`, `task_generator.v1`, `item_verifier.v1` (+ `_base_rules`), output schemas, guardrails (schema, language, forbidden topics, injection via verifier, reference solution × tests twice), regenerate-once-then-flag; realistic uz/ru/en mock outputs.
- "Generate with AI" as an arq job with polling; sandbox interface with stub (Judge0 in Phase 4).
- `make ai-eval` golden dataset, `docs/AI_EVAL.md`; admin CLI `python -m app.cli create-admin`.
- Tests: 75 backend tests.
- Frontend: HR "Savollar banki" and "Topshiriqlar banki" (URL filters, create/edit/delete/approve, MCQ and rubric editors, tests editor, source / verification / flagged-reason badges), vacancy assessment page (`/hr/vacancies/{id}/assessment`: stage 1/2 config, mandatory + ordered questions, integrity overrides with effective-threshold hints, server readiness issues), "AI bilan yaratish" with 2 s job polling; nav + vacancy links; uz/ru/en. 17 new unit/component tests, 1 e2e flow + phase 3 screenshots (not run here: Playwright system libs missing).

## Phase 2 — Job board (2026-10-30)
- Backend: regions, profession areas, skills dictionary (reference data in migration); vacancies with skills/weights and status machine; public full-text search with filters, hh.uz-style facets, sorting, pagination; autosuggest; vacancy/company pages; apply/withdraw/re-apply; saved vacancies; HR vacancy management, applicant list with "new" badges, status changes, resume download (audited).
- `make seed` demo data (8 companies, 55 vacancies, demo HR + candidate), `make bench-search` (10k vacancies: worst p95 44 ms).
- Tests: 58 backend tests.
- Frontend: hh-style vacancy search (`/vacancies`: count + sort, facet filters with counts, mobile filter sheet, removable chips, numbered pages, server-rendered first page), vacancy page (sticky company + apply block, mobile apply bar, similar vacancies), public company page, apply dialog with cover note, "Arizalarim" (status tabs, withdraw), "Saqlanganlar" (optimistic save), HR "Vakansiyalarim" (status tabs with `counts_by_status`, publish/close/reopen/archive/delete), vacancy form (skills with weight/required, draft/publish), HR "Nomzodlar" (shortlist/reject, resume download, Phase 7 score slot). Header autosuggest + regions on the real API; home "Yangi vakansiyalar".
- Frontend tests: 101 unit/component, 21 e2e (+7 mobile), axe on list and detail.

## Phase 1 — Auth, users, companies (2026-10-30)
- Backend: register/login/logout/refresh with httpOnly cookies (argon2, JWT access + rotating refresh with replay detection), email verification and password reset (console email backend, uz/ru/en templates), rate limits, `PATCH /auth/me`.
- Candidate profile + resume upload/download/delete (local storage, magic-byte validation).
- Companies: create (owner), public page by slug, edit, logo, members, owner-only invitations (create/list/revoke), invitation accept.
- Audit log for account and company actions. Migration `auth users companies`.
- Tests: 46 backend tests incl. the cross-company access check.
- Frontend: login, register (role choice), verify email, forgot/reset password, settings; session with shared refresh-on-401; client route guards; candidate profile + resume; HR create company, company profile + logo, team (members, invitations); invitation accept page.
- Frontend: hh.uz-style structure (owner's UX update): header search + region + autosuggest shell, "Vakansiya joylash", role-based avatar menus, mobile bottom nav, home hero with quick-filter chips; "coming soon" pages for Phase 2+ sections.
- Frontend tests: 70 unit/component, 18 e2e (+7 mobile), axe checks.

## Phase 0 — Project skeleton (2026-10-30)
- Repository structure per spec §4.
- Backend: FastAPI app factory, settings (pydantic-settings) incl. thresholds registry, async SQLAlchemy session, Alembic (async env, baseline revision), JSON logging with request ids, uniform error envelope, `/health` (database + redis checks), arq worker.
- AI: provider-agnostic `llm_client.py` (mock default, schema validation + one retry + `needs_review`, call logging), `speech.py` (mock STT/TTS), `_base_rules.md`.
- Frontend: Next.js App Router + TypeScript + Tailwind v4 + shadcn/ui, next-intl (uz default, ru, en), base layout, home page, `/status` page.
- Infra: docker-compose (api, worker, web, postgres, redis), Makefile, `.env.example`, GitHub Actions CI.
- File storage: local disk by default; MinIO dropped (D-004).
