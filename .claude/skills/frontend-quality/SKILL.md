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
