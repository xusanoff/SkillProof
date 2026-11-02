import { createApi, unwrap } from '@/lib/api';

/**
 * Autosuggest data source (D-016). `apiSuggestSource` = `GET /api/v1/search/suggest`
 * (vacancy titles, skills and companies, ≤ 10, q ≥ 2 chars).
 */
export type SuggestionKind = 'vacancy' | 'skill' | 'company';

export interface Suggestion {
  kind: SuggestionKind;
  /** Text shown and put into the query input. */
  label: string;
  /** Company slug (company page) or skill slug; null for vacancy titles. */
  slug?: string | null;
}

export interface SuggestSource {
  /** Minimum characters before asking. */
  minLength: number;
  suggest(query: string, opts: { locale: string; signal: AbortSignal }): Promise<Suggestion[]>;
}

/** Until `GET /api/v1/search/suggest` exists (Phase 2): never suggests anything. */
export const emptySuggestSource: SuggestSource = {
  minLength: 2,
  suggest: async () => [],
};

export const apiSuggestSource: SuggestSource = {
  minLength: 2,
  async suggest(query, { locale, signal }) {
    const api = createApi({ locale });
    const items = await unwrap(
      api.GET('/api/v1/search/suggest', { params: { query: { q: query } }, signal }),
    );
    return items.map((s) => ({ kind: s.type, label: s.text, slug: s.slug }));
  },
};

export const defaultSuggestSource: SuggestSource = apiSuggestSource;

/** Build the vacancy list URL params from the form (empty values dropped). */
export function searchParamsFor(values: { q?: string; region?: string }): string {
  const params = new URLSearchParams();
  const q = values.q?.trim();
  if (q) params.set('q', q);
  if (values.region) params.set('region', values.region);
  return params.toString();
}
