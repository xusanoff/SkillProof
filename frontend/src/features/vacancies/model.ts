import type { paths, ResponseOf } from '@/lib/api';

export type VacancyPage = ResponseOf<'/api/v1/vacancies', 'get'>;
export type VacancyCard = VacancyPage['items'][number];
export type VacancyDetail = ResponseOf<'/api/v1/vacancies/{vacancy_id}', 'get'>;
export type Facets = NonNullable<VacancyPage['facets']>;
export type FacetBucket = Facets['region'][number];
export type RemoteType = VacancyCard['remote_type'];
export type EmploymentType = VacancyCard['employment_type'];
export type ExperienceLevel = VacancyCard['experience_level'];
export type ApplicationStatus = NonNullable<
  NonNullable<VacancyCard['viewer']>['application_status']
>;
export type VacancyListQuery = NonNullable<
  paths['/api/v1/vacancies']['get']['parameters']['query']
>;
export type VacancySort = NonNullable<VacancyListQuery['sort']>;

// Order = display order in filters (docs/API.md enums).
export const REMOTE_TYPES = ['office', 'remote', 'hybrid'] as const satisfies readonly RemoteType[];
export const EMPLOYMENT_TYPES = [
  'full_time',
  'part_time',
  'project',
  'internship',
] as const satisfies readonly EmploymentType[];
export const EXPERIENCE_LEVELS = [
  'no_experience',
  'between_1_3',
  'between_3_6',
  'more_than_6',
] as const satisfies readonly ExperienceLevel[];
export const SORTS = [
  'relevance',
  'date',
  'salary_desc',
  'salary_asc',
] as const satisfies readonly VacancySort[];

export const PAGE_SIZE = 20;
export const DEFAULT_CURRENCY = 'UZS';
/** Skill chips on a card (the API sends ≤ 6, required first). */
export const CARD_SKILLS = 6;

/** Filter state. The URL is the single source of truth (react-architecture §3). */
export interface VacancyFilters {
  q: string;
  region: string[];
  remote_type: RemoteType[];
  employment_type: EmploymentType[];
  experience_level: ExperienceLevel[];
  profession_area: string;
  skill: string[];
  salary_from: number | null;
  currency: string;
  only_with_salary: boolean;
  /** null = API default (relevance with `q`, else date). */
  sort: VacancySort | null;
  page: number;
}

export const EMPTY_FILTERS: VacancyFilters = {
  q: '',
  region: [],
  remote_type: [],
  employment_type: [],
  experience_level: [],
  profession_area: '',
  skill: [],
  salary_from: null,
  currency: DEFAULT_CURRENCY,
  only_with_salary: false,
  sort: null,
  page: 1,
};

/** Next's `searchParams` object or a URLSearchParams. */
export type RawParams = URLSearchParams | Record<string, string | string[] | undefined>;

