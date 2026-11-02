import { z } from 'zod';
import type { BodyOf, ResponseOf } from '@/lib/api';

type QP = '/api/v1/companies/{company_id}/questions';
type TP = '/api/v1/companies/{company_id}/tasks';
type AP = '/api/v1/companies/{company_id}/vacancies/{vacancy_id}/assessment';

export type QuestionOut = ResponseOf<QP, 'get'>['items'][number];
export type TaskOut = ResponseOf<TP, 'get'>['items'][number];
export type QuestionIn = BodyOf<QP, 'post'>;
export type TaskIn = BodyOf<TP, 'post'>;
export type AssessmentOut = ResponseOf<AP, 'get'>;
export type AssessmentIn = BodyOf<AP, 'put'>;
export type GenerateIn = BodyOf<`${AP}/generate`, 'post'>;
export type GenerationJob = ResponseOf<
  '/api/v1/companies/{company_id}/generation-jobs/{job_id}',
  'get'
>;
export type Rubric = NonNullable<QuestionIn['rubric']>;
export type ReadinessIssue = AssessmentOut['issues'][number];
export type VerificationStatus = QuestionOut['verification_status'];
export type ItemSource = QuestionOut['source'];

export const LANGUAGES = ['uz', 'ru', 'en'] as const;
export const asLang = (v: string): (typeof LANGUAGES)[number] =>
  (LANGUAGES as readonly string[]).includes(v) ? (v as (typeof LANGUAGES)[number]) : 'uz';
export const QUESTION_TYPES = ['open', 'mcq', 'scenario'] as const;
export const CODE_LANGUAGES = ['python', 'javascript', 'typescript', 'sql', 'go', 'java'] as const;
export const QUESTION_MODES = ['manual', 'ai_generated', 'mixed'] as const;
export const SOURCES = ['manual', 'ai_generated'] as const;
export const DIFFICULTIES = ['1', '2', '3', '4', '5'] as const;

// Limits mirror docs/API.md; the API re-validates.
export const OPTIONS_MIN = 2;
export const OPTIONS_MAX = 8;
export const CRITERIA_MAX = 10;
export const STAGE1_TASKS_MAX = 5;
export const KEY_PATTERN = /^[a-z0-9_]+$/;

// ----------------------------------------------------------------- Rubric

export interface CriterionValues {
  key: string;
  name: string;
  description: string;
  max_points: string;
  /** One `score: text` per line. */
  levels: string;
}
export interface RubricValues {
  criteria: CriterionValues[];
}

export const emptyCriterion = (): CriterionValues => ({
  key: '',
  name: '',
  description: '',
  max_points: '5',
  levels: '',
});

