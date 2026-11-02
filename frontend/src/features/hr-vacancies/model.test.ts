import { describe, expect, it } from 'vitest';
import {
  canTransition,
  emptyVacancyValues,
  publishProblem,
  toVacancyBody,
  vacancySchema,
} from './model';

describe('vacancy form model', () => {
  const base = { ...emptyVacancyValues, title: 'Go developer', description: 'Build APIs.' };

  it('maps form values to the API body (ints, nulls, skills without names)', () => {
    const body = toVacancyBody({
      ...base,
      salary_min: '15 000 000',
      salary_max: '',
      city: '  ',
      region_code: 'UZ-TK',
      skills: [{ skill_id: 's1', name: 'Go', weight: 5, is_required: true }],
    });
    expect(body).toMatchObject({
      title: 'Go developer',
      salary_min: 15_000_000,
      salary_max: null,
      city: null,
      region_code: 'UZ-TK',
      requirements: null,
      skills: [{ skill_id: 's1', weight: 5, is_required: true }],
    });
  });

  it('mirrors API validation: title 3–200, min ≤ max, ≤ 20 skills', () => {
    expect(vacancySchema.safeParse({ ...base, title: 'Go' }).success).toBe(false);
    const range = vacancySchema.safeParse({ ...base, salary_min: '9', salary_max: '5' });
    expect(range.success).toBe(false);
    expect(range.error?.issues[0]).toMatchObject({ path: ['salary_max'], message: 'salaryRange' });
    const skills = Array.from({ length: 21 }, (_, i) => ({
      skill_id: `s${i}`,
      name: `S${i}`,
      weight: 3,
      is_required: false,
    }));
    expect(vacancySchema.safeParse({ ...base, skills }).success).toBe(false);
    expect(vacancySchema.safeParse(base).success).toBe(true);
  });

  it('publishing needs a description; transitions follow the API', () => {
    expect(publishProblem({ ...base, description: '  ' })).toBe('descriptionRequired');
    expect(publishProblem(base)).toBeNull();
    expect(canTransition('draft', 'published')).toBe(true);
    expect(canTransition('closed', 'published')).toBe(true);
    expect(canTransition('archived', 'published')).toBe(false);
    expect(canTransition('published', 'draft')).toBe(false);
  });
});
