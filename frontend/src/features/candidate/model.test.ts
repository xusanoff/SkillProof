import { describe, expect, it } from 'vitest';
import { checkResume, profileSchema, toProfileBody, toProfileValues } from './model';

const file = (name: string, size: number, type: string) => {
  const f = new File(['x'], name, { type });
  Object.defineProperty(f, 'size', { value: size });
  return f;
};
const MB = 1024 * 1024;

describe('checkResume', () => {
  it.each([
    ['cv.pdf', MB, 'application/pdf', null],
    [
      'cv.DOCX',
      MB,
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      null,
    ],
    ['cv.doc', MB, '', null], // some OSes send no MIME for .doc
    ['cv.pdf', 5 * MB, 'application/pdf', null],
    ['cv.pdf', 5 * MB + 1, 'application/pdf', 'file_too_large'],
    ['cv.png', MB, 'image/png', 'unsupported_file_type'],
    ['cv.pdf', MB, 'image/png', 'unsupported_file_type'],
    ['cv', MB, '', 'unsupported_file_type'],
    ['cv.pdf', 0, 'application/pdf', 'empty_file'],
  ])('%s (%i bytes, %s) → %s', (name, size, type, expected) => {
    expect(checkResume(file(name, size, type))).toBe(expected);
  });
});

describe('profile form mapping', () => {
  const empty = toProfileValues({ currency: 'UZS', open_to_work: true });

  it('empty profile → empty strings, UZS', () => {
    expect(empty).toMatchObject({ headline: '', experience_years: '', currency: 'UZS' });
  });

  it('converts strings back to API values (null for empty)', () => {
    expect(
      toProfileBody({
        ...empty,
        headline: '  Dev ',
        experience_years: '3',
        desired_salary_min: '',
      }),
    ).toMatchObject({
      headline: 'Dev',
      experience_years: 3,
      desired_salary_min: null,
      country: null,
    });
  });

  it('rejects min > max salary and non-integers', () => {
    const r = profileSchema.safeParse({
      ...empty,
      desired_salary_min: '20',
      desired_salary_max: '10',
      experience_years: '2.5',
    });
    expect(r.error?.issues.map((i) => [i.path[0], i.message])).toEqual(
      expect.arrayContaining([
        ['experience_years', 'integer'],
        ['desired_salary_max', 'salaryRange'],
      ]),
    );
  });
});
