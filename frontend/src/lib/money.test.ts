import { createTranslator } from 'next-intl';
import { describe, expect, it } from 'vitest';
import en from '../../messages/en.json';
import ru from '../../messages/ru.json';
import uz from '../../messages/uz.json';
import { formatSalary, salaryKind, type SalaryTranslator } from './money';

const t = (locale: 'uz' | 'ru' | 'en') => {
  const messages = { uz, ru, en }[locale];
  return createTranslator({ locale, messages, namespace: 'salary' }) as unknown as SalaryTranslator;
};
// Intl uses narrow no-break spaces for grouping; compare with plain spaces.
const plain = (s: string) => s.replace(/[  ]/g, ' ');
const fmt = (
  min: number | null,
  max: number | null,
  currency: string,
  locale: 'uz' | 'ru' | 'en',
) => plain(formatSalary(min, max, currency, locale, t(locale)));

describe('salary formatting', () => {
  it('kinds', () => {
    expect(salaryKind(1, 2)).toBe('range');
    expect(salaryKind(2, 2)).toBe('exact');
    expect(salaryKind(1, null)).toBe('from');
    expect(salaryKind(null, 2)).toBe('upTo');
    expect(salaryKind(null, undefined)).toBe('none');
  });

  it('uz', () => {
    expect(fmt(15_000_000, 22_000_000, 'UZS', 'uz')).toBe("15 000 000 – 22 000 000 so'm");
    expect(fmt(10_000_000, null, 'UZS', 'uz')).toBe("dan 10 000 000 so'm");
    expect(fmt(null, 28_000_000, 'UZS', 'uz')).toBe("28 000 000 so'm gacha");
    expect(fmt(null, null, 'UZS', 'uz')).toBe("Maosh ko'rsatilmagan");
    expect(fmt(1200, 2400, 'USD', 'uz')).toBe('1 200 – 2 400 USD');
  });

  it('ru', () => {
    expect(fmt(15_000_000, 22_000_000, 'UZS', 'ru')).toBe('15 000 000 – 22 000 000 сум');
    expect(fmt(10_000_000, null, 'UZS', 'ru')).toBe('от 10 000 000 сум');
    expect(fmt(null, 900, 'USD', 'ru')).toBe('до 900 USD');
  });

  it('en (and an unknown currency falls back to its code)', () => {
    expect(fmt(15_000_000, 22_000_000, 'UZS', 'en')).toBe('15,000,000 – 22,000,000 UZS');
    expect(fmt(800, null, 'KZT', 'en')).toBe('from 800 KZT');
    expect(fmt(null, null, 'USD', 'en')).toBe('Salary not specified');
  });
});
