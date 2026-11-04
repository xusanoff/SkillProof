import { z } from 'zod';
import type { ResponseOf } from '@/lib/api';

export type Me = ResponseOf<'/api/v1/auth/me', 'get'>;
export type UserRole = Me['role'];
export type MeCompany = Me['companies'][number];

/**
 * Zod messages are i18n codes under `validation.*` (translated by the form), so schemas
 * stay pure and testable. Limits mirror docs/API.md; the API re-validates.
 */
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

export const emailField = z
  .string()
  .trim()
  .min(1, 'required')
  .max(320, 'tooLong')
  .pipe(z.email('email'));
export const passwordField = z
  .string()
  .min(PASSWORD_MIN, 'passwordShort')
  .max(PASSWORD_MAX, 'passwordLong');

export const loginSchema = z.object({
  email: emailField,
  // Login does not re-check length rules: old passwords must still work.
  password: z.string().min(1, 'required').max(PASSWORD_MAX, 'passwordLong'),
});
export type LoginValues = z.infer<typeof loginSchema>;

export const registerSchema = z.object({
  role: z.enum(['candidate', 'hr'], { error: 'role' }),
  full_name: z.string().trim().min(1, 'required').max(200, 'tooLong'),
  email: emailField,
  password: passwordField,
});
export type RegisterValues = z.infer<typeof registerSchema>;

export const forgotSchema = z.object({ email: emailField });
export type ForgotValues = z.infer<typeof forgotSchema>;

export const resetSchema = z
  .object({ password: passwordField, confirm: z.string().min(1, 'required') })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'passwordMismatch' });
export type ResetValues = z.infer<typeof resetSchema>;

/** Where a user lands after signing in when no `next` is given. */
export function homeFor(role: UserRole): string {
  if (role === 'candidate') return '/candidate/profile';
  if (role === 'hr') return '/hr';
  return '/admin';
}

/**
 * `?next=` must be a locale-less, same-origin path (no open redirect):
 * starts with one `/`, no `//`, no backslash, no scheme, no auth pages (loops).
 */
export function safeNext(next: string | null | undefined): string | null {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.includes('\\')) return null;
  if (/^\/[a-z]+:/i.test(next)) return null;
  const path = next.split(/[?#]/)[0];
  if (['/login', '/register', '/forgot-password', '/reset-password'].includes(path)) return null;
  return next;
}

/** Login link that brings the user back to `path` afterwards. */
export function loginHref(path: string, base: '/login' | '/register' = '/login'): string {
  return `${base}?next=${encodeURIComponent(path)}`;
}

/** The browser time zone if it looks like an IANA name, else undefined (API default applies). */
export function browserTimeZone(): string | undefined {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return tz && tz.includes('/') ? tz : undefined;
  } catch {
    return undefined;
  }
}
