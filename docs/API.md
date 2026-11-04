# API

OpenAPI schema: `GET /openapi.json`, interactive docs: `/docs`. The frontend client is generated from it (`pnpm gen:api`).

## Conventions
- Versioned routes under `/api/v1`. Health is `GET /health`.
- Errors: `{"error": {"code": "...", "message": "...", "details": {}, "request_id": "..."}}`. Validation: `code=validation_error`, `details.fields=[{loc,msg,type}]`.
- Every response has an `X-Request-ID` header.
- Ids are UUID strings; timestamps are UTC ISO-8601.
- Browser reaches the API through the Next proxy: browser `/api/<path>` → API `/<path>` (so `/api/api/v1/auth/login`).

## Error codes in use
`validation_error` 422 · `unauthorized` 401 · `permission_denied` 403 · `not_found` 404 · `rate_limited` 429 · `internal_error` 500 · `email_taken` 409 · `invalid_credentials` 401 · `account_disabled` 403 · `invalid_refresh_token` 401 · `invalid_token` 400 · `empty_file` 400 · `unsupported_file_type` 400 · `file_too_large` 413 · `already_member` 409 · `invitation_pending` 409 · `last_owner` 409 · `email_mismatch` 403 · `role_mismatch` 403 · `invitation_expired` 410 · `invitation_used` 410. Frontend proxy adds `upstream_unavailable` 502.

## Auth (Phase 1)
Cookies (httpOnly, `SameSite=Lax`, `Secure` outside local): `sp_access` (JWT, 15 min, `Path=/`), `sp_refresh` (opaque, 30 days, rotated on every refresh, `Path=/api`). Tokens are never in response bodies.

| Method | Path | Auth | Body → Response |
|---|---|---|---|
| POST | `/api/v1/auth/register` | – | `{email, password, full_name, role: "candidate"\|"hr", locale?, timezone?}` → `201 Me` + cookies; sends verification email |
| POST | `/api/v1/auth/login` | – | `{email, password}` → `200 Me` + cookies. `401 invalid_credentials`, `429 rate_limited` |
| POST | `/api/v1/auth/refresh` | refresh cookie | → `200 Me` + new cookies. `401 invalid_refresh_token` |
| POST | `/api/v1/auth/logout` | – | → `204`, cookies cleared |
| GET | `/api/v1/auth/me` | user | → `Me` |
| PATCH | `/api/v1/auth/me` | user | `{full_name?, locale?, timezone?}` → `Me` |
| POST | `/api/v1/auth/verify-email` | – | `{token}` → `Me`-less `204`. `400 invalid_token` |
| POST | `/api/v1/auth/resend-verification` | user | → `204` |
| POST | `/api/v1/auth/password/forgot` | – | `{email}` → `202` always (no account enumeration) |
| POST | `/api/v1/auth/password/reset` | – | `{token, password}` → `204`; all sessions revoked |

`Me = {id, email, full_name, role: "candidate"|"hr"|"admin", locale: "uz"|"ru"|"en", timezone, is_email_verified, created_at, companies: [{id, name, slug, member_role: "owner"|"hr"}]}`

Passwords: 8–128 chars. Emails sent by the console backend (logged), links: `{FRONTEND_URL}/{locale}/verify-email?token=…`, `{FRONTEND_URL}/{locale}/reset-password?token=…`, `{FRONTEND_URL}/{locale}/invitations/{token}`.

## Candidate profile (Phase 1) — role `candidate` only
| Method | Path | Body → Response |
|---|---|---|
| GET | `/api/v1/candidate/profile` | → `CandidateProfile` (empty defaults if never saved) |
| PUT | `/api/v1/candidate/profile` | `CandidateProfileUpdate` → `CandidateProfile` |
| POST | `/api/v1/candidate/profile/resume` | multipart `file` (PDF/DOC/DOCX, ≤ 5 MB) → `CandidateProfile`. `400 unsupported_file_type`, `413 file_too_large` |
| GET | `/api/v1/candidate/profile/resume` | → file download. `404 not_found` |
| DELETE | `/api/v1/candidate/profile/resume` | → `204` |

`CandidateProfile = {headline, country (ISO-3166 alpha-2 | null), city, experience_years (0–60 | null), about, desired_salary_min, desired_salary_max (integers | null), currency ("UZS" default, ISO-4217), open_to_work (bool), resume: {filename, size_bytes, content_type, uploaded_at} | null}`

