---
name: design-system
description: Tailwind v4 tokenlari, shadcn/ui bilan ishlash, light/dark, umumiy UI komponentlar, mobile-first responsive layout va kirish imkoniyati (a11y — fokus, kontrast, semantik HTML, klaviatura, touch nishonlari). Rang, o'lcham, shrift, radius, layout, forma, navigatsiya yoki interaktiv element bilan ishlaganda ishlat. Doim yuklanadi.
---

# Design system, responsive va a11y (SkillProof)

Next.js App Router + Tailwind **v4** (`@tailwindcss/postcss`), konfiguratsiya CSS ichida (`@theme` / `@theme inline`), `tailwind.config.js` yo'q. Komponent kutubxonasi — **shadcn/ui** (`frontend/src/components/ui/`).

## 1. Token qatlamlari
1. **Semantik tokenlar** — komponentlar faqat shularni ishlatadi: `bg`, `surface`, `fg`, `muted`, `border`, `accent`, `accent-fg`, `danger`, `warning`, `success`, `info`.
2. **shadcn tokenlari** (`--background`, `--foreground`, `--primary`, `--muted`, `--destructive`, `--ring` …) semantik tokenlarga bog'lanadi — ikki parallel palitra bo'lmaydi.
3. **Holat tokenlari** (domen): `score-high`, `score-mid`, `score-low`; `suspicion-low`, `suspicion-medium`, `suspicion-high`. Ball/shubha ranglari faqat shular orqali.
4. **Interview xonasi** — o'sha tokenlar, lekin chalg'ituvchi aksentlar yo'q.

```css
@theme inline {
  --color-bg: var(--bg);
  --color-surface: var(--surface);
  --color-fg: var(--fg);
  --color-muted: var(--muted-fg);
  --color-border: var(--border);
  --color-accent: var(--accent);
  --color-accent-fg: var(--accent-fg);
  --color-danger: var(--danger);
}
:root { --bg: oklch(0.99 0 0); --fg: oklch(0.2 0.01 260); /* … */ }
.dark { --bg: oklch(0.16 0.01 260); --fg: oklch(0.96 0 0); /* … */ }
```

## 2. Mavzu
- Light/dark — `next-themes` (`class` strategiyasi), standart `system`.
- Aksent fon bilan ≥ 3:1, `accent-fg` bilan ≥ 4.5:1.

## 3. Komponent stillari
- Komponentda **hex/rgb yozilmaydi**, Tailwind palitrasi (`bg-blue-500`) ishlatilmaydi — faqat semantik tokenlar.
- Variantlar `cva` bilan, class birlashtirish `cn()` (`src/lib/utils.ts`).
- Backend'dan kelgan matn (vakansiya tavsifi) hech qachon `dangerouslySetInnerHTML` bilan chiqmaydi; kerak bo'lsa — sanitizatsiya qilingan markdown.

```tsx
// ❌
<span style={{ color: score > 70 ? '#16a34a' : '#dc2626' }}>{score}%</span>
// ✅
<ScoreBadge value={score} />   // ichida scoreTone(score) → 'text-score-high' | …
```

## 4. Umumiy UI komponentlar
`src/components/ui/` (shadcn) va `src/components/common/` da; sahifa ichida nusxa qilinmaydi.

| komponent | vazifasi |
|---|---|
| `Button` | default / secondary / ghost / destructive; `loading`; min balandlik 44px |
| `Money` | maosh: min–max, valyuta (UZS standart), `tabular-nums` |
| `ScoreBadge`, `SuspicionBadge` | foiz + rang + matnli yorliq (faqat rang emas) |
| `Sheet`, `Dialog` | telefonda pastdan panel, kompyuterda modal |
| `Skeleton`, `EmptyState`, `ErrorState` | yuklanish, bo'sh, xato holatlari |
| `Field` | label + input + xato matni + `aria-describedby` |

## 5. Mobile-first
- Bazaviy stil 360px uchun, kattaroq ekranlar `sm:`/`md:`/`lg:` bilan.
- Job board va nomzod kabineti — telefon va kompyuter teng.
- Interview xonasi va HR replay — kompyuter (≥ 1280px). Telefonda — tushunarli xabar.
- Ro'yxatlar: telefonda kartochka, kompyuterda jadval.

```tsx
// ❌ desktop-first
<div className="grid grid-cols-3 max-md:grid-cols-1">
// ✅
<div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
```

## 6. O'lchamlar
- Touch nishoni ≥ 44×44px. Inputlarda matn ≥ 16px.
- `100vh` emas: `min-h-dvh`.
- Sahifa darajasida gorizontal scroll yo'q (filtr chiplari — istisno).

## 7. Semantik HTML va klaviatura
- Bosiladigan narsa `<button>`, o'tish `<Link>`. `div onClick` taqiqlangan.
- Har sahifada bitta `<h1>`; landmark'lar `<header>`, `<nav>`, `<main>`, `<footer>`.
- Forma: har inputning `<label>`i, xato `aria-describedby` + `aria-invalid`.
- Fokus ko'rinadi: `focus-visible:outline-2 focus-visible:outline-accent`. Dialog fokusni ushlaydi, `Esc` yopadi.

## 8. Kontrast va dinamik kontent
- Matn ≥ 4.5:1, UI ≥ 3:1 — light va dark.
- Ma'lumot faqat rang bilan berilmaydi: shubha darajasi — rang + matn ("Yuqori"); xato — rang + ikonka + matn.
- Taymer ogohlantirishi, toast, "saqlandi": `aria-live` (`assertive` faqat inactivity ogohlantirishida).

## 9. Tekshirish
- [ ] 360px, 768px, 1280px kengliklarda.
- [ ] Light va dark.
- [ ] Faqat klaviatura bilan asosiy oqim.
- [ ] axe `critical`/`serious` 0 (`frontend-quality`).
