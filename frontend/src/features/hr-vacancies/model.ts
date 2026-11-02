import { z } from 'zod';
import type { BodyOf, ResponseOf } from '@/lib/api';

export type HrVacancyPage = ResponseOf<'/api/v1/companies/{company_id}/vacancies', 'get'>;
export type HrVacancy = HrVacancyPage['items'][number];
export type VacancyStatus = HrVacancy['status'];
export type HrVacancyDetail = ResponseOf<
  '/api/v1/companies/{company_id}/vacancies/{vacancy_id}',
  'get'
>;
export type VacancyInput = BodyOf<'/api/v1/companies/{company_id}/vacancies', 'post'>;
export type VacancyPatch = BodyOf<'/api/v1/companies/{company_id}/vacancies/{vacancy_id}', 'patch'>;

/** Tab order (hh: active first). */
export const STATUS_TABS = [
  'published',
  'draft',
  'closed',
  'archived',
] as const satisfies readonly VacancyStatus[];

/** Transitions allowed by the API (docs/API.md); anything else is `409 invalid_status_transition`. */
export const TRANSITIONS: Record<VacancyStatus, VacancyStatus[]> = {
  draft: ['published', 'archived'],
  published: ['closed', 'archived'],
  closed: ['published', 'archived'],
  archived: [],
};

export function canTransition(from: VacancyStatus, to: VacancyStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

// Limits mirror the API (docs/API.md "VacancyInput"); the API re-validates.
export const TITLE_MIN = 3;
export const TITLE_MAX = 200;
export const DESCRIPTION_MAX = 20_000;
export const REQUIREMENTS_MAX = 10_000;
export const SKILLS_MAX = 20;
export const CITY_MAX = 120;

const money = z
  .string()
  .trim()
  .refine((v) => v === '' || /^\d{1,15}$/.test(v.replace(/\s/g, '')), 'integer');

export const vacancySkillSchema = z.object({
  skill_id: z.string(),
  name: z.string(),
  weight: z.number().int().min(1).max(5),
  is_required: z.boolean(),
});

export const vacancySchema = z
  .object({
    title: z.string().trim().min(TITLE_MIN, 'tooShort').max(TITLE_MAX, 'tooLong'),
    profession_area: z.string().min(1, 'required'),
    region_code: z.string(),
    city: z.string().trim().max(CITY_MAX, 'tooLong'),
    remote_type: z.enum(['office', 'remote', 'hybrid']),
    employment_type: z.enum(['full_time', 'part_time', 'project', 'internship']),
    experience_level: z.enum(['no_experience', 'between_1_3', 'between_3_6', 'more_than_6']),
    salary_min: money,
    salary_max: money,
    currency: z.string().length(3),
    description: z.string().max(DESCRIPTION_MAX, 'tooLong'),
    requirements: z.string().max(REQUIREMENTS_MAX, 'tooLong'),
    skills: z.array(vacancySkillSchema).max(SKILLS_MAX, 'skillsMax'),
  })
  .refine(
    (v) => {
      const min = toInt(v.salary_min);
      const max = toInt(v.salary_max);
      return min === null || max === null || min <= max;
    },
    { path: ['salary_max'], message: 'salaryRange' },
  );
export type VacancyValues = z.infer<typeof vacancySchema>;

/** Publishing also needs a description (`409 description_required`). Checked on publish only. */
export function publishProblem(v: VacancyValues): 'descriptionRequired' | null {
  return v.description.trim() ? null : 'descriptionRequired';
}

export const VACANCY_FIELDS = [
  'title',
  'profession_area',
  'region_code',
  'city',
  'remote_type',
  'employment_type',
  'experience_level',
  'salary_min',
  'salary_max',
  'currency',
  'description',
  'requirements',
  'skills',
] as const;

export const emptyVacancyValues: VacancyValues = {
  title: '',
  profession_area: 'it',
  region_code: '',
  city: '',
  remote_type: 'office',
  employment_type: 'full_time',
  experience_level: 'between_1_3',
  salary_min: '',
  salary_max: '',
  currency: 'UZS',
  description: '',
  requirements: '',
  skills: [],
};

function toInt(v: string): number | null {
  const s = v.replace(/\s/g, '');
  return s === '' ? null : Number(s);
}

const orNull = (v: string) => (v.trim() === '' ? null : v.trim());

export function toVacancyBody(v: VacancyValues): VacancyInput {
  return {
    title: v.title.trim(),
    profession_area: v.profession_area,
    country: 'UZ',
    region_code: v.region_code || null,
    city: orNull(v.city),
    remote_type: v.remote_type,
    employment_type: v.employment_type,
    experience_level: v.experience_level,
    salary_min: toInt(v.salary_min),
    salary_max: toInt(v.salary_max),
    currency: v.currency,
    description: v.description.trim(),
    requirements: orNull(v.requirements),
    skills: v.skills.map(({ skill_id, weight, is_required }) => ({
      skill_id,
      weight,
      is_required,
    })),
  };
}

export function toVacancyValues(d: HrVacancyDetail): VacancyValues {
  return {
    title: d.title,
    profession_area: d.profession_area,
    region_code: d.region_code ?? '',
    city: d.city ?? '',
    remote_type: d.remote_type,
    employment_type: d.employment_type,
    experience_level: d.experience_level,
    salary_min: d.salary_min === null ? '' : String(d.salary_min),
    salary_max: d.salary_max === null ? '' : String(d.salary_max),
    currency: d.currency,
    description: d.description ?? '',
    requirements: d.requirements ?? '',
    skills: d.skills.map((s) => ({
      skill_id: s.id,
      name: s.name,
      weight: s.weight,
      is_required: s.is_required,
    })),
  };
}
