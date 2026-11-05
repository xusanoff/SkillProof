# Changelog

## Real LLM provider (in progress, 2026-11-04)
- `openai_compatible` provider, tested with DeepSeek V4.1 Flash on NVIDIA (D-170, D-171). Golden set: all 28 cases passed, one of them on a rerun after a timeout.
- Too slow for the live interview so far (calls of 50–90 s against a 3 s target). Not switched on in the stack yet.
- Azure STT and TTS for uz, ru and en (D-174). The API image now includes ffmpeg.
- Google Gemini STT and TTS as a second speech provider, `STT_PROVIDER` / `TTS_PROVIDER=google` (D-176). Real API round trip passed on generated speech in uz, ru and en; a real human voice is not tested yet.
- Google TTS moves to the next model when one is out of quota (D-177). STT stays on one model.
- Live interview no longer waits for the model (D-172); saved questions and shared bank audio (D-173). Migration `question cache`; threshold `stage2.live_llm_timeout_s`.

## Phase 10 — Admin, analytics, hardening, deployment (2026-11-04)
- Admin panel: users, company and vacancy moderation, global templates, global thresholds, AI usage and cost (D-163…D-165). New table `ai_usage`, written for every LLM, STT and TTS call.
- Company analytics: funnel, pass rates, average scores, median time to shortlist (D-167).
- Privacy: daily retention job, account export and deletion (D-160…D-162).
- Security review with fixes: `docs/SECURITY_REVIEW.md`. Production refuses to start on mock services (D-166).
- Production setup: `docker-compose.prod.yml`, `Caddyfile`, `scripts/backup.sh`, `scripts/restore.sh`, `docs/DEPLOY.md`.
- Fixed two e2e specs left stale by the Phase 9 Uzbek translation changes.
- Billing stays out of scope. Details: `docs/reports/phase-10/REPORT.md`.

## Phase 9 — Notifications, translation, mobile and accessibility (2026-11-04)
- Outbox `notifications`, email (console or SMTP) and Telegram delivery with retries, per-channel settings (D-150…D-154). Guide: `docs/NOTIFICATIONS.md`.
- Translation review: 12 backend errors had no text, Russian terms made consistent, leftover English removed from Uzbek.
- `e2e/responsive-a11y.spec.ts` sweeps non-coding pages on phone and desktop. Fixed sideways scrolling on HR lists, keyboard access to code blocks, comment contrast in the dark editor.
- Not done: audio heuristics, which wait for a speech provider and real recordings. Real SMTP and Telegram not exercised.
- Details: `docs/reports/phase-9/REPORT.md`.

## Phase 8 — Verified skill profile (2026-11-03)
- `verified_skills`: earned from clean machine results only, 365-day validity, private by default (D-130…D-133).
- Reuse on new applications, chosen by the candidate when Stage 1 starts: covered tasks and questions are skipped, mandatory questions stay. A stage can be covered entirely.
- HR talent search by verified skill and min score; public profile with badges; candidate skills page; reused results marked in reports. Demo seed: a second vacancy sharing Python.
- Details: `docs/reports/phase-8/REPORT.md`.

## Phase 7 — Evaluation, reports, HR dashboard, candidate results (2026-11-03)
- Final Stage 2 evaluation (double-check, `needs_review`, MCQ without a model), `report_writer.v1`, `feedback_writer.v1` with evidence and leak checks, session report for every finished or stopped application. Golden dataset covers all evaluator roles.
- HR: ranked and excluded tabs, min score filter, full report with suspicion across both stages, overrides with history, private notes, hire, answer audio. Candidate: results page with mistakes and what to learn next.
- Migration `session reports`; thresholds group `report`.

## Phase 6 — Stage 2: oral AI interview (2026-11-02)
- `interview_turns`, interviewer state machine (own code, mandatory, skill weights, follow-ups, adaptive difficulty), `interviewer.v1`, a minimal `answer_evaluator.v1`, output filter with fallbacks.
- Stage 2 API and socket, timers per §7.1b, reconnect, audio storage; voice → text fallback; Stage 2 signals (`docs/INTEGRITY.md`).
- Frontend: Stage 2 room (voice, text, own-code panel, inactivity warning), real microphone test, cabinet links, phone layout.
- Demo seed: a vacancy with a ready assessment. `stage2_mode` on the interview state. Live e2e logins wait on `429`.
- Tests: 186 backend, 221 frontend unit/component, 28 mock e2e, 6 live e2e. Real LLM/STT/TTS not exercised yet.

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