## Companies (Phase 1)
| Method | Path | Who | Body → Response |
|---|---|---|---|
| POST | `/api/v1/companies` | role `hr` | `{name, description?, website?, industry?, country?, city?}` → `201 Company`; creator becomes `owner` |
| GET | `/api/v1/companies/mine` | user | → `Company[]` (with `member_role`) |
| GET | `/api/v1/companies/by-slug/{slug}` | public | → `CompanyPublic` |
| GET | `/api/v1/companies/{company_id}` | member | → `Company` |
| PATCH | `/api/v1/companies/{company_id}` | member | partial → `Company` |
| POST | `/api/v1/companies/{company_id}/logo` | member | multipart `file` (PNG/JPEG/WEBP ≤ 2 MB) → `Company` |
| GET | `/api/v1/companies/{company_id}/logo` | public | → image |
| GET | `/api/v1/companies/{company_id}/members` | member | → `Member[] = {user_id, email, full_name, member_role, joined_at}` |
| DELETE | `/api/v1/companies/{company_id}/members/{user_id}` | owner | → `204`. `409 last_owner` |
| POST | `/api/v1/companies/{company_id}/invitations` | owner | `{email}` → `201 Invitation`. `409 already_member`, `409 invitation_pending` |
| GET | `/api/v1/companies/{company_id}/invitations` | owner | → `Invitation[]` (pending only) |
| DELETE | `/api/v1/companies/{company_id}/invitations/{invitation_id}` | owner | → `204` |
| GET | `/api/v1/invitations/{token}` | public | → `{company: {name, slug, logo_url}, email, status: "pending"\|"accepted"\|"expired"\|"revoked"}` |
| POST | `/api/v1/invitations/{token}/accept` | role `hr`, same email | → `Company`. `403 email_mismatch`, `403 role_mismatch`, `410 invitation_expired` |

`Company = {id, name, slug, description, website, industry, country, city, logo_url (string path | null), is_verified, created_at, member_role}`; `CompanyPublic` = same without `member_role`.
`Invitation = {id, email, member_role: "hr", invited_by_name, created_at, expires_at}`.

Access rules: a non-member gets `404 not_found` for any `/companies/{company_id}/…` member/owner route (no existence leak); a member who is not owner gets `403 permission_denied` on owner routes.

## Job board (Phase 2)
Enums: `remote_type` = `office|remote|hybrid` · `employment_type` = `full_time|part_time|project|internship` · `experience_level` = `no_experience|between_1_3|between_3_6|more_than_6` · `vacancy.status` = `draft|published|closed|archived` · `application.status` (Phase 2 uses) `applied|shortlisted|rejected|withdrawn` (+ later stages from spec §5).
`profession_area`: slug from `GET /api/v1/profession-areas` (`it` at launch). Money: integers, `currency` ISO-4217 (UZS default).

### Public
| Method | Path | Notes |
|---|---|---|
| GET | `/api/v1/regions?country=UZ` | `[{code: "UZ-TK", country: "UZ", names: {uz, ru, en}}]` |
| GET | `/api/v1/profession-areas` | `[{slug, names: {uz, ru, en}}]` |
| GET | `/api/v1/skills?q=&limit=` | `[{id, name, slug, category}]` |
| GET | `/api/v1/search/suggest?q=` | `[{type: "vacancy"\|"skill"\|"company", text, slug \| null}]`, ≤ 10, q ≥ 2 chars |
| GET | `/api/v1/vacancies` | query below → `VacancyPage` |
| GET | `/api/v1/vacancies/{vacancy_id}` | `VacancyDetail` (published; HR members of the company also see their drafts) |
| GET | `/api/v1/companies/by-slug/{slug}/vacancies?page=` | published vacancies of a company → `VacancyPage` (no facets) |

`GET /api/v1/vacancies` query: `q` (full text over title/description/requirements/skills + company name), `region` (repeatable), `remote_type` (repeatable), `employment_type` (repeatable), `experience_level` (repeatable), `profession_area`, `skill` (slug, repeatable, all must match), `salary_from` (int; vacancies whose max ≥ value, or min ≥ value when no max), `currency`, `only_with_salary` (bool), `company` (slug), `sort` = `relevance` (default when q) \| `date` (default) \| `salary_desc` \| `salary_asc`, `page` (1-based), `page_size` (default 20, max 50).

