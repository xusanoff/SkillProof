import { describe, expect, it } from 'vitest';
import en from '../../messages/en.json';
import ru from '../../messages/ru.json';
import uz from '../../messages/uz.json';
import { mergeMessages } from './messages';
import { routing } from './routing';

function keys(obj: unknown, prefix = ''): string[] {
  if (typeof obj !== 'object' || obj === null) return [prefix];
  return Object.entries(obj).flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k));
}

const files: Record<string, unknown> = { uz, ru, en };

describe('i18n messages', () => {
  it('has a message file for every configured locale', () => {
    for (const locale of routing.locales) expect(files[locale]).toBeDefined();
  });

  it.each(['ru', 'en'])('%s has exactly the same keys as uz', (locale) => {
    expect(keys(files[locale]).sort()).toEqual(keys(uz).sort());
  });

  it('has no empty strings', () => {
    for (const [locale, msgs] of Object.entries(files)) {
      const flat = keys(msgs);
      for (const key of flat) {
        const value = key
          .split('.')
          .reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], msgs);
        expect(value, `${locale}:${key}`).not.toBe('');
      }
    }
  });

  it('falls back to the default locale for missing keys', () => {
    const merged = mergeMessages({ a: { b: 'uz-b', c: 'uz-c' } }, { a: { b: 'ru-b' } });
    expect(merged).toEqual({ a: { b: 'ru-b', c: 'uz-c' } });
  });
});
