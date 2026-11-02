# Frontend skill'lar to'plami (Claude Code uchun)

Bu faylda 6 ta Claude Code skill'i bor. Stek: Next.js App Router, TypeScript, Tailwind v4, shadcn/ui, Motion, next-intl (uz/ru/en), TanStack Query, openapi-fetch, Vitest, Playwright.

**Ishlatish:** faylni loyiha ildiziga qo'ying va Claude Code'ga yozing: `frontend-skills.md ni o'qib, ichidagi ko'rsatmani bajar`.

## Claude Code uchun ko'rsatma

Quyidagi har bir bo'lim uchun to'rtta teskari tirnoq (````) ichidagi matnni **hech narsasini o'zgartirmasdan** sarlavhada ko'rsatilgan faylga yoz. Papkalar bo'lmasa yarat. Fayl allaqachon mavjud bo'lsa, ustidan yozishdan oldin foydalanuvchidan so'ra.

Tugagach, yaratilgan fayllar ro'yxatini ayt va skill'lar ko'rinishi uchun Claude Code'ni qayta ishga tushirish kerakligini eslat.

Skill'lar SkillProof loyihasi uchun yozilgan. Agar joriy loyiha nomi yoki steki boshqacha bo'lsa, fayllarni o'zgartirma: farqlarni sanab, foydalanuvchidan moslashtirish kerakmi deb so'ra.

## `.claude/skills/frontend-design/SKILL.md`

````markdown
---
name: frontend-design
description: Vizual uslub, kompozitsiya va "shablon" ko'rinishdan qochish qoidalari. SkillProof frontend'ida (job board, nomzod interview ekranlari, HR dashboard, admin) har qanday sahifa yoki komponentni yaratish yoki qayta dizayn qilishda ishlat. Doim yuklanadi.
---

# Frontend dizayn (SkillProof)

no-code-mvp'dagi `frontend-design` skill'i asosida, SkillProof uchun moslangan.
Maqsad: har ekran "AI yasagan shablon" emas, ataylab o'ylangan dizayn bo'lsin.

Uch xil dizayn ishi bor:
- **Job board (ochiq qism)** — guest/nomzod: vakansiya qidirish, kompaniya sahifasi. Telefonda ham, kompyuterda ham. Kontent birinchi: lavozim, kompaniya, maosh, shahar.
- **Interview xonasi** (Stage 1 editor, Stage 2 ovozli suhbat) — kompyuter, fullscreen. Tinch, chalg'itmaydigan, yuqori kontrast. Taymer, ogohlantirish va qoidalar har doim aniq ko'rinadi. Bu yerda bezak yo'q.
- **HR / admin xromi** — zich, neytral, ma'lumot jadvallari. Asosiy narsa: reyting, ball, shubha foizi va dalillar.

## 1. Avval mavzu, keyin piksel
Kod yozishdan oldin uchta savolga javob ber:
- **Kim ishlatadi?** Guest/nomzod (ko'pincha telefonda), interviewdagi nomzod (kompyuter, stressda), HR (kompyuter, ko'p nomzodni tez solishtiradi).
- **Asosiy vazifa nima?** Board = mos vakansiyani topish va ariza berish. Interview = vazifaga diqqat. HR = eng yaxshi nomzodni dalil bilan tanlash.
- **Nima xarakterli?** Board'da — vakansiya kartochkasi (lavozim + maosh + kompaniya), HR'da — nomzodning bali va shubha darajasi dalillari bilan. Ekranni shular bilan och, marketing raqamlari bilan emas.

## 2. Reja (katta ekran yoki yangi sahifa uchun majburiy)
1. Ranglar: design-system tokenlari va ularning roli (fon, sirt, matn, aksent, xavf, ogohlantirish). Yangi hex kiritma.
2. Tipografiya rollari: sarlavha, matn, ball/foiz, maosh, yorliq. Ko'pi bilan 2 shrift oilasi (+ editor uchun monospace).
3. ASCII wireframe: telefon (360px) va kompyuter (1280px).
4. 2–3 printsip (masalan: "maosh har doim ko'rinadi", "shubha foizi dalilsiz ko'rsatilmaydi").

