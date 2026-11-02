/**
 * Home quick-filter chips → vacancy list query params (Phase 2 contract, see DECISIONS D-016).
 * Labels are i18n keys under `search.chips.<key>`.
 */
export const QUICK_FILTERS = [
  { key: 'remote', params: { remote_type: 'remote' } },
  { key: 'noExperience', params: { experience_level: 'no_experience' } },
  { key: 'partTime', params: { employment_type: 'part_time' } },
  { key: 'it', params: { profession_area: 'it' } },
  { key: 'internship', params: { employment_type: 'internship' } },
] as const;

export type QuickFilterKey = (typeof QUICK_FILTERS)[number]['key'];
