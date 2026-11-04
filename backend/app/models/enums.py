from enum import StrEnum


class UserRole(StrEnum):
    candidate = "candidate"
    hr = "hr"
    admin = "admin"


class MemberRole(StrEnum):
    owner = "owner"
    hr = "hr"


class TokenPurpose(StrEnum):
    refresh = "refresh"
    email_verification = "email_verification"
    password_reset = "password_reset"
    telegram_link = "telegram_link"


class Locale(StrEnum):
    uz = "uz"
    ru = "ru"
    en = "en"


class RemoteType(StrEnum):
    office = "office"
    remote = "remote"
    hybrid = "hybrid"


class EmploymentType(StrEnum):
    full_time = "full_time"
    part_time = "part_time"
    project = "project"
    internship = "internship"


class ExperienceLevel(StrEnum):
    no_experience = "no_experience"
    between_1_3 = "between_1_3"
    between_3_6 = "between_3_6"
    more_than_6 = "more_than_6"


class VacancyStatus(StrEnum):
    draft = "draft"
    published = "published"
    closed = "closed"
    archived = "archived"


class ApplicationStatus(StrEnum):
    """Full lifecycle from spec §5; Phase 2 uses applied/shortlisted/rejected/withdrawn."""

    applied = "applied"
    interview_pending = "interview_pending"
    stage1_in_progress = "stage1_in_progress"
    stage1_failed = "stage1_failed"
    stage1_disqualified = "stage1_disqualified"
    stage2_pending = "stage2_pending"
    stage2_in_progress = "stage2_in_progress"
    stage2_disqualified = "stage2_disqualified"
    evaluated = "evaluated"
    shortlisted = "shortlisted"
    rejected = "rejected"
    hired = "hired"
    withdrawn = "withdrawn"


class QuestionType(StrEnum):
    open = "open"
    mcq = "mcq"
    scenario = "scenario"


class TaskType(StrEnum):
    coding = "coding"  # later: written_case, spreadsheet, … (spec §1.1)


class ItemSource(StrEnum):
    manual = "manual"
    ai_generated = "ai_generated"


class VerificationStatus(StrEnum):
    """Automatic checks of an item: item_verifier (+ sandbox run for tasks)."""

    not_checked = "not_checked"
    passed = "passed"
    flagged = "flagged"
    sandbox_pending = "sandbox_pending"  # verifier ok, sandbox not available yet (until Phase 4)


class QuestionMode(StrEnum):
    manual = "manual"
    ai_generated = "ai_generated"
    mixed = "mixed"


class JobStatus(StrEnum):
    queued = "queued"
    running = "running"
    succeeded = "succeeded"
    failed = "failed"


class InterviewStage(StrEnum):
    stage1 = "stage1"
    stage2 = "stage2"


class SessionStatus(StrEnum):
    not_started = "not_started"
    in_progress = "in_progress"
    completed = "completed"
    expired = "expired"
    abandoned = "abandoned"
    disqualified = "disqualified"


class EditorEventType(StrEnum):
    insert = "insert"
    delete = "delete"
    replace = "replace"  # type: ignore[assignment]
    cursor = "cursor"
    run = "run"
    paste_internal = "paste_internal"
    paste_external_blocked = "paste_external_blocked"
    copy = "copy"
    focus_lost = "focus_lost"
    focus_gained = "focus_gained"
    fullscreen_exit = "fullscreen_exit"
    visibility_hidden = "visibility_hidden"
    visibility_visible = "visibility_visible"
    idle_start = "idle_start"
    idle_end = "idle_end"
    # Stage 2 (payload: {"turn_id"}): activity is reported by the client's VAD / text box.
    question_played = "question_played"
    speech_activity = "speech_activity"
    typing_activity = "typing_activity"
    think = "think"
    editor_reset = "editor_reset"  # new language or restored draft: {language, code} (D-086)


class SignalSeverity(StrEnum):
    info = "info"
    low = "low"
    medium = "medium"
    high = "high"
    disqualifying = "disqualifying"


class EvaluationState(StrEnum):
    pending = "pending"
    done = "done"
    failed = "failed"


class EvaluationStatus(StrEnum):
    ok = "ok"
    needs_review = "needs_review"


class NotificationChannel(StrEnum):
    email = "email"
    telegram = "telegram"


class NotificationStatus(StrEnum):
    pending = "pending"
    sent = "sent"
    failed = "failed"
    skipped = "skipped"


class NotificationEvent(StrEnum):
    new_applicant = "new_applicant"
    report_ready = "report_ready"
    stage1_invite = "stage1_invite"
    stage2_invite = "stage2_invite"
    stage1_failed = "stage1_failed"
    disqualified = "disqualified"
    results_ready = "results_ready"
    shortlisted = "shortlisted"
    rejected = "rejected"
    hired = "hired"
