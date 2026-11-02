# Phase 3 hisoboti: savollar, topshiriqlar, assessment, "AI bilan yaratish"

**Sana:** 2026-11-02 · **Holat:** tayyor ✅ (backend, frontend, e2e, skrinshotlar)

## Qabul sharti (spec §10, Phase 3)
| Shart | Natija |
|---|---|
| HR ikki bosqichli assessment'ni qo'lda yoki bir bosish bilan quradi | ✅ API: qo'lda (bank → assessment) va "AI bilan yaratish" (jonli worker'da sinaldi: 6 savol + 1 topshiriq → `ready`) · UI: brauzerda jonli stack'da e2e o'tdi (`e2e/assessment.spec.ts`: AI bilan yaratish → `ready`), qo'lda tuzish forma darajasida Vitest + MSW bilan tekshirilgan |

## Backend
**Savollar banki**
- Turlar: ochiq, ssenariy, test (mcq). Ochiq savollarda rubrika (mezonlar va ballar) va namunaviy javob bor.
- Holat belgilari: tasdiqlangan; tekshiruv natijasi (`passed` / `flagged` / `sandbox_pending`).

**Topshiriqlar banki**
- Masala sharti, ruxsat etilgan tillar, boshlang'ich kod, ko'rinadigan va yashirin testlar (kirish → kutilgan chiqish), vaqt va xotira limiti, kod sifati rubrikasi, namunaviy yechim.

**Global shablonlar**
- Faqat admin boshqaradi.
- Kompaniyalar tasdiqlangan shablonni o'z assessment'iga qo'sha oladi, lekin tahrirlay olmaydi.
- Admin yaratish: `python -m app.cli create-admin`.

**Assessment (har vakansiyaga bitta)**
- Sozlanadi: interview tili, Stage 1 topshiriqlari va o'tish bali, Stage 2 savollari (tartib va majburiyligi bilan), ovoz yoki matn rejimi, integrity chegaralari (paste, inactivity va boshqalar), auto-approve.
- Barcha chegaralar global standartdan olinadi va har bir assessment o'zinikini o'rnata oladi (spec §0.9). Noto'g'ri qiymat yoki xato kalit 422 qaytaradi.
- Tayyorlik tekshiruvi: topshiriq yo'q, tasdiqlanmagan element, savollar yetarli emas va hokazo. Har muammo bloklovchi yoki ogohlantirish sifatida belgilanadi.

**"AI bilan yaratish" (fon ishi, arq)**
1. `question_generator` va `task_generator` vakansiya matni, ko'nikmalari va darajasidan savollar hamda topshiriq yaratadi.
2. Har bir element tekshiruvdan o'tadi:
   - sxema;
   - til (uz/ru/en);
   - taqiqlangan mavzular (yosh, oila, sog'liq, din, siyosat, maosh);
   - `item_verifier`: javob to'g'riligi, noaniqlik, prompt injection;
   - topshiriqda namunaviy yechim barcha testlarda **ikki marta** ishga tushiriladi (testlar deterministik bo'lishi uchun).
3. Element yaroqsiz chiqsa bir marta qayta yaratiladi, yana yaroqsiz bo'lsa `flagged` bo'lib qoladi va avtomatik tasdiqlanmaydi.
4. Har bir natijada model va prompt versiyasi saqlanadi.

**Sandbox:** interfeys tayyor. Judge0 Phase 4 da ulanadi. Hozircha topshiriq "sandbox kutilmoqda" holatida bo'ladi va bu ogohlantirish sifatida ko'rsatiladi, chunki kod hali haqiqatda ishga tushirilmagan.

**`make ai-eval`:** oltin to'plam (8 holat). Mock'da faqat pipeline holatlari ishlaydi; model sifatini tekshiradigan holatlar haqiqiy provayder ulanganda ishga tushadi. Natijalar `docs/AI_EVAL.md` ga yoziladi.

Qarorlar: D-070…D-078.

## Testlar
| | Natija |
|---|---|
| Backend pytest | **75/75** ✅ (Phase 3: 17 ta yangi test — bank validatsiyasi va izolyatsiya, shablonlar, tayyorlik va threshold'lar, generatsiya: stub va haqiqiy sandbox, noto'g'ri yechim → flagged, injection va taqiqlangan mavzu → qayta yaratish, parallel job, til va mavzu guardrail'lari, deterministiklik) |
| ruff + mypy strict | toza ✅ |
| `ai-eval --fast` | 5 pass, 3 skip (haqiqiy provayder kerak) ✅ |
| Jonli worker (arq) | generate → `succeeded`, 6 savol + 1 topshiriq, `ready` ✅ |
| Frontend `pnpm lint` / `typecheck` / `build` | toza ✅ |
| Frontend Vitest | **118/118** ✅ (17 ta yangi: mcq/rubrika validatsiyasi, so'rov tanasi, generate polling va to'xtashi, 409, failed, flagged, 404 = bo'sh forma, tayyorlik muammolari) |
| API oqimi (jonli stack, Python skript) | yangi vakansiya assessment → `auto_approve` → generate → `succeeded` (8 savol + 1 topshiriq) → `ready: true`, ogohlantirish `task_not_sandbox_validated` ✅ |
| Playwright e2e, jonli stack (`pnpm test:e2e:live`) | **1/1** ✅ (axe bilan) |
| Playwright e2e, mock API (`pnpm test:e2e`, backend'ga ulanmagan ilova) | **28/28** ✅ |

## Frontend
- Sahifalar: `/hr/questions`, `/hr/tasks`, `/hr/vacancies/{id}/assessment`; navigatsiya (Savollar, Topshiriqlar), vakansiyalar ro'yxati menyusi va tahrirlash sahifasida Assessment havolasi.
- Banklar: URL'dagi filtrlar (qidiruv, ko'nikma, tasdiq, manba, umumiy shablonlar), yaratish/tahrirlash/o'chirish/tasdiqlash, MCQ variantlari va to'g'ri javoblar, rubrika muharriri, ochiq/yashirin testlar, tilga qarab boshlang'ich kod. Manba, tekshiruv holati va `flagged` sababi ko'rinadi.
- Assessment: til, savollar manbai, Stage 1 (bankdan topshiriqlar, davomiylik, o'tish bali), Stage 2 (rejim, adaptiv, savollar tartibi va majburiyligi), integrity override'lar (standart qiymat maslahat sifatida), tayyorlik paneli (bloklovchi va ogohlantirishlar nomi bilan).
- "AI bilan yaratish": parametrlar, 2 soniyalik polling, natija va `flagged` soni, `409` xabari; tugagach assessment va banklar yangilanadi.
- Qarorlar: D-038…D-042.

## Skrinshotlar
`img/` da 7 ta kadr: savollar banki + MCQ validatsiyasi, topshiriqlar banki (ru), bo'sh assessment, bloklovchi muammolar, tayyor assessment (en, uz mobil).

## Ochiq savollar
0. API kontrakti: `409 generation_in_progress` job id qaytarmaydi va job ro'yxati endpoint'i yo'q, shuning uchun sahifa qayta yuklangach davom etayotgan generatsiyani ko'rsatib bo'lmaydi. `TaskOut.visible_tests/hidden_tests` va `QuestionOut/TaskOut.language` OpenAPI'da `object[]` / `string` (aniq tur emas), `TaskOut.reference_solution` ham aniq turga ega emas (`object | null`). Skill bo'yicha id qidiruvi yo'q (D-038).
1. LLM provayder hali tanlanmagan. Hozir hammasi mock'da ishlaydi. Provayder ulanganda `make ai-eval` model sifatini ham tekshiradi.