`VacancyPage = {items: VacancyCard[], total, page, page_size, facets: {region: [{value, count}], remote_type: [...], employment_type: [...], experience_level: [...]}}` — facet counts are computed for the current query **without** that facet's own filter (hh.uz behaviour).

`VacancyCard = {id, title, company: {id, name, slug, logo_url, is_verified}, region_code, city, remote_type, employment_type, experience_level, salary_min, salary_max, currency, skills: [{name, slug}] (≤ 6, required first), published_at, has_assessment: false, viewer: {is_saved, application_status} | null}`
`VacancyDetail = VacancyCard + {description, requirements, profession_area, country, status, skills: [{id, name, slug, weight, is_required}], applications_count (HR members only, else null)}`
`viewer` is present when the request carries a candidate session.

### Candidate (role `candidate`)
| Method | Path | Body → Response |
|---|---|---|
| POST | `/api/v1/vacancies/{vacancy_id}/apply` | `{cover_note?: string ≤ 3000}` → `201 Application`. `409 already_applied`, `409 vacancy_not_open`. Re-applying after withdraw re-opens the same application. |
| GET | `/api/v1/candidate/applications?status=&page=` | → `{items: Application[], total, page, page_size}` |
| POST | `/api/v1/candidate/applications/{application_id}/withdraw` | → `Application`. `409 cannot_withdraw` |
| GET | `/api/v1/candidate/saved-vacancies?page=` | → `VacancyPage` (no facets) |
| PUT | `/api/v1/candidate/saved-vacancies/{vacancy_id}` | → `204` (idempotent) |
| DELETE | `/api/v1/candidate/saved-vacancies/{vacancy_id}` | → `204` |

`Application = {id, status, cover_note, created_at, updated_at, vacancy: VacancyCard}`

### HR (company members; non-members → 404 as in Phase 1)
| Method | Path | Body → Response |
|---|---|---|
| GET | `/api/v1/companies/{company_id}/vacancies?status=&q=&page=` | → `{items: HrVacancy[], total, page, page_size}` |
| POST | `/api/v1/companies/{company_id}/vacancies` | `VacancyInput` → `201 VacancyDetail` (status `draft`) |
| GET | `/api/v1/companies/{company_id}/vacancies/{vacancy_id}` | → `VacancyDetail` |
| PATCH | `/api/v1/companies/{company_id}/vacancies/{vacancy_id}` | partial `VacancyInput` + optional `status` → `VacancyDetail`. Transitions: draft→published, published→closed, closed→published, any→archived. `409 invalid_status_transition` |
| DELETE | `/api/v1/companies/{company_id}/vacancies/{vacancy_id}` | drafts only → `204`; else `409 not_draft` |
| GET | `/api/v1/companies/{company_id}/applications?vacancy_id=&status=&page=` | → `{items: HrApplication[], total, page, page_size}` newest first |
| PATCH | `/api/v1/companies/{company_id}/applications/{application_id}` | `{status: "applied"\|"shortlisted"\|"rejected"}` → `HrApplication`. Withdrawn ones → `409 application_withdrawn` |
| GET | `/api/v1/companies/{company_id}/applications/{application_id}/resume` | file download; `404` if none |

`VacancyInput = {title (3–200), description (≤ 20000), requirements (≤ 10000)?, profession_area, country (ISO2, default "UZ"), region_code?, city?, remote_type, employment_type, experience_level, salary_min?, salary_max?, currency, skills: [{skill_id, weight 1–5, is_required}] (≤ 20)}`
`HrVacancy = VacancyCard (viewer=null) + {status, applications_count, new_applications_count, updated_at}`; `HrVacancyPage` also has `counts_by_status: {draft, published, closed, archived}` (whole company, ignores filters).
`HrApplication = {id, status, cover_note, created_at, updated_at, vacancy: {id, title}, candidate: {user_id, full_name, email, headline, country, city, experience_years, desired_salary_min, desired_salary_max, currency, has_resume}}`

## Questions, tasks, assessments (Phase 3)
Company bank (members of the company; others → 404). Same routes under `/api/v1/admin/templates/{questions|tasks}` for global templates (role `admin` only, `403` otherwise; companies can read approved templates via `include_global=true` but never edit them).

