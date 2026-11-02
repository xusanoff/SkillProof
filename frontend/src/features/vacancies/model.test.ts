import { describe, expect, it } from 'vitest';
import {
  activeChips,
  countActive,
  EMPTY_FILTERS,
  filtersToSearchParams,
  mergeFacets,
  pageItems,
  parseFilters,
  removeChip,
  resetFilters,
  toApiQuery,
  updateFilters,
} from './model';

describe('URL ↔ filter state', () => {
  it('parses repeatable params, drops unknown enum values and junk', () => {
    const f = parseFilters(
      new URLSearchParams(
        'q=python&region=UZ-TK&region=UZ-SA&region=UZ-TK&remote_type=remote&remote_type=moon' +
          '&experience_level=no_experience&skill=fastapi&skill=<script>&salary_from=10000000' +
          '&currency=usd&only_with_salary=true&sort=salary_desc&page=3&evil=1',
      ),
    );
    expect(f).toEqual({
      ...EMPTY_FILTERS,
      q: 'python',
      region: ['UZ-TK', 'UZ-SA'],
      remote_type: ['remote'],
      experience_level: ['no_experience'],
      skill: ['fastapi'],
      salary_from: 10_000_000,
      currency: 'USD',
      only_with_salary: true,
      sort: 'salary_desc',
      page: 3,
    });
  });

  it('accepts Next searchParams objects (string | string[])', () => {
    const f = parseFilters({ region: ['UZ-TK', 'UZ-BU'], employment_type: 'part_time', page: '0' });
    expect(f.region).toEqual(['UZ-TK', 'UZ-BU']);
    expect(f.employment_type).toEqual(['part_time']);
    expect(f.page).toBe(1);
  });

  it('serialises canonically and round-trips', () => {
    const f = {
      ...EMPTY_FILTERS,
      q: ' react ',
      region: ['UZ-TK'],
      salary_from: 5_000_000,
      page: 2,
    };
    const qs = filtersToSearchParams(f).toString();
    expect(qs).toBe('q=react&region=UZ-TK&salary_from=5000000&currency=UZS&page=2');
    expect(parseFilters(new URLSearchParams(qs))).toEqual({ ...f, q: 'react' });
    expect(filtersToSearchParams(EMPTY_FILTERS).toString()).toBe('');
  });

  it('builds the API query (currency only with salary_from)', () => {
    expect(toApiQuery({ ...EMPTY_FILTERS, currency: 'USD' })).toEqual({ page: 1, page_size: 20 });
    expect(
      toApiQuery(
        { ...EMPTY_FILTERS, salary_from: 900, currency: 'USD', only_with_salary: true },
        6,
      ),
    ).toEqual({ page: 1, page_size: 6, salary_from: 900, currency: 'USD', only_with_salary: true });
  });

  it('a filter change goes back to page 1; reset keeps q and sort', () => {
    const f = { ...EMPTY_FILTERS, q: 'go', sort: 'date' as const, page: 4, region: ['UZ-TK'] };
    expect(updateFilters(f, { remote_type: ['remote'] }).page).toBe(1);
    expect(updateFilters(f, { page: 5 }).page).toBe(5);
    expect(resetFilters(f)).toEqual({ ...EMPTY_FILTERS, q: 'go', sort: 'date' });
  });

  it('lists removable chips and removes them one by one', () => {
    const f = parseFilters(
      new URLSearchParams('region=UZ-TK&skill=go&salary_from=100&only_with_salary=true'),
    );
    const chips = activeChips(f);
    expect(chips.map((c) => c.key)).toEqual(['region', 'salary_from', 'only_with_salary', 'skill']);
    expect(countActive(f)).toBe(4);
    const noSalary = removeChip(f, chips[1]);
    expect(noSalary.salary_from).toBeNull();
    expect(removeChip(f, chips[0]).region).toEqual([]);
  });
});

describe('mergeFacets', () => {
  it('keeps every known option, fills counts, appends unknown values', () => {
    const merged = mergeFacets(
      ['office', 'remote', 'hybrid'],
      [
        { value: 'remote', count: 7 },
        { value: 'moon', count: 1 },
      ],
      ['hybrid'],
    );
    expect(merged).toEqual([
      { value: 'office', count: 0, selected: false },
      { value: 'remote', count: 7, selected: false },
      { value: 'hybrid', count: 0, selected: true },
      { value: 'moon', count: 1, selected: false },
    ]);
  });

  it('without facets the counts are unknown (null), not zero', () => {
    expect(mergeFacets(['a'], undefined, [])).toEqual([
      { value: 'a', count: null, selected: false },
    ]);
  });

  it('byCount: selected first, then by count, ties keep the known order', () => {
    const merged = mergeFacets(
      ['UZ-TK', 'UZ-SA', 'UZ-BU', 'UZ-AN'],
      [
        { value: 'UZ-SA', count: 3 },
        { value: 'UZ-TK', count: 9 },
        { value: 'UZ-BU', count: 3 },
      ],
      ['UZ-AN'],
      { byCount: true },
    );
    expect(merged.map((m) => m.value)).toEqual(['UZ-AN', 'UZ-TK', 'UZ-SA', 'UZ-BU']);
  });
});

describe('pageItems', () => {
  it('shows first, last, current ± 2 with gaps', () => {
    expect(pageItems(1, 1)).toEqual([1]);
    expect(pageItems(1, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(pageItems(6, 20)).toEqual([1, 'gap', 4, 5, 6, 7, 8, 'gap', 20]);
    expect(pageItems(4, 20)).toEqual([1, 2, 3, 4, 5, 6, 'gap', 20]);
  });
});
