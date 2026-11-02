---
name: i18n
description: uz (lotin, standart), ru, en tillari uchun i18n — next-intl, locale routing, kalitlarni nomlash, tarjima fayllari, ko'plik shakllari (ICU), maosh va valyuta, sana/vaqt zonasi formatlari. Foydalanuvchiga ko'rinadigan har qanday matn qo'shilganda yoki o'zgarganda ishlat.
---

# i18n: uz / ru / en (SkillProof)

no-code-mvp'dagi `i18n-uz-ru` skill'i asosida. Kutubxona: **next-intl** (App Router). Fayllar: `frontend/messages/{uz,ru,en}.json`. Standart va fallback til — `uz`. Yangi til qo'shish = `src/i18n/routing.ts` dagi `locales` + yangi JSON fayl (spec 1.1).

## 1. Asosiy qoida
Komponentda foydalanuvchiga ko'rinadigan **birorta ham** matn literal bo'lmaydi: tugma, sarlavha, placeholder, `aria-label`, `alt`, xato, toast — hammasi `t('...')` orqali (`useTranslations` client'da, `getTranslations` server'da).

```tsx
// ❌
<button aria-label="Ariza berish">Ariza</button>
// ✅
const t = useTranslations('vacancy');
<button aria-label={t('applyAria', { title })}>{t('apply')}</button>
```

## 2. Routing
- Barcha sahifalar `src/app/[locale]/...` ostida. `middleware.ts` (yoki `proxy.ts`) next-intl middleware.
- Ichki havolalar faqat `@/i18n/navigation` dagi `Link`, `useRouter`, `redirect` orqali (locale saqlansin).
- `<html lang={locale}>` layout'da. `generateStaticParams` barcha locale'lar uchun.

## 3. Kalitlarni nomlash
- `<sahifa yoki feature>.<element>` camelCase: `vacancy.apply`, `interview.rules.pasteRule`.
- Umumiy so'zlar `common.*`: `common.save`, `common.cancel`, `common.retry`.
- API xatolari `errors.<code>` (backend `code` bilan bir xil): `errors.not_found`.
- Kalit ma'noni bildiradi, matnni emas.
- Yangi kalit **uchala** faylga bir vaqtda qo'shiladi. Tarjima noma'lum bo'lsa ham kalit qo'yiladi va hisobotda belgilanadi.

## 4. Ko'plik shakllari (ICU)
```json
// uz.json — ot songa qarab o'zgarmaydi
{ "vacancy": { "applicants": "{count} ta nomzod" } }
// ru.json
{ "vacancy": { "applicants": "{count, plural, one {# кандидат} few {# кандидата} many {# кандидатов} other {# кандидата}}" } }
// en.json
{ "vacancy": { "applicants": "{count, plural, one {# applicant} other {# applicants}}" } }
```

## 5. Formatlar (bitta joyda: `src/lib/format.ts` / `useFormatter`)
- **Maosh**: backend'dan butun son + valyuta kodi (UZS standart, USD, …). Float yo'q.
```ts
export function formatMoney(value: number, currency: string, locale: string) {
  // Intl 'uz' to'liq emas — raqam guruhlash ru-RU'dan, birlik i18n'dan (UZS → "so'm" / "сум" / "UZS")
}
```
- **Sana/vaqt**: backend UTC beradi; ko'rsatish foydalanuvchi `timezone` ida (`next-intl` `timeZone` konfiguratsiyasi). `uz`: `26.10.2026, 14:30`.
- **Foiz/ball**: `Intl.NumberFormat(locale, { style: 'percent' })` yoki `{n}%`, `tabular-nums`.
- Mamlakat/shahar — backend ma'lumoti, kodda ro'yxat yo'q (spec 1.1).

## 6. Kontent tili va interfeys tili
- **Interfeys tili** — URL locale.
- **Interview tili** — assessment `language` (uz/ru/en); qoidalar sahifasi va AI savollari shu tilda, interfeys tilidan qat'i nazar (spec 9).
- Vakansiya matni — HR yozgan tilda, tarjima qilinmaydi.

## 7. O'zbek matni qoidalari
- Lotin yozuvi, tutuq belgisi `'` (U+0027): "o'zbek", "so'm", "ma'lumot".
- Murojaat — "siz", hurmat bilan, qisqa. Rus tilida "вы" kichik harf bilan.

## 8. Tekshirish
- [ ] `uz.json`, `ru.json`, `en.json` kalitlari bir xil (test: chuqur kalit solishtirish).
- [ ] Rus matnlari uzunroq — tugma va chiplar 360px'da sig'adi.
- [ ] JSX'da literal matn qolmagan (lint qoidasi yoki `grep`).