| Method | Path | Body → Response |
|---|---|---|
| GET | `/api/v1/companies/{cid}/questions?include_global=&skill_id=&approved=&source=manual\|ai_generated&q=&page=&page_size=` | → `{items: QuestionOut[], total, page, page_size}` |
| POST | `/api/v1/companies/{cid}/questions` | `QuestionIn` → `201 QuestionOut` |
| GET / PUT / DELETE | `/api/v1/companies/{cid}/questions/{item_id}` | PUT takes full `QuestionIn`; editing resets `verification_status` to `not_checked` |
| POST | `/api/v1/companies/{cid}/questions/{item_id}/approve` | `{approved: bool}` → `QuestionOut` |
| … | `/api/v1/companies/{cid}/tasks…` | same shape with `TaskIn` / `TaskOut` |

`Rubric = {criteria: [{key: [a-z0-9_], name, description?, max_points 1–10, levels?: {"0": "...", "5": "..."}}] (1–10)}`
`QuestionIn = {skill_id?, type: open|mcq|scenario, difficulty 1–5, text, language uz|ru|en, options? (mcq, 2–8), correct_answer? (mcq, option indexes), rubric? + reference_answer? (required for open/scenario)}`
`TaskIn = {skill_id?, task_type: "coding", difficulty, title, statement, language, allowed_languages ⊆ python|javascript|typescript|sql|go|java, starter_code {lang: code}, visible_tests [{name, input, output}] (1–20), hidden_tests (1–50), time_limit_minutes 5–180, cpu_time_limit_s, memory_limit_mb, rubric, reference_solution? {language, code}}` — tests are stdin → expected stdout.
`QuestionOut/TaskOut` = the input fields + `{id, company_id, is_global, source, is_approved, verification_status: not_checked|passed|flagged|sandbox_pending, verification_report: {issues: [], first_attempt: [], sandbox?}, model, prompt_version, created_at, updated_at}`.

Assessment (one per vacancy):
| Method | Path | Body → Response |
|---|---|---|
| GET | `/api/v1/companies/{cid}/vacancies/{vid}/assessment` | → `AssessmentOut`; `404` until first saved |
| PUT | same | `AssessmentIn` → `AssessmentOut` (create or replace) |
| POST | `…/assessment/generate` | `{question_count 0–20 (8), task_count 0–3 (1), difficulty 1–5 (3), skill_ids? }` → `202 GenerationJob`. `409 generation_in_progress`, `503 queue_unavailable` |
| GET | `/api/v1/companies/{cid}/generation-jobs/{job_id}` | → `GenerationJob` — poll every ~2 s until `succeeded`/`failed` |

`AssessmentIn = {language, stage1_config: {task_ids (≤5), duration_minutes?, pass_threshold?}, stage2_config: {duration_minutes?, question_count?, adaptive, mode: voice|text, pass_threshold?}, integrity_config: {any IntegrityThresholds field, e.g. paste_max_lines, inactivity_limit_s}, question_mode: manual|ai_generated|mixed, allow_skill_reuse, auto_approve_ai_items, questions: [{question_id, is_mandatory}] (order = list order)}`. Unknown/foreign items → `422 unknown_items`; bad threshold override → `422 validation_error`.
`AssessmentOut = AssessmentIn fields + {id, vacancy_id, tasks: TaskOut[], questions: QuestionOut[], mandatory_question_ids, effective_thresholds (global defaults merged with overrides — show as placeholders/hints), ready: bool, issues: [{code, severity: blocking|warning, details}], updated_at}`.
Issue codes: `stage1_no_tasks`, `task_not_approved`, `task_not_sandbox_validated` (warning), `question_not_approved`, `question_language_mismatch` (warning), `stage2_not_enough_questions` {needed, approved}, `too_many_mandatory_questions`.
`GenerationJob = {id, assessment_id, status: queued|running|succeeded|failed, params, result: {question_ids, task_ids, flagged}, error, created_at, updated_at}`. Generated items are added to the assessment automatically (questions appended; tasks only if Stage 1 is empty); approved automatically only when `auto_approve_ai_items` is on.
`VacancyCard.has_assessment` is now real (an assessment exists).

## Interview, Stage 1 (Phase 4) — the application's candidate only (others → 404)
Rules, timers and limits are enforced by the server; the browser only displays them.