function getAll(params: RawParams, key: string): string[] {
  if (params instanceof URLSearchParams) return params.getAll(key);
  const v = params[key];
  if (v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

function getOne(params: RawParams, key: string): string {
  return getAll(params, key)[0]?.trim() ?? '';
}

function oneOf<T extends string>(allowed: readonly T[], values: string[]): T[] {
  const out: T[] = [];
  for (const v of values) {
    if ((allowed as readonly string[]).includes(v) && !out.includes(v as T)) out.push(v as T);
  }
  return out;
}

/** Codes/slugs: lower-risk charset only, deduped (a URL is user input). */
const TOKEN = /^[A-Za-z0-9_.-]{1,64}$/;
function tokens(values: string[]): string[] {
  const out: string[] = [];
  for (const raw of values) {
    for (const v of raw.split(',')) {
      const t = v.trim();
      if (TOKEN.test(t) && !out.includes(t)) out.push(t);
    }
  }
  return out;
}

function positiveInt(value: string): number | null {
  if (!/^\d{1,15}$/.test(value)) return null;
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/** URL → filters. Unknown values are dropped, never sent to the API. */
export function parseFilters(params: RawParams): VacancyFilters {
  const currency = getOne(params, 'currency').toUpperCase();
  const sort = oneOf(SORTS, [getOne(params, 'sort')])[0] ?? null;
  return {
    q: getOne(params, 'q').slice(0, 200),
    region: tokens(getAll(params, 'region')),
    remote_type: oneOf(REMOTE_TYPES, getAll(params, 'remote_type')),
    employment_type: oneOf(EMPLOYMENT_TYPES, getAll(params, 'employment_type')),
    experience_level: oneOf(EXPERIENCE_LEVELS, getAll(params, 'experience_level')),
    profession_area: tokens([getOne(params, 'profession_area')])[0] ?? '',
    skill: tokens(getAll(params, 'skill')),
    salary_from: positiveInt(getOne(params, 'salary_from')),
    currency: /^[A-Z]{3}$/.test(currency) ? currency : DEFAULT_CURRENCY,
    only_with_salary: ['true', '1'].includes(getOne(params, 'only_with_salary')),
    sort,
    page: positiveInt(getOne(params, 'page')) ?? 1,
  };
}

/** Filters → canonical URL params (stable order, defaults omitted) — shareable links. */
export function filtersToSearchParams(f: VacancyFilters): URLSearchParams {
  const p = new URLSearchParams();
  if (f.q.trim()) p.set('q', f.q.trim());
  for (const v of f.region) p.append('region', v);
  for (const v of f.remote_type) p.append('remote_type', v);
  for (const v of f.employment_type) p.append('employment_type', v);
  for (const v of f.experience_level) p.append('experience_level', v);
  if (f.profession_area) p.set('profession_area', f.profession_area);
  for (const v of f.skill) p.append('skill', v);
  if (f.salary_from !== null) {
    p.set('salary_from', String(f.salary_from));
    p.set('currency', f.currency);
  }
  if (f.only_with_salary) p.set('only_with_salary', 'true');
  if (f.sort) p.set('sort', f.sort);
  if (f.page > 1) p.set('page', String(f.page));
  return p;
}

/** Filters → `GET /api/v1/vacancies` query (docs/API.md). */
export function toApiQuery(f: VacancyFilters, pageSize = PAGE_SIZE): VacancyListQuery {
  const q: VacancyListQuery = { page: f.page, page_size: pageSize };
  if (f.q.trim()) q.q = f.q.trim();
  if (f.region.length) q.region = f.region;
  if (f.remote_type.length) q.remote_type = f.remote_type;
  if (f.employment_type.length) q.employment_type = f.employment_type;
  if (f.experience_level.length) q.experience_level = f.experience_level;
  if (f.profession_area) q.profession_area = f.profession_area;
  if (f.skill.length) q.skill = f.skill;
  if (f.salary_from !== null) {
    q.salary_from = f.salary_from;
    q.currency = f.currency;
  }
  if (f.only_with_salary) q.only_with_salary = true;
  if (f.sort) q.sort = f.sort;
  return q;
}

/** Any filter change goes back to page 1, unless the change *is* the page. */
export function updateFilters(f: VacancyFilters, patch: Partial<VacancyFilters>): VacancyFilters {
  return { ...f, page: 1, ...patch };
}

export function toggleValue<T extends string>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

/** Everything but the text query and sort (the search bar keeps the query). */
export function resetFilters(f: VacancyFilters): VacancyFilters {
  return { ...EMPTY_FILTERS, q: f.q, sort: f.sort };
}

export type FilterChip =
  | {
      key: 'region' | 'remote_type' | 'employment_type' | 'experience_level' | 'skill';
      value: string;
    }
  | { key: 'profession_area'; value: string }
  | { key: 'salary_from'; value: number; currency: string }
  | { key: 'only_with_salary' };

/** Removable chips above the list, in sidebar order. */
export function activeChips(f: VacancyFilters): FilterChip[] {
  const chips: FilterChip[] = [];
  for (const v of f.region) chips.push({ key: 'region', value: v });
  for (const v of f.remote_type) chips.push({ key: 'remote_type', value: v });
  for (const v of f.employment_type) chips.push({ key: 'employment_type', value: v });
  for (const v of f.experience_level) chips.push({ key: 'experience_level', value: v });
  if (f.salary_from !== null)
    chips.push({ key: 'salary_from', value: f.salary_from, currency: f.currency });
  if (f.only_with_salary) chips.push({ key: 'only_with_salary' });
  if (f.profession_area) chips.push({ key: 'profession_area', value: f.profession_area });
  for (const v of f.skill) chips.push({ key: 'skill', value: v });
  return chips;
}

export function removeChip(f: VacancyFilters, chip: FilterChip): VacancyFilters {
  switch (chip.key) {
    case 'salary_from':
      return updateFilters(f, { salary_from: null, currency: DEFAULT_CURRENCY });
    case 'only_with_salary':
      return updateFilters(f, { only_with_salary: false });
    case 'profession_area':
      return updateFilters(f, { profession_area: '' });
    default: {
      const list = f[chip.key] as string[];
      return updateFilters(f, { [chip.key]: list.filter((v) => v !== chip.value) });
    }
  }
}

export function countActive(f: VacancyFilters): number {
  return activeChips(f).length;
}

export interface FacetOption<T extends string = string> {
  value: T;
  /** null = the API sent no facets (count unknown, don't show a number). */
  count: number | null;
  selected: boolean;
}

/**
 * Known options + facet counts (computed by the API without the facet's own filter).
 * Every known option stays listed (0 when absent from the buckets); selected values are
 * always kept; values the API knows but we don't are appended. `byCount` (regions)
 * sorts by count, selected first, the rest keeping their known order on ties.
 */
export function mergeFacets<T extends string>(
  options: readonly T[],
  buckets: readonly FacetBucket[] | undefined | null,
  selected: readonly string[],
  { byCount = false }: { byCount?: boolean } = {},
): FacetOption<T>[] {
  const counts = new Map((buckets ?? []).map((b) => [b.value, b.count]));
  const values: T[] = [...options];
  for (const b of buckets ?? []) if (!values.includes(b.value as T)) values.push(b.value as T);
  for (const s of selected) if (!values.includes(s as T)) values.push(s as T);

  const merged = values.map((value, index) => ({
    value,
    index,
    count: buckets ? (counts.get(value) ?? 0) : null,
    selected: selected.includes(value),
  }));
  if (byCount) {
    merged.sort(
      (a, b) =>
        Number(b.selected) - Number(a.selected) ||
        (b.count ?? 0) - (a.count ?? 0) ||
        a.index - b.index,
    );
  }
  return merged.map(({ value, count, selected: s }) => ({ value, count, selected: s }));
}

export { pageCount, pageItems } from '@/lib/pagination';

/** Tags shown on a card (hh: "Masofaviy", "Tajribasiz", …) — i18n keys under `vacancy.tags`. */
export function cardTags(
  v: Pick<VacancyCard, 'remote_type' | 'employment_type' | 'experience_level'>,
) {
  const tags: string[] = [];
  if (v.remote_type !== 'office') tags.push(`remote.${v.remote_type}`);
  if (v.experience_level === 'no_experience') tags.push('noExperience');
  if (v.employment_type !== 'full_time') tags.push(`employment.${v.employment_type}`);
  return tags;
}

/** Applications the candidate can still act on (re-apply after withdraw is allowed). */
export function hasActiveApplication(status: ApplicationStatus | null | undefined): boolean {
  return !!status && status !== 'withdrawn';
}

/** Filters for the "similar vacancies" block (same area + region, docs/API.md). */
export function similarQuery(
  v: Pick<VacancyDetail, 'profession_area' | 'region_code'>,
): VacancyFilters {
  return {
    ...EMPTY_FILTERS,
    profession_area: v.profession_area,
    region: v.region_code ? [v.region_code] : [],
    sort: 'date',
  };
}

/** Home "Yangi vakansiyalar" block. */
export const LATEST_COUNT = 6;
export const LATEST_FILTERS: VacancyFilters = { ...EMPTY_FILTERS, sort: 'date' };