export function parseLevels(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const m = /^\s*(\d+)\s*[:=]\s*(.+?)\s*$/.exec(line);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

export function formatLevels(levels: Record<string, string> | undefined): string {
  return Object.entries(levels ?? {})
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');
}

const criterionSchema = z.object({
  key: z.string().regex(KEY_PATTERN, 'rubricKey'),
  name: z.string().trim().min(1, 'required'),
  description: z.string(),
  max_points: z.string().refine((v) => /^\d+$/.test(v) && +v >= 1 && +v <= 10, 'range'),
  levels: z.string(),
});
const looseCriterion = z.object({
  key: z.string(),
  name: z.string(),
  description: z.string(),
  max_points: z.string(),
  levels: z.string(),
});
export const rubricSchema = z.object({
  criteria: z.array(criterionSchema).min(1, 'rubricMin').max(CRITERIA_MAX, 'rubricMax'),
});

export function toRubric(v: RubricValues): Rubric {
  return {
    criteria: v.criteria.map((c) => ({
      key: c.key,
      name: c.name.trim(),
      description: c.description.trim(),
      max_points: Number(c.max_points),
      levels: parseLevels(c.levels),
    })),
  };
}

export function toRubricValues(
  rubric: { [key: string]: unknown } | null | undefined,
): RubricValues {
  const raw = (rubric as Partial<Rubric> | null | undefined)?.criteria ?? [];
  return {
    criteria: raw.map((c) => ({
      key: c.key,
      name: c.name,
      description: c.description ?? '',
      max_points: String(c.max_points),
      levels: formatLevels(c.levels),
    })),
  };
}

// --------------------------------------------------------------- Question

export interface OptionValue {
  text: string;
  correct: boolean;
}

export const questionSchema = z
  .object({
    type: z.enum(QUESTION_TYPES),
    difficulty: z.enum(DIFFICULTIES),
    language: z.enum(LANGUAGES),
    skill_id: z.string(),
    text: z.string().trim().min(1, 'required').max(4000, 'tooLong'),
    options: z.array(z.object({ text: z.string(), correct: z.boolean() })),
    reference_answer: z.string(),
    // Strictly validated below, and only for open / scenario (an MCQ keeps an unused draft).
    rubric: z.object({ criteria: z.array(looseCriterion) }),
  })
  .superRefine((v, ctx) => {
    const add = (path: (string | number)[], message: string) =>
      ctx.addIssue({ code: 'custom', path, message });
    if (v.type === 'mcq') {
      if (v.options.length < OPTIONS_MIN) add(['options'], 'optionsMin');
      if (v.options.length > OPTIONS_MAX) add(['options'], 'optionsMax');
      v.options.forEach((o, i) => {
        if (!o.text.trim()) add(['options', i, 'text'], 'required');
      });
      if (!v.options.some((o) => o.correct)) add(['options'], 'correctMin');
    } else {
      if (!v.reference_answer.trim()) add(['reference_answer'], 'required');
      if (v.rubric.criteria.length === 0) add(['rubric', 'criteria'], 'rubricMin');
      if (v.rubric.criteria.length > CRITERIA_MAX) add(['rubric', 'criteria'], 'rubricMax');
      v.rubric.criteria.forEach((c, i) => {
        const r = criterionSchema.safeParse(c);
        if (r.success) return;
        for (const issue of r.error.issues) {
          add(['rubric', 'criteria', i, ...issue.path.map(String)], issue.message);
        }
      });
    }
  });
export type QuestionValues = z.infer<typeof questionSchema>;

export const emptyQuestionValues = (
  language: QuestionValues['language'] = 'uz',
): QuestionValues => ({
  type: 'open',
  difficulty: '3',
  language,
  skill_id: '',
  text: '',
  options: [
    { text: '', correct: false },
    { text: '', correct: false },
  ],
  reference_answer: '',
  rubric: { criteria: [emptyCriterion()] },
});

export function toQuestionValues(q: QuestionOut): QuestionValues {
  return {
    type: q.type,
    difficulty: String(q.difficulty) as QuestionValues['difficulty'],
    language: asLang(q.language),
    skill_id: q.skill_id ?? '',
    text: q.text,
    options: (q.options ?? []).map((text, i) => ({
      text,
      correct: (q.correct_answer ?? []).includes(i),
    })),
    reference_answer: q.reference_answer ?? '',
    rubric: toRubricValues(q.rubric),
  };
}

export function toQuestionBody(v: QuestionValues): QuestionIn {
  const base = {
    skill_id: v.skill_id || null,
    type: v.type,
    difficulty: Number(v.difficulty),
    language: v.language,
    text: v.text.trim(),
  };
  if (v.type === 'mcq') {
    return {
      ...base,
      options: v.options.map((o) => o.text.trim()),
      correct_answer: v.options.flatMap((o, i) => (o.correct ? [i] : [])),
    };
  }
  return { ...base, reference_answer: v.reference_answer.trim(), rubric: toRubric(v.rubric) };
}

// ------------------------------------------------------------------- Task

export interface TestValues {
  name: string;
  input: string;
  output: string;
}
const testSchema = z.object({
  name: z.string(),
  input: z.string(),
  output: z.string().min(1, 'required'),
});

const intRange = (min: number, max: number) =>
  z.string().refine((v) => /^\d+$/.test(v) && +v >= min && +v <= max, 'range');

export const taskSchema = z
  .object({
    difficulty: z.enum(DIFFICULTIES),
    language: z.enum(LANGUAGES),
    skill_id: z.string(),
    title: z.string().trim().min(1, 'required').max(200, 'tooLong'),
    statement: z.string().trim().min(1, 'required').max(20_000, 'tooLong'),
    allowed_languages: z.array(z.enum(CODE_LANGUAGES)).min(1, 'langsMin'),
    starter_code: z.record(z.string(), z.string()),
    visible_tests: z.array(testSchema).min(1, 'testsMin').max(20, 'testsMax'),
    hidden_tests: z.array(testSchema).min(1, 'testsMin').max(50, 'testsMax'),
    time_limit_minutes: intRange(5, 180),
    cpu_time_limit_s: intRange(1, 60),
    memory_limit_mb: intRange(16, 4096),
    rubric: rubricSchema,
    solution_language: z.string(),
    solution_code: z.string(),
  })
  .superRefine((v, ctx) => {
    if (v.solution_code.trim() && !v.allowed_languages.some((l) => l === v.solution_language)) {
      ctx.addIssue({ code: 'custom', path: ['solution_language'], message: 'invalid' });
    }
  });
export type TaskValues = z.infer<typeof taskSchema>;

export const emptyTaskValues = (language: TaskValues['language'] = 'uz'): TaskValues => ({
  difficulty: '3',
  language,
  skill_id: '',
  title: '',
  statement: '',
  allowed_languages: ['python'],
  starter_code: {},
  visible_tests: [{ name: '', input: '', output: '' }],
  hidden_tests: [{ name: '', input: '', output: '' }],
  time_limit_minutes: '30',
  cpu_time_limit_s: '2',
  memory_limit_mb: '256',
  rubric: { criteria: [emptyCriterion()] },
  solution_language: 'python',
  solution_code: '',
});

export function toTaskValues(t: TaskOut): TaskValues {
  const sol = (t as { reference_solution?: { language: string; code: string } | null })
    .reference_solution;
  return {
    difficulty: String(t.difficulty) as TaskValues['difficulty'],
    language: asLang(t.language),
    skill_id: t.skill_id ?? '',
    title: t.title,
    statement: t.statement,
    allowed_languages: t.allowed_languages.filter((l): l is (typeof CODE_LANGUAGES)[number] =>
      (CODE_LANGUAGES as readonly string[]).includes(l),
    ),
    starter_code: { ...t.starter_code },
    visible_tests: t.visible_tests as unknown as TestValues[],
    hidden_tests: t.hidden_tests as unknown as TestValues[],
    time_limit_minutes: String(t.time_limit_minutes),
    cpu_time_limit_s: String(t.cpu_time_limit_s),
    memory_limit_mb: String(t.memory_limit_mb),
    rubric: toRubricValues(t.rubric),
    solution_language: sol?.language ?? t.allowed_languages[0] ?? 'python',
    solution_code: sol?.code ?? '',
  };
}

export function toTaskBody(v: TaskValues): TaskIn {
  const starter: Record<string, string> = {};
  for (const l of v.allowed_languages) {
    if (v.starter_code[l]?.trim()) starter[l] = v.starter_code[l];
  }
  return {
    skill_id: v.skill_id || null,
    task_type: 'coding',
    difficulty: Number(v.difficulty),
    language: v.language,
    title: v.title.trim(),
    statement: v.statement.trim(),
    allowed_languages: v.allowed_languages,
    starter_code: starter,
    visible_tests: v.visible_tests,
    hidden_tests: v.hidden_tests,
    time_limit_minutes: Number(v.time_limit_minutes),
    cpu_time_limit_s: Number(v.cpu_time_limit_s),
    memory_limit_mb: Number(v.memory_limit_mb),
    rubric: toRubric(v.rubric),
    reference_solution: v.solution_code.trim()
      ? { language: v.solution_language, code: v.solution_code }
      : null,
  };
}

// ------------------------------------------------------------- Verification

/** `verification_report.issues` as plain strings (items may be strings or `{message|code}`). */
export function reportIssues(report: { [key: string]: unknown } | null | undefined): string[] {
  const issues = report?.issues;
  if (!Array.isArray(issues)) return [];
  return issues.map((i) => {
    if (typeof i === 'string') return i;
    if (i && typeof i === 'object') {
      const o = i as Record<string, unknown>;
      const text = o.message ?? o.reason ?? o.code ?? o.detail;
      if (typeof text === 'string') return text;
      return JSON.stringify(i);
    }
    return String(i);
  });
}

// --------------------------------------------------------------- Assessment

export interface AssessmentValues {
  language: 'uz' | 'ru' | 'en';
  task_ids: string[];
  s1_duration: string;
  s1_threshold: string;
  s2_duration: string;
  s2_count: string;
  s2_adaptive: boolean;
  s2_mode: 'voice' | 'text';
  s2_threshold: string;
  integrity: { paste_max_lines: string; inactivity_limit_s: string };
  question_mode: (typeof QUESTION_MODES)[number];
  allow_skill_reuse: boolean;
  auto_approve_ai_items: boolean;
  questions: { question_id: string; is_mandatory: boolean }[];
}

export const emptyAssessmentValues: AssessmentValues = {
  language: 'uz',
  task_ids: [],
  s1_duration: '',
  s1_threshold: '',
  s2_duration: '',
  s2_count: '',
  s2_adaptive: true,
  s2_mode: 'voice',
  s2_threshold: '',
  integrity: { paste_max_lines: '', inactivity_limit_s: '' },
  question_mode: 'manual',
  allow_skill_reuse: true,
  auto_approve_ai_items: false,
  questions: [],
};

const optNum = (v: string) => (v.trim() === '' ? null : Number(v));
const numStr = (v: unknown) => (typeof v === 'number' ? String(v) : '');
const optNumber = z.string().refine((v) => v === '' || /^\d+(\.\d+)?$/.test(v), 'integer');

export const assessmentSchema = z.object({
  language: z.enum(LANGUAGES),
  task_ids: z.array(z.string()).max(STAGE1_TASKS_MAX, 'tasksMax'),
  s1_duration: optNumber,
  s1_threshold: optNumber,
  s2_duration: optNumber,
  s2_count: optNumber,
  s2_adaptive: z.boolean(),
  s2_mode: z.enum(['voice', 'text']),
  s2_threshold: optNumber,
  integrity: z.object({ paste_max_lines: optNumber, inactivity_limit_s: optNumber }),
  question_mode: z.enum(QUESTION_MODES),
  allow_skill_reuse: z.boolean(),
  auto_approve_ai_items: z.boolean(),
  questions: z.array(z.object({ question_id: z.string(), is_mandatory: z.boolean() })),
});

export function toAssessmentValues(a: AssessmentOut): AssessmentValues {
  const s1 = a.stage1_config as {
    task_ids?: string[];
    duration_minutes?: number;
    pass_threshold?: number;
  };
  const s2 = a.stage2_config as {
    duration_minutes?: number;
    question_count?: number;
    adaptive?: boolean;
    mode?: 'voice' | 'text';
    pass_threshold?: number;
  };
  const ig = a.integrity_config;
  const mandatory = new Set(a.mandatory_question_ids);
  return {
    language: (LANGUAGES as readonly string[]).includes(a.language)
      ? (a.language as AssessmentValues['language'])
      : 'uz',
    task_ids: s1.task_ids ?? a.tasks.map((t) => t.id),
    s1_duration: numStr(s1.duration_minutes),
    s1_threshold: numStr(s1.pass_threshold),
    s2_duration: numStr(s2.duration_minutes),
    s2_count: numStr(s2.question_count),
    s2_adaptive: s2.adaptive ?? true,
    s2_mode: s2.mode ?? 'voice',
    s2_threshold: numStr(s2.pass_threshold),
    integrity: {
      paste_max_lines: numStr(ig.paste_max_lines),
      inactivity_limit_s: numStr(ig.inactivity_limit_s),
    },
    question_mode: a.question_mode,
    allow_skill_reuse: a.allow_skill_reuse,
    auto_approve_ai_items: a.auto_approve_ai_items,
    questions: a.questions.map((q) => ({ question_id: q.id, is_mandatory: mandatory.has(q.id) })),
  };
}

/** Empty override fields are omitted so the global default applies. */
export function toAssessmentBody(v: AssessmentValues): AssessmentIn {
  const integrity: Record<string, number> = {};
  const paste = optNum(v.integrity.paste_max_lines);
  const idle = optNum(v.integrity.inactivity_limit_s);
  if (paste !== null) integrity.paste_max_lines = paste;
  if (idle !== null) integrity.inactivity_limit_s = idle;
  return {
    language: v.language,
    stage1_config: {
      task_ids: v.task_ids,
      duration_minutes: optNum(v.s1_duration),
      pass_threshold: optNum(v.s1_threshold),
    },
    stage2_config: {
      duration_minutes: optNum(v.s2_duration),
      question_count: optNum(v.s2_count),
      adaptive: v.s2_adaptive,
      mode: v.s2_mode,
      pass_threshold: optNum(v.s2_threshold),
    },
    integrity_config: integrity,
    question_mode: v.question_mode,
    allow_skill_reuse: v.allow_skill_reuse,
    auto_approve_ai_items: v.auto_approve_ai_items,
    questions: v.questions,
  };
}

/** `effective_thresholds` is nested (`stage1.pass_threshold`, `integrity.paste_max_lines`, …). */
export function thresholdHint(
  thresholds: { [key: string]: unknown } | undefined,
  path: string,
): string {
  let cur: unknown = thresholds;
  for (const part of path.split('.')) {
    if (!cur || typeof cur !== 'object') return '';
    cur = (cur as Record<string, unknown>)[part];
  }
  return typeof cur === 'number' || typeof cur === 'string' ? String(cur) : '';
}

export function issueTotals(issues: readonly ReadinessIssue[]) {
  return {
    blocking: issues.filter((i) => i.severity === 'blocking'),
    warnings: issues.filter((i) => i.severity === 'warning'),
  };
}

export const isJobDone = (job: GenerationJob | undefined) =>
  job?.status === 'succeeded' || job?.status === 'failed';

export const JOB_POLL_MS = 2000;

/** `result.flagged` is a count (backend); a list is tolerated. */
export function jobResult(job: GenerationJob | undefined) {
  const r = (job?.result ?? {}) as {
    question_ids?: string[];
    task_ids?: string[];
    flagged?: unknown;
  };
  const flagged =
    typeof r.flagged === 'number' ? r.flagged : Array.isArray(r.flagged) ? r.flagged.length : 0;
  return { questions: r.question_ids?.length ?? 0, tasks: r.task_ids?.length ?? 0, flagged };
}

// ------------------------------------------------------------------ Filters

export const defaultFilters: BankFiltersShape = {
  q: '',
  skill_id: '',
  approved: 'all',
  source: 'all',
  include_global: false,
  page: 1,
};

export interface BankFiltersShape {
  q: string;
  skill_id: string;
  approved: 'all' | 'yes' | 'no';
  source: 'all' | 'manual' | 'ai_generated';
  include_global: boolean;
  page: number;
}

/** URL search params → filters (unknown values fall back to the defaults). */
export function parseFilters(params: URLSearchParams): BankFiltersShape {
  const approved = params.get('approved');
  const source = params.get('source');
  return {
    q: params.get('q') ?? '',
    skill_id: params.get('skill') ?? '',
    approved: approved === 'yes' || approved === 'no' ? approved : 'all',
    source: source === 'manual' || source === 'ai_generated' ? source : 'all',
    include_global: params.get('global') === '1',
    page: Math.max(1, Number(params.get('page')) || 1),
  };
}

/** Filters → URL query (defaults omitted). */
export function filtersToQuery(f: BankFiltersShape): string {
  const p = new URLSearchParams();
  if (f.q.trim()) p.set('q', f.q.trim());
  if (f.skill_id) p.set('skill', f.skill_id);
  if (f.approved !== 'all') p.set('approved', f.approved);
  if (f.source !== 'all') p.set('source', f.source);
  if (f.include_global) p.set('global', '1');
  if (f.page > 1) p.set('page', String(f.page));
  return p.toString();
}