| Method | Path | Body → Response |
|---|---|---|
| GET | `/api/v1/applications/{aid}/interview` | → `InterviewState` |
| POST | `/api/v1/applications/{aid}/interview/rules` | `{rules_version}` → `InterviewState`. `409 rules_version_mismatch` |
| POST | `/api/v1/applications/{aid}/interview/warmup/run` | `CodeIn` → `RunOut`. Not scored, not recorded. `503 sandbox_unavailable`, `429` |
| POST | `/api/v1/applications/{aid}/interview/stage1` | → `201 Session`; repeat returns the same session. `409 rules_not_accepted`, `application_closed`, `assessment_not_ready` |
| GET | `/api/v1/interview-sessions/{sid}` | → `Session`. Use it after every reconnect |
| POST | `/api/v1/interview-sessions/{sid}/tasks/{tid}/run` | `CodeIn` → `RunOut`; counts as activity. `409 session_not_active`, `task_not_current`; `422 language_not_allowed`; `503 sandbox_unavailable`; `429` |
| POST | `/api/v1/interview-sessions/{sid}/tasks/{tid}/submit` | `CodeIn` → `Session` (next task becomes current; after the last one `status: completed`) |

`CodeIn = {language, code (≤200 000 chars)}`
`RunOut = {results: [{name, passed, status: passed|failed|error|timeout, stdout, stderr, time_ms}]}`
`warmup` also carries `language_labels`.
`InterviewState = {application_id, application_status, vacancy_id, vacancy_title, language, rules_version, rules_accepted, blocked_reason: null|application_closed|assessment_not_ready, warmup: null|{minutes, languages, starter_code, visible_tests}, session: null|Session}`
`Session = {id, application_id, stage, status: in_progress|completed|expired|abandoned|disqualified, disqualification_reason: null|external_paste|inactivity|abandoned, started_at, expires_at, completed_at, server_now, last_activity_at, current_task_index, tasks: SessionTask[], integrity: {paste_max_lines, paste_max_chars, inactivity_warning_s, inactivity_limit_s, reconnect_window_s}, language_labels: {python: "Python 3.8", …}, result: null|Stage1Result}`
`Stage1Result = {state: pending|done|failed, score_percent, pass_threshold, passed, tasks: [{title, hidden_passed, hidden_total, code_review_percent, strengths: string[], weaknesses: string[]}]}`. `null` unless the session is `completed` or `expired`. While `pending`, poll `GET /interview-sessions/{sid}` every ~3 s.
`SessionTask = {id, state: pending|current|submitted, title, statement, allowed_languages, starter_code, visible_tests: [{name, input, output}], deadline_at, language, code, run_count, last_results}` — pending tasks carry only `id` and `state`. `code` is the last saved draft.

After Stage 1 ends with `completed` or `expired` the application stays `stage1_in_progress` until scoring, within about 15 s plus run time, then becomes `stage2_pending` or `stage1_failed`. Disqualified → `stage1_disqualified`; abandoned → `stage1_failed`.

### Telemetry WebSocket
`GET ws(s)://<API host>/api/v1/interview-sessions/{sid}/events`. It goes **directly to the API, not through the Next proxy** (route handlers cannot upgrade): the base URL comes from `NEXT_PUBLIC_WS_URL` (local default `ws://localhost:8000`). Auth: `sp_access` cookie; `Origin` must be in `CORS_ORIGINS`. Close codes: `4401` unauthorized (refresh, then reconnect), `4403` origin, `4404` not found, `4409` the session continued in a newer tab (do not reconnect), `1009` message over 1 MB, `1000` stage ended. Reject before accept shows in the browser as a failed handshake.

Client → server:
- `{"type":"events","sent_t_ms":<client clock now>,"events":[{seq,task_id,t_ms,type,payload}]}`, every 1–2 s, ≤500 events. `seq` is the page's own counter: from 1 on every page load, up by one. The first `state` message carries `page`; reconnect with `?page=<page>` and resend what is unacknowledged (duplicates are dropped). A page without `?page=` is a new page. `ack_seq` is in the page's own numbers. `t_ms` is the same client clock as `sent_t_ms`.
- `{"type":"draft","task_id","language","code"}` every ~5 s when the code changed.

