import type { Locale } from './routing';
import { routing } from './routing';

export type Messages = Record<string, unknown>;

/** Deep-merge `override` onto `base` so missing keys fall back to the default locale. */
export function mergeMessages(base: Messages, override: Messages): Messages {
  const out: Messages = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const prev = out[key];
    out[key] = isPlainObject(prev) && isPlainObject(value) ? mergeMessages(prev, value) : value;
  }
  return out;
}

function isPlainObject(v: unknown): v is Messages {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export async function loadMessages(locale: Locale): Promise<Messages> {
  const own = (await import(`../../messages/${locale}.json`)).default as Messages;
  if (locale === routing.defaultLocale) return own;
  const fallback = (await import(`../../messages/${routing.defaultLocale}.json`))
    .default as Messages;
  return mergeMessages(fallback, own);
}
