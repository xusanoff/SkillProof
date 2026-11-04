import type { BodyOf, ResponseOf } from '@/lib/api';

export type InterviewState = ResponseOf<'/api/v1/applications/{application_id}/interview', 'get'>;
export type Session = NonNullable<InterviewState['session']>;
export type SessionTask = Session['tasks'][number];
export type ReuseOffer = NonNullable<InterviewState['reuse']>;
export type StartBody = BodyOf<'/api/v1/applications/{application_id}/interview/stage1', 'post'>;

/** Everything in Stage 1 is covered by verified skills (only when the candidate chose to reuse). */
export function coversStage1(offer: ReuseOffer | null, reuse: boolean): boolean {
  return !!offer && reuse && offer.tasks_total > 0 && offer.tasks_skipped >= offer.tasks_total;
}

/** Everything in Stage 2 is covered by verified skills (only when the candidate chose to reuse). */
export function coversStage2(offer: ReuseOffer | null, reuse: boolean): boolean {
  return (
    !!offer &&
    reuse &&
    offer.questions_total > 0 &&
    offer.questions_skipped >= offer.questions_total
  );
}
export type CodeIn = BodyOf<'/api/v1/applications/{application_id}/interview/warmup/run', 'post'>;
export type RunOut = ResponseOf<
  '/api/v1/applications/{application_id}/interview/warmup/run',
  'post'
>;
export type TestResult = RunOut['results'][number];

export const RULES_LANGS = ['uz', 'ru', 'en'] as const;
export type RulesLang = (typeof RULES_LANGS)[number];

/** Interview language (from the server) — not the site language. Unknown / null → the site language. */
export function interviewLang(state: InterviewState, siteLocale: string): RulesLang {
  const pick = (v: string | null | undefined) =>
    (RULES_LANGS as readonly string[]).includes(v ?? '') ? (v as RulesLang) : null;
  return pick(state.language) ?? pick(siteLocale) ?? 'uz';
}

/** Statuses of the application that may open the interview. */
export const INTERVIEW_ENTRY_STATUSES = [
  'applied',
  'interview_pending',
  'stage1_in_progress',
  'stage2_pending',
  'stage2_in_progress',
] as const;

export function canEnterInterview(status: string): boolean {
  return (INTERVIEW_ENTRY_STATUSES as readonly string[]).includes(status);
}

/** Finished Stage 1: the interview page shows the outcome (and the result, if there is one). */
export function canViewInterviewResult(status: string): boolean {
  return ['stage1_failed', 'stage1_disqualified', 'stage2_disqualified'].includes(status);
}

export function entryLabelKey(status: string): 'start' | 'resume' | 'stage2Start' | 'stage2Open' {
  if (status === 'stage2_pending') return 'stage2Start';
  if (status === 'stage2_in_progress') return 'stage2Open';
  return status === 'stage1_in_progress' ? 'resume' : 'start';
}

export type Phase = 'blocked' | 'ended' | 'rules' | 'check' | 'warmup' | 'stage1';

export const ENDED_STATUSES = ['completed', 'expired', 'abandoned', 'disqualified'] as const;

/** Where the candidate is. Local steps (`check`, `warmup`) are only UI; everything else is server state. */
export function phaseOf(
  state: InterviewState,
  local: { checked: boolean; warmupDone: boolean; skipSetup?: boolean },
): Phase {
  const s = state.session;
  if (s && (ENDED_STATUSES as readonly string[]).includes(s.status)) return 'ended';
  if (state.blocked_reason && !s) return 'blocked';
  if (!state.rules_accepted) return 'rules';
  if (s && s.status === 'in_progress') return 'stage1';
  if (local.skipSetup) return 'stage1';
  if (!local.checked) return 'check';
  if (state.warmup && !local.warmupDone) return 'warmup';
  return 'stage1';
}

/**
 * Server clock: `offset = server_now - local monotonic clock` taken when the response arrived,
 * so the countdown never depends on the browser's wall clock.
 */
export function serverClock(serverNowIso: string, monotonicNowMs: number) {
  const offset = Date.parse(serverNowIso) - monotonicNowMs;
  return (monotonicMs: number) => offset + monotonicMs;
}

/** Whole seconds left until `deadlineIso` on the server clock (never negative). */
export function secondsLeft(
  deadlineIso: string | null | undefined,
  serverNowMs: number,
): number | null {
  if (!deadlineIso) return null;
  return Math.max(0, Math.ceil((Date.parse(deadlineIso) - serverNowMs) / 1000));
}

export function formatClock(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function currentTask(session: Session): SessionTask | null {
  return (
    session.tasks.find((t) => t.state === 'current') ??
    session.tasks[session.current_task_index] ??
    null
  );
}

export function wsUrl(sessionId: string): string {
  const base = (process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8000').replace(/\/$/, '');
  return `${base}/api/v1/interview-sessions/${sessionId}/events`;
}

/** `starter_code` for a language, falling back to an empty file. */
export function starterFor(starter: Record<string, string>, language: string): string {
  return starter[language] ?? '';
}

export const MONACO_LANG: Record<string, string> = {
  python: 'python',
  javascript: 'javascript',
  typescript: 'typescript',
  sql: 'sql',
  go: 'go',
  java: 'java',
};

/** Inactivity countdown to show, or null when no warning is due. */
export function inactivityCountdown(
  state: {
    inactive_s: number;
    warning_s: number;
    limit_s: number;
  } | null,
): number | null {
  if (!state || state.inactive_s < state.warning_s) return null;
  return Math.max(0, state.limit_s - state.inactive_s);
}

export type ResultState = 'pending' | 'failed' | 'done';

/** Result of a finished Stage 1: `null` for in-progress, disqualified and abandoned sessions. */
export function resultState(session: Session | undefined): ResultState | null {
  if (!session || (session.status !== 'completed' && session.status !== 'expired')) return null;
  const st = session.result?.state;
  return st === 'done' || st === 'failed' ? st : 'pending';
}

export const RESULT_POLL_MS = 3000;

export function needsResultPolling(session: Session | undefined): boolean {
  return resultState(session) === 'pending';
}
