import type { ResponseOf } from '@/lib/api';

export type VerifiedSkill = ResponseOf<'/api/v1/candidate/verified-skills', 'get'>[number];
export type PublicProfile = ResponseOf<'/api/v1/profiles/{candidate_id}', 'get'>;
export type SkillBadgeData = PublicProfile['skills'][number];
export type TalentPage = ResponseOf<'/api/v1/companies/{company_id}/talent', 'get'>;

export const TALENT_PAGE_SIZE = 12;
export const MAX_TALENT_SKILLS = 5;

export type LevelKey = 'basic' | 'intermediate' | 'advanced';

/** The server sends a free string; anything unknown is shown without a level word. */
export function levelKey(level: string): LevelKey | null {
  return level === 'basic' || level === 'intermediate' || level === 'advanced' ? level : null;
}

/** Public skills that are still valid: the only ones a public page can show. */
export function publicValidCount(skills: Pick<VerifiedSkill, 'is_public' | 'is_valid'>[]): number {
  return skills.filter((s) => s.is_public && s.is_valid).length;
}

/** Valid skills first (best score first), expired ones last. */
export function sortSkills(skills: VerifiedSkill[]): VerifiedSkill[] {
  return [...skills].sort(
    (a, b) =>
      Number(b.is_valid) - Number(a.is_valid) || b.score - a.score || a.name.localeCompare(b.name),
  );
}

export function replaceSkill(skills: VerifiedSkill[], next: VerifiedSkill): VerifiedSkill[] {
  return skills.map((s) => (s.id === next.id ? next : s));
}

export interface TalentSkill {
  id: string;
  name: string;
}

export interface TalentQuery {
  skills: TalentSkill[];
  minScore: number | null;
  page: number;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** URL form of one skill: `<uuid>:<name>`, so a reload can still show the name. */
export function encodeSkill(s: TalentSkill): string {
  return `${s.id}:${s.name}`;
}

export function decodeSkill(raw: string): TalentSkill | null {
  const i = raw.indexOf(':');
  const id = i < 0 ? raw : raw.slice(0, i);
  if (!UUID.test(id)) return null;
  return { id, name: i < 0 ? '' : raw.slice(i + 1).slice(0, 80) };
}

export function parseTalentQuery(sp: URLSearchParams): TalentQuery {
  const seen = new Set<string>();
  const skills: TalentSkill[] = [];
  for (const raw of sp.getAll('skill')) {
    const s = decodeSkill(raw);
    if (s && !seen.has(s.id) && skills.length < MAX_TALENT_SKILLS) {
      seen.add(s.id);
      skills.push(s);
    }
  }
  const min = Number(sp.get('min'));
  const minScore =
    Number.isFinite(min) && sp.get('min') ? Math.min(100, Math.max(0, Math.round(min))) : null;
  const p = Number(sp.get('page'));
  return { skills, minScore, page: Number.isInteger(p) && p > 0 ? p : 1 };
}

export function talentHref(q: TalentQuery): string {
  const sp = new URLSearchParams();
  q.skills.forEach((s) => sp.append('skill', encodeSkill(s)));
  if (q.minScore != null && q.minScore > 0) sp.set('min', String(q.minScore));
  if (q.page > 1) sp.set('page', String(q.page));
  const s = sp.toString();
  return s ? `/hr/talent?${s}` : '/hr/talent';
}

/** A search needs at least one skill: the server only returns people holding every requested one. */
export function canSearchTalent(q: TalentQuery): boolean {
  return q.skills.length > 0;
}

export function experienceYears(v: number | null): number | null {
  return v != null && v >= 0 ? v : null;
}

export function placeText(p: Pick<PublicProfile, 'city' | 'country'>): string {
  return [p.city, p.country].filter(Boolean).join(', ');
}

export function isUuid(v: string): boolean {
  return UUID.test(v);
}
