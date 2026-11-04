import { describe, expect, it } from 'vitest';
import {
  canSearchTalent,
  levelKey,
  parseTalentQuery,
  placeText,
  publicValidCount,
  sortSkills,
  talentHref,
  type VerifiedSkill,
} from './model';

const ID = '3f2b8c1e-1111-4222-8333-444455556666';
const sk = (o: Partial<VerifiedSkill>): VerifiedSkill => ({
  id: 'x',
  skill_id: 's',
  name: 'A',
  score: 80,
  level: 'intermediate',
  verified_at: '2026-01-01T00:00:00Z',
  valid_until: '2027-01-01T00:00:00Z',
  is_public: false,
  is_valid: true,
  ...o,
});

describe('verified skills model', () => {
  it('maps levels and ignores unknown ones', () => {
    expect(levelKey('advanced')).toBe('advanced');
    expect(levelKey('guru')).toBeNull();
  });

  it('counts only public and valid skills', () => {
    expect(
      publicValidCount([
        sk({ is_public: true }),
        sk({ is_public: true, is_valid: false }),
        sk({ is_public: false }),
      ]),
    ).toBe(1);
  });

  it('puts expired skills last', () => {
    const out = sortSkills([
      sk({ name: 'old', is_valid: false, score: 99 }),
      sk({ name: 'new', score: 70 }),
    ]);
    expect(out.map((s) => s.name)).toEqual(['new', 'old']);
  });

  it('round-trips the talent query through the URL', () => {
    const q = parseTalentQuery(new URLSearchParams(`skill=${ID}:Python&min=70&page=2`));
    expect(q).toEqual({ skills: [{ id: ID, name: 'Python' }], minScore: 70, page: 2 });
    expect(talentHref(q)).toBe(
      `/hr/talent?skill=${encodeURIComponent(`${ID}:Python`)}&min=70&page=2`,
    );
    expect(parseTalentQuery(new URLSearchParams(talentHref(q).split('?')[1])).skills).toEqual(
      q.skills,
    );
  });

  it('drops invalid ids, duplicates and bad numbers', () => {
    const q = parseTalentQuery(
      new URLSearchParams(`skill=bad&skill=${ID}&skill=${ID}&min=abc&page=-3`),
    );
    expect(q.skills).toHaveLength(1);
    expect(q.minScore).toBeNull();
    expect(q.page).toBe(1);
    expect(canSearchTalent(q)).toBe(true);
    expect(canSearchTalent(parseTalentQuery(new URLSearchParams()))).toBe(false);
  });

  it('joins city and country', () => {
    expect(placeText({ city: 'Tashkent', country: 'UZ' })).toBe('Tashkent, UZ');
    expect(placeText({ city: null, country: null })).toBe('');
  });
});