Keyin rejani qayta o'qi: qaysi qismi "standart default"ga o'xshaydi? Shuni o'zgartir.

```
┌──────────────────────┐
│ SkillProof   [uz▾]   │  ← sticky header
│ [ Qidiruv........ 🔍]│
│ [Toshkent][Remote].. │  ← filtr chiplar, gorizontal scroll
│ ┌──────────────────┐ │
│ │ Backend dasturchi│ │  ← lavozim — eng qalin
│ │ Acme · Toshkent  │ │
│ │ 12–18 mln so'm   │ │  ← maosh tabular-nums
│ │ [Python][FastAPI]│ │
│ └──────────────────┘ │
└──────────────────────┘
```

## 3. Tipografiya
- Bitta sarlavha va bitta matn shrifti (yoki bitta oila). Lotin + kirill ikkalasini qo'llasin (uz, ru, en).
- Aniq o'lcham shkalasi (design-system tokenlari). Tasodifiy `text-[17px]` yozma.
- Ball, foiz, maosh, taymer — `tabular-nums`.
- Matn qatori ~80 belgidan uzun emas (`max-w-prose`) — vakansiya tavsifi, qoidalar sahifasi.
- Monospace faqat kod uchun (Monaco, kod parchalari), yorliqlar uchun emas.

## 4. Tuzilma va kompozitsiya
- Chegara, yorliq va raqamlash ma'lumot beradi; bezak uchun qo'yilmaydi.
- Raqamli markerlar faqat haqiqiy ketma-ketlikda: qoidalar → tizim tekshiruvi → warm-up → Stage 1 → Stage 2.
- Bir ekranda bitta asosiy harakat (primary): "Ariza berish", "Qoidalarni qabul qilaman", "Yuborish".
- Bo'sh joy guruhlaydi: bog'liq elementlar yaqin, bo'limlar orasida keng.

