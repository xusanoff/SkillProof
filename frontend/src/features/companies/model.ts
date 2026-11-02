import { z } from 'zod';
import { appConfig } from '@/config/app';
import type { BodyOf, ResponseOf } from '@/lib/api';
import { checkFile, type FileProblem } from '@/lib/files';

export type Company = ResponseOf<'/api/v1/companies/{company_id}', 'get'>;
export type CompanyCreateBody = BodyOf<'/api/v1/companies', 'post'>;
export type Member = ResponseOf<'/api/v1/companies/{company_id}/members', 'get'>[number];
export type Invitation = ResponseOf<'/api/v1/companies/{company_id}/invitations', 'get'>[number];
export type PublicInvitation = ResponseOf<'/api/v1/invitations/{token}', 'get'>;
export type MemberRole = Member['member_role'];

/** Adds `https://` when the user typed a bare domain ("acme.uz"). */
export function normalizeUrl(value: string): string {
  const v = value.trim();
  if (!v) return '';
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}

function isUrl(value: string): boolean {
  try {
    const u = new URL(normalizeUrl(value));
    return (u.protocol === 'http:' || u.protocol === 'https:') && u.hostname.includes('.');
  } catch {
    return false;
  }
}

export const companySchema = z.object({
  name: z.string().trim().min(2, 'tooShort').max(200, 'tooLong'),
  description: z.string().max(10000, 'tooLong'),
  website: z
    .string()
    .trim()
    .refine((v) => v === '' || isUrl(v), 'url'),
  industry: z.string().trim().max(120, 'tooLong'),
  country: z.string(),
  city: z.string().trim().max(120, 'tooLong'),
});
export type CompanyValues = z.infer<typeof companySchema>;
export const COMPANY_FIELDS = [
  'name',
  'description',
  'website',
  'industry',
  'country',
  'city',
] as const;

export const emptyCompanyValues: CompanyValues = {
  name: '',
  description: '',
  website: '',
  industry: '',
  country: 'UZ',
  city: '',
};

export function toCompanyValues(c: Company): CompanyValues {
  return {
    name: c.name,
    description: c.description ?? '',
    website: c.website ?? '',
    industry: c.industry ?? '',
    country: c.country ?? '',
    city: c.city ?? '',
  };
}

const orNull = (v: string) => (v.trim() === '' ? null : v.trim());

export function toCompanyBody(v: CompanyValues): CompanyCreateBody {
  return {
    name: v.name.trim(),
    description: v.description.trim() === '' ? null : v.description,
    website: v.website ? normalizeUrl(v.website) : null,
    industry: orNull(v.industry),
    country: v.country || null,
    city: orNull(v.city),
  };
}

export const inviteSchema = z.object({
  email: z.string().trim().min(1, 'required').max(320, 'tooLong').pipe(z.email('email')),
});
export type InviteValues = z.infer<typeof inviteSchema>;

export const logoRule = appConfig.uploads.logo;

export function checkLogo(file: File): FileProblem | null {
  return checkFile(file, logoRule);
}

/** Selected company id: picked one if still a member, else the first (D-020). */
export function pickActiveCompany<T extends { id: string }>(
  companies: readonly T[],
  selectedId: string | null,
): T | null {
  return companies.find((c) => c.id === selectedId) ?? companies[0] ?? null;
}

export const COMPANY_COOKIE = 'sp_company';

export function readCompanyCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${COMPANY_COOKIE}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function writeCompanyCookie(id: string) {
  document.cookie = `${COMPANY_COOKIE}=${encodeURIComponent(id)}; path=/; max-age=31536000; samesite=lax`;
}

/** Display-only hint; the API decides (403 email_mismatch / role_mismatch). */
export function sameEmail(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}
