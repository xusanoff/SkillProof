import { describe, expect, it } from 'vitest';
import { homeFor, loginSchema, registerSchema, resetSchema, safeNext } from './model';

describe('safeNext', () => {
  it.each([
    ['/candidate/profile', '/candidate/profile'],
    ['/invitations/abc?x=1', '/invitations/abc?x=1'],
    ['//evil.com', null],
    ['https://evil.com', null],
    ['/\\evil.com', null],
    ['javascript:alert(1)', null],
    ['/login', null],
    ['/login?next=/hr', null],
    ['', null],
    [null, null],
  ])('%s → %s', (input, expected) => {
    expect(safeNext(input)).toBe(expected);
  });
});

describe('schemas', () => {
  it('login reports codes, not texts', () => {
    const r = loginSchema.safeParse({ email: '', password: '' });
    expect(r.success).toBe(false);
    expect(r.error?.issues.map((i) => i.message)).toEqual(['required', 'required']);
  });

  it('register requires a role and an 8+ char password', () => {
    const r = registerSchema.safeParse({ full_name: 'A', email: 'a@b.uz', password: 'short' });
    expect(r.error?.issues.map((i) => [i.path[0], i.message])).toEqual(
      expect.arrayContaining([
        ['role', 'role'],
        ['password', 'passwordShort'],
      ]),
    );
  });

  it('reset checks the confirmation', () => {
    const r = resetSchema.safeParse({ password: 'longenough', confirm: 'different' });
    expect(r.error?.issues[0]).toMatchObject({ path: ['confirm'], message: 'passwordMismatch' });
  });

  it('routes roles to their area', () => {
    expect(homeFor('candidate')).toBe('/candidate/profile');
    expect(homeFor('hr')).toBe('/hr');
  });
});