Server → client: `{"type":"state",status,reason,current_task_index,inactive_s,warning_s,limit_s,ack_seq}` after every message and about every 2 s, with `page` on the first one; `{"type":"error","code":"invalid_message"}`. Show the inactivity warning from `inactive_s >= warning_s` (countdown `limit_s - inactive_s`). If `current_task_index` changed or `status` is no longer `in_progress`, refetch the session.

Event `type` and `payload`:
| type | payload |
|---|---|
| `insert` / `replace` | `{range, text, source: keyboard\|auto_close\|undo\|redo\|internal_paste\|format\|unknown}`. A change the editor cannot explain must be `unknown`: above the paste limit it disqualifies (§7.1) |
| `delete` | `{range, length, source}` |
| `cursor` | `{line, column}` |
| `copy` | `{text, cut?: true}` |
| `paste_internal` | `{text}`. Must equal the `text` of an earlier `copy` in this session, or it counts as external |
| `editor_reset` | `{language, code}`: the editor was recreated (language switch, restored draft). Send it whenever the content changes without an edit event, or a replay breaks |
| `paste_external_blocked` | `{length, lines}` only, never the text. Above the limit → disqualified. Also used for external drag-and-drop |
| `focus_lost`, `focus_gained`, `fullscreen_exit`, `visibility_hidden`, `visibility_visible`, `idle_start`, `idle_end` | `{}` |

Do not send `run`: the server records it. Activity (§7.1b) is `insert`, `delete`, `replace` and Run only.

## Stage 1 report and replay for HR (Phase 5) — company members (others → 404)
| Method | Path | Response |
|---|---|---|
| GET | `/api/v1/companies/{cid}/applications/{aid}/stage1` | `HrStage1Report`; `404` if Stage 1 was not started |
| GET | `/api/v1/companies/{cid}/applications/{aid}/stage1/replay/{task_id}` | `Replay` |

`HrStage1Report = {application_id, session_id, status, disqualification_reason, evaluation_state: pending|done|failed, started_at, completed_at, score_percent, hidden_tests_percent, code_review_percent, pass_threshold, passed, needs_review, suspicion_percent, suspicion_label: low|medium|high, reasons: [{type, severity, at_ms, evidence}] (top 5), signals: [{id, type, severity, evidence, created_at}], tasks: HrTask[]}`
`HrTask = {id, title, language, final_code, run_count, shown_at, submitted_at, visible_results, hidden_results: [{name, passed, status, time_ms}], review: null|{status: ok|needs_review, score_percent, criteria: [{key, score, max_score, rationale, lines}], findings: [{line, comment}], strengths: [{text, lines}], weaknesses: [{text, lines}], rationale, confidence, model, prompt_version}}`
`Replay = {task_id, language, initial_code, final_code, start_ms, end_ms, events: [{seq, t_ms, type, payload}]}`, sorted for playing. Apply `insert`, `replace`, `delete` with `payload.range` (Monaco range) and `editor_reset` (`payload.code`, `payload.language`) to `initial_code`. `t_ms` is from session start; the task's timeline runs `start_ms`–`end_ms`.
`HrApplication` gains `suspicion_percent`, `suspicion_label`, `disqualification_reason`.

Signal types and their `evidence`: `docs/INTEGRITY.md`.

## Interview, Stage 2 (Phase 6) — the application's candidate only (others → 404)
`GET /api/v1/applications/{id}/interview` now also returns `stage2_available`, `stage2_session_id`, `stage2_status`, `stage2_mode` (`voice`|`text`). Rules acceptance is shared with Stage 1. Every route below returns `Stage2SessionOut`, except audio.

| Method | Path | Notes |
|---|---|---|
| POST | `/api/v1/applications/{id}/interview/stage2/start` | 201. Idempotent. `409 stage2_not_available` unless the application is `stage2_pending`; `409 rules_not_accepted` |
| GET | `/api/v1/interview-sessions/{sid}/stage2` | Current state. Also resumes: builds the next question if it is missing. While `preparing: true`, call again in about 2 s |
| POST | `/api/v1/interview-sessions/{sid}/stage2/turns/{tid}/answer` | Multipart: `text` (text mode), or `audio` + optional `transcript_hint`, `silence_ms` (voice mode). A retry on a closed turn returns the current state. `422 audio_required`, `invalid_audio`, `answer_too_long`; `413 audio_too_large` |
| GET | `/api/v1/interview-sessions/{sid}/stage2/turns/{tid}/question-audio` | The question's audio (`has_audio: true` only) |
| POST | `/api/v1/interview-sessions/{sid}/stage2/fallback-text` | Voice → text, one way, when voice fails. Recorded as `voice_fallback` |
| WS | `/api/v1/interview-sessions/{sid}/stage2/events` | Same protocol as the Stage 1 socket: `?page=`, `{"type":"events","sent_t_ms","events":[…]}`, `state` replies with `ack_seq`, close codes 4401/4403/4404/4409. `current_task_index` here = the current turn's `order`: when it changes, refetch the state |

