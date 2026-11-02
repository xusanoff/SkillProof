import { z } from 'zod';
import { appConfig } from '@/config/app';
import { checkFile, type FileProblem } from '@/lib/files';
import type { BodyOf, ResponseOf } from '@/lib/api';

export type CandidateProfile = ResponseOf<'/api/v1/candidate/profile', 'get'>;
export type ProfileBody = BodyOf<'/api/v1/candidate/profile', 'put'>;
export type Resume = NonNullable<CandidateProfile['resume']>;

const optionalInt = (max: number) =>
  z
    .string()
    .trim()
    .refine((v) => v === '' || /^\d+$/.test(v), 'integer')
    .refine((v) => v === '' || Number(v) <= max, 'range');

/** Form values are strings (what inputs hold); `toProfileBody` converts to the API shape. */
export const profileSchema = z
  .object({
    headline: z.string().trim().max(200, 'tooLong'),
    country: z.string(),
    city: z.string().trim().max(120, 'tooLong'),
    experience_years: optionalInt(60),
    about: z.string().max(5000, 'tooLong'),
    desired_salary_min: optionalInt(Number.MAX_SAFE_INTEGER),
    desired_salary_max: optionalInt(Number.MAX_SAFE_INTEGER),
    currency: z.string().length(3, 'invalid'),
    open_to_work: z.boolean(),
  })
  .refine(
    (v) =>
      v.desired_salary_min === '' ||
      v.desired_salary_max === '' ||
      Number(v.desired_salary_min) <= Number(v.desired_salary_max),
    { path: ['desired_salary_max'], message: 'salaryRange' },
  );
export type ProfileValues = z.infer<typeof profileSchema>;

const str = (v: string | null | undefined) => v ?? '';
const num = (v: number | null | undefined) => (v === null || v === undefined ? '' : String(v));

export function toProfileValues(p: CandidateProfile): ProfileValues {
  return {
    headline: str(p.headline),
    country: str(p.country),
    city: str(p.city),
    experience_years: num(p.experience_years),
    about: str(p.about),
    desired_salary_min: num(p.desired_salary_min),
    desired_salary_max: num(p.desired_salary_max),
    currency: p.currency || appConfig.currencies[0],
    open_to_work: p.open_to_work,
  };
}

const textOrNull = (v: string) => (v.trim() === '' ? null : v.trim());
const intOrNull = (v: string) => (v.trim() === '' ? null : Number(v));

export function toProfileBody(v: ProfileValues): ProfileBody {
  return {
    headline: textOrNull(v.headline),
    country: v.country || null,
    city: textOrNull(v.city),
    experience_years: intOrNull(v.experience_years),
    about: v.about.trim() === '' ? null : v.about,
    desired_salary_min: intOrNull(v.desired_salary_min),
    desired_salary_max: intOrNull(v.desired_salary_max),
    currency: v.currency,
    open_to_work: v.open_to_work,
  };
}

export const resumeRule = appConfig.uploads.resume;

/** Client pre-check (PDF/DOC/DOCX ≤ 5 MB); the API re-checks. */
export function checkResume(file: File): FileProblem | null {
  return checkFile(file, resumeRule);
}
