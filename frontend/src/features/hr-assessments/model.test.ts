import { describe, expect, it } from 'vitest';
import {
  emptyQuestionValues,
  filtersToQuery,
  formatLevels,
  parseFilters,
  parseLevels,
  questionSchema,
  thresholdHint,
  toAssessmentBody,
  toQuestionBody,
  emptyAssessmentValues,
  type QuestionValues,
} from './model';

const criterion = {
  key: 'correctness',
  name: 'Correctness',
  description: '',
  max_points: '5',
  levels: '0: wrong\n5: full',
};

describe('question schema', () => {
  const mcq = (over: Partial<QuestionValues> = {}): QuestionValues => ({
    ...emptyQuestionValues(),
    type: 'mcq',
    text: 'Which is a list?',
    options: [
      { text: '[]', correct: true },
      { text: '{}', correct: false },
    ],
    ...over,
  });

  it('accepts a valid mcq even with an unused empty rubric draft', () => {
    expect(questionSchema.safeParse(mcq()).success).toBe(true);
  });

  it('mcq needs a correct option and at least 2 filled options', () => {
    const noCorrect = questionSchema.safeParse(
      mcq({
        options: [
          { text: 'a', correct: false },
          { text: 'b', correct: false },
        ],
      }),
    );
    expect(noCorrect.error?.issues.map((i) => i.message)).toContain('correctMin');
    const one = questionSchema.safeParse(mcq({ options: [{ text: 'a', correct: true }] }));
    expect(one.error?.issues.map((i) => i.message)).toContain('optionsMin');
    const blank = questionSchema.safeParse(
      mcq({
        options: [
          { text: '', correct: true },
          { text: 'b', correct: false },
        ],
      }),
    );
    expect(blank.error?.issues.some((i) => i.path.join('.') === 'options.0.text')).toBe(true);
  });

  it('open question needs a reference answer and a valid rubric', () => {
    const base = { ...emptyQuestionValues(), text: 'Explain GIL' };
    const bad = questionSchema.safeParse(base);
    const paths = bad.error?.issues.map((i) => i.path.join('.')) ?? [];
    expect(paths).toContain('reference_answer');
    expect(paths).toContain('rubric.criteria.0.name');
    const badKey = questionSchema.safeParse({
      ...base,
      reference_answer: 'x',
      rubric: { criteria: [{ ...criterion, key: 'Bad Key' }] },
    });
    expect(badKey.error?.issues.map((i) => i.message)).toContain('rubricKey');
    expect(
      questionSchema.safeParse({
        ...base,
        reference_answer: 'x',
        rubric: { criteria: [criterion] },
      }).success,
    ).toBe(true);
  });
});

describe('request bodies', () => {
  it('mcq sends options + correct_answer indexes and no rubric', () => {
    const body = toQuestionBody({
      ...emptyQuestionValues(),
      type: 'mcq',
      text: ' Q ',
      options: [
        { text: 'a', correct: false },
        { text: 'b', correct: true },
        { text: 'c', correct: true },
      ],
    });
    expect(body).toMatchObject({ text: 'Q', options: ['a', 'b', 'c'], correct_answer: [1, 2] });
    expect(body.rubric).toBeUndefined();
  });

  it('open question sends the rubric with parsed levels', () => {
    const body = toQuestionBody({
      ...emptyQuestionValues(),
      text: 'Q',
      reference_answer: 'A',
      rubric: { criteria: [criterion] },
    });
    expect(body.rubric?.criteria[0]).toMatchObject({
      key: 'correctness',
      max_points: 5,
      levels: { '0': 'wrong', '5': 'full' },
    });
    expect(body.options).toBeUndefined();
  });

  it('levels round-trip', () => {
    expect(formatLevels(parseLevels('5: full\n0: wrong\njunk'))).toBe('0: wrong\n5: full');
  });

  it('preserves API-configured budgets when other assessment fields change', () => {
    const budget = { token_limit: 50000, stt_seconds_limit: 300 };
    const body = toAssessmentBody({ ...emptyAssessmentValues, s1_duration: '60' }, budget);
    expect(body.stage1_config.budget).toEqual(budget);
    expect(body.stage1_config.duration_minutes).toBe(60);
  });

  it('assessment body omits empty overrides', () => {
    const body = toAssessmentBody({
      ...emptyAssessmentValues,
      s1_duration: '60',
      integrity: { paste_max_lines: '5', inactivity_limit_s: '' },
    });
    expect(body.stage1_config.duration_minutes).toBe(60);
    expect(body.stage1_config.pass_threshold).toBeNull();
    expect(body.integrity_config).toEqual({ paste_max_lines: 5 });
  });
});

describe('helpers', () => {
  it('reads nested effective thresholds', () => {
    expect(thresholdHint({ stage1: { pass_threshold: 60 } }, 'stage1.pass_threshold')).toBe('60');
    expect(thresholdHint({}, 'stage1.pass_threshold')).toBe('');
  });

  it('filters round-trip through the URL', () => {
    const f = parseFilters(
      new URLSearchParams('q=api&approved=no&source=ai_generated&global=1&page=2'),
    );
    expect(f).toMatchObject({
      q: 'api',
      approved: 'no',
      source: 'ai_generated',
      include_global: true,
      page: 2,
    });
    expect(filtersToQuery(f)).toBe('q=api&approved=no&source=ai_generated&global=1&page=2');
    expect(parseFilters(new URLSearchParams('approved=zzz')).approved).toBe('all');
  });
});