`Stage2SessionOut`: `id, application_id, status, reason, mode (voice|text), can_fall_back_to_text, transcript_hint_needed, language, started_at, expires_at, server_now, question_count, answered_count, answer_limit_s, warning_s, limit_s, audio_max_bytes, answer_max_chars, preparing, current_turn`.

`current_turn` (`TurnOut`, null when none is open): `id, order, kind (own_code|bank|follow_up), is_follow_up, text, has_audio, code ({language, code, lines} for questions on the candidate's own code, else null), asked, answer_deadline, think_available`.

`transcript_hint_needed: true` means the mock STT is active, so it cannot hear: show a box for what was said and send it as `transcript_hint`. Real providers ignore this field.

**Socket events** (`payload.turn_id` = current turn; events naming another turn are stored but move no clock):
- `question_played`: audio finished, or the text was shown when there is no audio. Answer clocks start. The server starts them anyway after `question_max_playback_s`.
- `speech_activity` (VAD, at most every ~3 s while speaking), `typing_activity` (text box, same pace, no content): activity for the 60/90 s timer. The first one is the answer's start.
- `think`: the "let me think" button. Resets the timer once per question.
- `focus_lost`, `focus_gained`, `visibility_hidden`, `visibility_visible`, `fullscreen_exit`, `paste_external_blocked` (no payload needed). Anything else is dropped.

Application status: `stage2_pending` → `stage2_in_progress` → stays there after the session ends until Phase 7's evaluator (`evaluated`), or `stage2_disqualified` (`reason`: `inactivity`, `abandoned`). Session `status`: `completed`, `expired` (time ran out, answers kept), `disqualified`, `abandoned`.

## Reports, ranking, overrides, results (Phase 7)
The worker (`sweep_reports`, about every 15 s) runs the final Stage 2 evaluation and writes the report when Stage 2 ends, or when an application stops early (`stage1_failed`, `stage1_disqualified`, `stage2_disqualified`). `stage2_in_progress` → `evaluated`.

**HR list:** `GET /api/v1/companies/{cid}/applications` gains `tab` (`ranked`|`excluded`), `min_score` (0–100), `sort` (`recent` default | `score`: best first, unscored last). `excluded` = failed or disqualified, or `evaluated` with Stage 2 below its threshold. `HrApplication` gains `final_score, stage1_score, stage2_score, recommendation, needs_review, report_state (pending|done|failed|null)`. `PATCH …/applications/{aid}` also accepts `status: hired`.

| Method | Path | Response |
|---|---|---|
| GET | `/api/v1/companies/{cid}/applications/{aid}/report` | `HrReport`. Works before the report exists (`state: null`) |
| POST | `/api/v1/companies/{cid}/applications/{aid}/overrides` | `HrReport`. `{field, value, comment (3–2000)}`. `409 report_not_ready`, `422 invalid_override`, `409 not_disqualified` |
| GET | `/api/v1/companies/{cid}/applications/{aid}/notes` | `[{id, text, author_name, created_at}]`, newest first. Private to the company |
| POST | `/api/v1/companies/{cid}/applications/{aid}/notes` | 201 note. `{text (1–4000)}` |
| GET | `/api/v1/companies/{cid}/applications/{aid}/stage2/turns/{tid}/answer-audio` | Audio bytes (audited). `404` if none |
| GET | `/api/v1/applications/{aid}/results` | `CandidateResults`, the application's candidate only (others → 404) |

Everything under `/companies/…`: company members only, others → 404.