## 5. Harakat
- Animatsiya kam va ma'noli. Interview xonasida deyarli yo'q (faqat ogohlantirish/taymer holat o'zgarishi).
- Barcha animatsiya `ui-motion` skill'i orqali.

## 6. Matn (copy)
- Foydalanuvchi nuqtai nazaridan, faol nisbatda: "Ariza berish", "Testlarni ishga tushirish".
- Bir harakat hamma joyda bir xil nomlanadi.
- Xato xabari nima bo'lganini va qanday tuzatishni aytadi: "Fayl 5 MB dan katta. Kichikroq PDF tanlang."
- Nomzodga natija va xatolar — muloyim, konstruktiv (spec 6.5). Diskvalifikatsiya — qabul qilingan qoidaga havola bilan, neytral.
- Matnlar faqat i18n kalitlari orqali (`i18n` skill).

## 7. Qochiladigan default'lar
- Bir xil yumaloq oq kartochkalar + gradient fon (SaaS shablon).
- Krem fon + terrakota aksent; deyarli qora fon + kislotali yashil aksent.
- Hammasi katta harfli kichik "eyebrow" yorliqlar.
- `·` bilan ajratilgan uzun meta qatorlar, "SO'Z — fragment" yorliqlari.
- Ma'lumot yorliqlari uchun monospace, har havola oxiriga `→`.
- Hero'da "katta raqam + kichik yorliq + gradient" formulasi ("10 000+ nomzod").

```tsx
// ❌ Shablon: gradient, eyebrow, statistik hero
<section className="bg-gradient-to-br from-purple-500 to-pink-500 p-8 rounded-3xl">
  <p className="text-xs uppercase tracking-widest">AI HIRING</p>
  <h1 className="text-6xl">10 000+</h1>
</section>

// ✅ Vazifa birinchi: qidiruv va vakansiyalar, tokenlar orqali
<section className="bg-bg text-fg">
  <h1 className="text-title">{t('home.title')}</h1>
  <VacancySearch className="mt-4" />
</section>
```

## 8. Sifat chegarasi (har doim)
- Telefon (360px) va kompyuter (1280px) ishlaydi; interview xonasi — kompyuter (telefonda tushunarli xabar).
- Ko'rinadigan fokus, yetarli kontrast, `prefers-reduced-motion`.
- Light va dark ikkalasida tekshirilgan.
- Tugatishdan oldin o'z ishingni tanqid qil va kamida bitta ortiqcha elementni olib tashla.
````

## `.claude/skills/design-system/SKILL.md`

````markdown
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
````

## `.claude/skills/ui-motion/SKILL.md`

````markdown
---
name: ui-motion
description: Animatsiya qoidalari, mikro-animatsiyalar va ishlash cheklovlari (Motion, transform/opacity, reduced motion). Job board, nomzod kabineti, HR dashboard yoki interview ekranlarida har qanday animatsiya, o'tish yoki scroll effekti bilan ishlaganda ishlat. Doim yuklanadi.
---

# UI Motion (SkillProof)

Kutubxona: **Motion** (`motion` paketi, import `motion/react`). Umumiy animatsiya kodi `frontend/src/components/motion/` da; sahifalar uni faqat import qiladi.

## 1. Qayerda nima
```
src/components/motion/
  variants.ts        fadeUp, scaleIn, stagger (manba haqiqat)
  MotionProvider.tsx LazyMotion + MotionConfig reducedMotion="user"
  FadeIn.tsx         bo'lim paydo bo'lishi (whileInView, once)
  PressScale.tsx     tugma/kartochka bosilganda scale 0.97
```

## 2. Qayerda animatsiya mumkin
| joy | ruxsat |
|---|---|
| Job board, kompaniya sahifasi | bo'limlar `fadeUp`, vakansiya kartochkalari qator bo'yicha `stagger` |
| HR dashboard | ro'yxat filtr o'zgarganda opacity; replay player taymlayni |
| **Interview xonasi** | faqat holat signallari: inactivity ogohlantirishi (opacity + kichik scale), AI gapirayotgani indikatori. Boshqa hech narsa. |

Davomiylik 0.2–0.45s, easing `[0.22, 1, 0.36, 1]`. Stagger kechikishi qator ichidagi indeks bo'yicha (`(index % columns) * 0.06`).

## 3. Majburiy qoidalar
1. Faqat `transform` (`x`, `y`, `scale`, `rotate`) va `opacity`. `width`, `height`, `top`, `margin`, `box-shadow`, `filter` animatsiya qilinmaydi.
2. Scroll orqali paydo bo'lish: `whileInView` + `viewport={{ once: true, amount: 0.2 }}`.
3. Bundle: `LazyMotion` + `domAnimation` + `m.*` (`motion.*` emas).
4. `prefers-reduced-motion`: animatsiya o'chadi yoki faqat opacity qoladi (`<MotionConfig reducedMotion="user">`).
5. Server komponentlarda Motion yo'q — animatsiyali qism alohida `'use client'` komponent.
6. `will-change` doimiy qo'yilmaydi.

```tsx
// ❌ layout xususiyati, har scroll'da qayta, to'liq bundle
import { motion } from 'motion/react';
<motion.div initial={{ height: 0 }} whileInView={{ height: 'auto' }} viewport={{ once: false }} />
// ✅
import { m } from 'motion/react';
<m.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.2 }} custom={index} />
```

## 4. Mikro-animatsiyalar
- **PressScale**: `whileTap={{ scale: 0.97 }}`.
- **Skeleton**: opacity pulse; kontent kelgach `opacity 0→1`.
- **Inactivity warning** (60s): banner `opacity`+`y` bilan kiradi, countdown raqami `tabular-nums` (kenglik sakramasin).
- **Sahifa o'tishi**: kerak bo'lsa faqat opacity, 0.2s.

## 5. Tekshirish
- DevTools → Rendering → "Emulate prefers-reduced-motion".
- Performance (CPU 4x): ro'yxat scroll'da "Layout" bloklari yo'q.
````

## `.claude/skills/react-architecture/SKILL.md`

````markdown
---
name: react-architecture
description: Next.js App Router (TypeScript strict) uchun papka tuzilishi, server/client komponentlar, routing, state (TanStack Query + lokal state), API klient (FastAPI OpenAPI'dan generatsiya), httpOnly cookie auth, xato va yuklanish holatlari, WebSocket (interview). Yangi sahifa, feature, route, API chaqiruvi yoki endpoint ulashda ishlat.
---

# Next.js arxitektura va API klient (SkillProof)

no-code-mvp'dagi `react-architecture` skill'i asosida, Next.js'ga moslangan.
Stek: Next.js (App Router), React 19, TypeScript strict, TanStack Query (server state), Zustand faqat murakkab client state uchun (interview xonasi telemetriyasi, replay player).

## 1. Papka tuzilishi (`/frontend`)
```
src/
  app/[locale]/          route'lar — yupqa, feature'larni yig'adi
    (public)/            guest: bosh sahifa, vakansiyalar, kompaniyalar
    (auth)/              login, register, verify, reset
    candidate/           nomzod kabineti, natijalar, verified skills
    hr/                  HR dashboard, vakansiyalar, assessment builder, nomzod sahifasi
    interview/[id]/      qoidalar, tizim tekshiruvi, stage1, stage2
    admin/
  components/
    ui/                  shadcn
    common/              Money, ScoreBadge, EmptyState, ErrorState …
    editor/  replay/  voice/  dashboards/   (spec 4)
    motion/
  features/<x>/          api.ts (query/mutation hook'lari), components/, model.ts (sof funksiyalar), index.ts
  lib/api/               generatsiya qilingan OpenAPI turlari + klient
  lib/telemetry/         editor va fokus hodisalarini yig'ish (spec 4)
  i18n/                  routing.ts, request.ts, navigation.ts
messages/{uz,ru,en}.json
```
- Feature boshqa feature'ning ichki fayliga kirmaydi — faqat `features/x/index.ts`.

## 2. Server va client komponentlar
- Standart — **server komponent**. `'use client'` faqat interaktivlik kerak bo'lgan barg komponentlarda.
- Ochiq sahifalar (vakansiya ro'yxati, vakansiya, kompaniya) server'da render bo'ladi (SEO, tezlik).
- Interview xonasi, HR dashboard filtrlar, replay — client.

## 3. State qoidalari
| turi | qayerda |
|---|---|
| Server state | TanStack Query (client) yoki server komponentda to'g'ridan fetch |
| Interview sessiyasi (telemetriya buferi, taymerlar) | Zustand store `features/interview/model` |
| Lokal UI | `useState` |
| Filtr, sahifa, saralash | URL search params |

- Server ma'lumoti Zustand'ga nusxa qilinmaydi.
- Hosila qiymat render vaqtida hisoblanadi; `useEffect` faqat tashqi tizim uchun (WebSocket, MediaRecorder, Monaco).

## 4. API klient
- Turlar faqat OpenAPI'dan: `openapi-typescript` (backend `/openapi.json`) → `src/lib/api/schema.d.ts`; klient `openapi-fetch`. `pnpm gen:api` skripti. Qo'lda javob turi yozma.
- `baseUrl` = `NEXT_PUBLIC_API_URL` (standart `/api` proxy). Auth — **httpOnly cookie** (spec 3), shuning uchun `credentials: 'include'`; token JS'da saqlanmaydi.
- 401 → bir marta `/auth/refresh`, keyin yana 401 → login sahifasiga.
- Har so'rovda `Accept-Language: <locale>`.

```ts
// ❌ xom fetch va qo'lda tur
const r = await fetch(`/api/v1/vacancies/${id}`); const v: Vacancy = await r.json();
// ✅
const v = await unwrap(api.GET('/api/v1/vacancies/{vacancy_id}', { params: { path: { vacancy_id: id } } }));
```

## 5. Xatolar
- Backend formati: `{ "error": { "code": "...", "message": "...", "details"?: {...}, "request_id": "..." } }` → `ApiError(status, code, details)`.
- Foydalanuvchiga `errors.<code>` i18n matni; noma'lum — `errors.unknown`. `422` forma maydonlariga bog'lanadi.
- Tarmoq/5xx: `ErrorState` + "Qayta urinish". Xatoni jim yutma. `app/[locale]/error.tsx`, `not-found.tsx`.

## 6. TanStack Query
- Kalitlar fabrikasi har feature'da:
```ts
export const vacancyKeys = {
  all: ['vacancies'] as const,
  list: (q: VacancyQuery) => [...vacancyKeys.all, 'list', q] as const,
  detail: (id: string) => [...vacancyKeys.all, 'detail', id] as const,
};
```
- `retry`: 4xx da yo'q, tarmoq/5xx da ≤ 2. Mutatsiyada tugma `loading`, takroriy bosish bloklanadi.
- Optimistik yangilash faqat xavfsiz joyda; ariza berish, status o'zgartirish, override — server javobini kutadi.

## 7. WebSocket (interview)
- Bitta ulanish `features/interview/ws.ts`; hodisalar 1–2 s da paket qilib yuboriladi (spec 6.1), uzilishda buferda qoladi va qayta ulanganda qayta yuboriladi (spec 9). Vaqt — server vaqti asosiy.
- Klient hech qachon "diskvalifikatsiya" yoki ballni o'zi hal qilmaydi — faqat serverdan kelgan holatni ko'rsatadi.

## 8. Komponent qoidalari
- Funksional, nomlangan eksport (sahifa `default export` bundan mustasno); ~150 qatordan oshsa bo'l. `any` taqiqlangan.
- Biznes mantiq `model.ts` da sof funksiya.
- Har ma'lumotli sahifada uch holat: skeleton (`loading.tsx`), `ErrorState`, `EmptyState`.
- Formalar: `react-hook-form` + `zod`, xato matnlari i18n.

## 9. Fayl yuklash va taqiqlar
- Rezyume/logo: avval klientda turi va hajmi tekshiriladi, keyin `multipart/form-data`; backend qayta tekshiradi.
- Taqiq: token'ni `localStorage`/URL/log'ga yozish; ball yoki shubha foizini klientda hisoblab yuborish.
````

## `.claude/skills/i18n/SKILL.md`

````markdown
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
````

## `.claude/skills/frontend-quality/SKILL.md`

````markdown
---
name: frontend-quality
description: Frontend testlari (Vitest + Testing Library, MSW, Playwright e2e, axe) va tezlik (bundle, lazy-load, Monaco'ni dinamik yuklash, Lighthouse). Har yangi komponent, sahifa yoki xato tuzatishdan keyin, yangi kutubxona qo'shishda yoki sekinlik muammosida ishlat. Har bosqich oxirida skrinshotlar ham shu skill bo'yicha olinadi.
---

# Frontend sifati: testlar, tezlik, skrinshotlar (SkillProof)

## 1. Test qatlamlari
| qatlam | vosita | nima tekshiriladi |
|---|---|---|
| Unit | Vitest | sof funksiyalar: maosh formati, telemetriya buferi, paste klassifikatori, replay rekonstruksiyasi |
| Komponent | Vitest + Testing Library + MSW | sahifa/komponent foydalanuvchi ko'radigan natijani beradi |
| E2E | Playwright | guest vakansiya topadi → nomzod ariza beradi → HR ko'radi; interview oqimi |
| a11y | `@axe-core/playwright` | asosiy ekranlarda `critical`/`serious` 0 |

Test fayli kod yonida: `Money.tsx` → `Money.test.tsx`. E2E: `frontend/e2e/*.spec.ts`.

## 2. Testing Library qoidalari
- `getByRole`, `getByLabelText`, `getByText`. `getByTestId` — oxirgi chora.
- Hodisalar `userEvent` bilan. className yoki ichki state tekshirilmaydi.
- Matnlar i18n orqali (`uz` xabarlari bilan `NextIntlClientProvider`).

## 3. Majburiy stsenariylar (bosqichga qarab)
- **i18n**: `uz/ru/en` kalitlari mos; har locale'da bosh sahifa ochiladi.
- **Auth**: 401 → refresh → qayta so'rov; ikkinchi 401 → login.
- **Interview**: tashqi paste bloklanadi va hodisa yuboriladi; ichki paste o'tadi; 60 s da ogohlantirish chiqadi; uzilishda hodisalar yo'qolmaydi.
- **Natijalar**: hidden test kirishlari va reference yechim nomzod sahifasida chiqmaydi.
- Ariza/override tugmasi ikki marta bosilsa bitta so'rov.

## 4. Mock'lar
- Tarmoq — MSW, handler'lar OpenAPI turlaridan. Har testda: muvaffaqiyat, xato (`errors.<code>`), yuklanish.
- Motion: setup'da `MotionGlobalConfig.skipAnimations = true`; IntersectionObserver mock.
- Monaco: unit testda yengil mock; haqiqiy editor faqat e2e'da.
- WebSocket: `mock-socket` yoki o'zimizning fake server.

## 5. E2E
- `waitForTimeout` taqiqlangan — `expect(...).toBeVisible()` kutadi.
- Profillar: telefon `devices['Pixel 7']` (board), desktop 1440×900 (interview, HR).
- Har asosiy sahifada `new AxeBuilder({ page }).analyze()`.

## 6. Tezlik byudjetlari
| ko'rsatkich | Ochiq sahifalar | Interview xonasi | HR |
|---|---|---|---|
| Boshlang'ich JS (gzip, route) | ≤ 150 KB | Monaco'siz ≤ 250 KB | ≤ 300 KB |
| LCP (Slow 4G) | ≤ 2.5s | — | — |
| CLS / INP | < 0.1 / < 200ms | INP < 100ms (editor) | < 200ms |
- Monaco va audio kodi `next/dynamic` bilan faqat interview/replay route'larida yuklanadi.
- Yangi bog'liqlik qo'shishdan oldin hajmini tekshir. `lodash` butunlay, `moment` — yo'q.
- Rasmlar `next/image` (logo), o'lchamli, `alt` bilan.

## 7. Ro'yxatlar
- ≤ 50 element: paginatsiya. Ko'proq (editor_events replay, katta nomzod ro'yxati): `@tanstack/react-virtual`.

## 8. Bosqich hisoboti uchun skrinshotlar
- Playwright skripti `frontend/e2e/screenshots.spec.ts` (yoki `scripts/screenshots.ts`) bosqichdagi asosiy ekranlarni oladi: desktop 1440×900 va telefon 390×844, light (kerak bo'lsa dark), kerakli locale'lar.
- Fayllar: `docs/reports/phase-<N>/img/<nn>-<ekran>-<locale>-<viewport>.png`.
- Skrinshot haqiqiy ishlayotgan ilovadan olinadi (mock ma'lumot emas, seed ma'lumot mumkin).

## 9. Ishni tugatish sharti
- [ ] Yangi kod uchun test yozilgan va o'tadi (`pnpm test`).
- [ ] `pnpm typecheck`, `pnpm lint` toza; `pnpm build` muvaffaqiyatli.
- [ ] Xato tuzatilgan bo'lsa — avval qizil bo'lgan regressiya testi.
- [ ] Route JS hajmlari hisobotda (`next build` chiqishidan).
- [ ] Skrinshotlar olingan.
````
