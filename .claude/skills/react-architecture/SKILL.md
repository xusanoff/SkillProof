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