`HrReport = {application_id, candidate_name, vacancy_title, status, state: pending|done|failed|null, needs_review, stage1_score, stage2_score, overall_score, per_skill: [{skill_id, name, percent, stage1_percent, stage2_percent}], summary, strengths: Point[], gaps: Point[], recommendation: strong_yes|yes|maybe|no|null, suspicion_percent, suspicion_label, disqualification_reason, reasons: [{stage, type, severity, at_ms, evidence}] (top 5), signals: [{id, stage, type, severity, at_ms, evidence, created_at}], stage2: null|HrStage2, overrides: [{id, field, old_value, new_value, comment, actor_name, created_at}] (newest first), model, prompt_version}`
`Point = {text, ref (task_N|turn_N, N = order), quote (answers), lines, excerpt (the cited code, from the stored code)}`
`HrStage2 = {session_id, status, mode, evaluation_state, disqualification_reason, pass_threshold, passed, turns: [{id, order, kind, is_follow_up, question_text, transcript, answer_source, has_answer_audio, response_latency_ms, silence_ms, flags, percent, needs_review, criteria: [{key, score, rationale, quote}], rationale, confidence, model, prompt_version}]}`
Stage 1 detail and replay stay on `/stage1` and `/stage1/replay/{task_id}`.

`recommendation` and `overall_score` are `null` for an application stopped before the end. `summary` empty with `needs_review: true`: the writer gave no checked result; scores are still valid. `state: failed`: the job gave up, a person has to look.

**Overrides.** `field`: `stage1_score`, `stage2_score`, `overall_score` (`value` 0–100), `recommendation` (`value` as above), `disqualification` (`value: null` lifts it). A stage score recalculates overall, unless overall was overridden. Effects: `stage1_score` at or above the pass mark on a `stage1_failed` application → `stage2_pending`; `stage2_score` moves the application between tabs; lifting Stage 1 → `stage2_pending`; lifting Stage 2 → `evaluated`, scored on what was answered. Suspicion cannot be overridden and is unchanged by any of these. Later report rewrites keep overrides.

`CandidateResults = {application_id, vacancy_title, status, state: not_ready|pending|done|failed, disqualification_reason, stage1_score, stage2_score, overall_score, per_skill: [{name, percent}], tasks: [{title, hidden_passed, hidden_total, code_review_percent, strengths, weaknesses}], answers: [{order, question_text, percent}], mistakes: [{text, about}], learn_next: [{topic, reason}]}`. Never holds suspicion, signals, recommendation, reference answers, or hidden test names and inputs. Disqualified: `disqualification_reason` is the only integrity fact; word it neutrally.

## Phase 8: verified skills

Rules and reasons: D-130…D-133. No response names the company or application a result came from.

- `GET /candidate/verified-skills` → `[{id, skill_id, name, score, level (basic|intermediate|advanced), verified_at, valid_until, is_public (default false), is_valid}]`. Expired rows stay in this list with `is_valid: false`.
- `PATCH /candidate/verified-skills/{id}` `{is_public}` → the same row. Someone else's row → `404`.
- `GET /profiles/{candidate_id}` (no auth) → `PublicProfile = {candidate_id, full_name, headline, country, city, experience_years, skills: [{skill_id, name, score, level, verified_at, valid_until}]}`. Only public, valid skills. `404` when there are none.
- `GET /companies/{id}/talent?skill_id=…&skill_id=…&min_score=&page=&page_size=` (company member) → `{items: PublicProfile[], total, page, page_size}`. Open-to-work candidates holding every requested skill publicly and validly, each at `min_score` or above. Best average on the requested skills first. Skills to choose from: `GET /skills?q=`.
- `GET /applications/{id}/interview` adds `reuse: null | {skills: [{skill_id, name, score, level, valid_until, tasks_skipped, questions_skipped}], tasks_total, tasks_skipped, questions_total, questions_skipped}`. Present only before Stage 1 starts and only when something can be skipped.
- `POST /applications/{id}/interview/stage1` takes an optional body `{reuse: bool = false}`. Nothing is skipped unless `reuse` is true. The choice is final for this application and covers both stages.
- All tasks covered: the response has `status: completed`, `tasks: []`, `result.passed`, and the application moves to `stage2_pending`.
- `POST …/interview/stage2/start` with all questions covered: `status: completed`, `current_turn: null`. The report follows from the worker, as after any Stage 2 (poll `GET /applications/{id}/results`).
- `HrReport` adds `reused_skills: [{skill_id, name, stage (stage1|stage2), percent, verified_at, valid_until}]`; `per_skill[].reused` lists the stages taken from a verified skill. `CandidateResults.per_skill[].reused` is a boolean.
