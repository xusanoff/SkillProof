# Phase 4 hisoboti: Stage 1 (qoidalar, editor, sandbox, telemetriya)

**Sana:** 2026-11-02 · **Holat:** tayyor ✅ (scoring va HR ko'rigi Phase 5 da)

## Qabul sharti (spec §10, Phase 4)
| Shart | Natija |
|---|---|
| Nomzod Stage 1 ni boshidan oxirigacha o'tadi | ✅ Jonli e2e: qoidalar → tizim tekshiruvi → warm-up → Monaco → Judge0 da Run (2/2) → Submit → `completed` |
| Chegaradan katta tashqi paste diskvalifikatsiya qiladi | ✅ Jonli e2e: matn kiritilmaydi, `disqualified` / `external_paste` / `stage1_disqualified` |
| Ichki paste ishlaydi | ✅ Jonli e2e: ichki paste, undo va redo diskvalifikatsiya qilmaydi |
| Barcha hodisalar saqlanadi | ✅ Jonli e2e dan keyin bazada: `insert`, `replace`, `delete`, `cursor`, `copy`, `paste_internal`, `paste_external_blocked`, `run`. Tashqi paste matni saqlanmaydi |

## Nima qilindi
- **Judge0:** `docker-compose` da server, workers, alohida db va redis. Portlar tashqariga ochilmagan, tarmoq `internal`. Python, JS, TS, Go, Java, SQL jonli sinaldi.
- **Backend:** `rules_acceptances`, `interview_sessions`, `code_submissions`, `editor_events`, `integrity_signals` jadvallari; qoidalarni qabul qilish, warm-up, sessiya, Run, Submit; WebSocket telemetriyasi (Origin va cookie tekshiruvi, qayta yuborilgan hodisalar tashlanadi, server soati).
- **Qoidalarni server hal qiladi:** tashqi paste (§7.1), faolsizlik 60/90 s (§7.1b), uzilishda faolsizlik taymeri to'xtaydi, 5 daqiqada qaytmasa `abandoned`, vaqt tugasa oxirgi draft topshiriladi.
- **Frontend:** `/candidate/interview/{id}`: qoidalar (interview tilida), tizim tekshiruvi, warm-up, Monaco, taymerlar, reconnect, holat ekranlari. Kichik ekranda "kompyuterda oching".
- Qarorlar: D-079…D-085 (backend), D-043…D-047 (frontend). Kontrakt: `docs/API.md`.

## Testlar
| | Natija |
|---|---|
| Backend pytest | **96/96** ✅ (21 ta yangi) |
| ruff + mypy strict | toza ✅ |
| Frontend lint / typecheck / build | toza ✅ |
| Frontend Vitest | **149/149** ✅ |
| Playwright, jonli stack | **3/3** ✅ |
| Playwright, mock API | **28/28** ✅ |
| Judge0 cheklovlari (qo'lda, jonli) | cheksiz sikl → `timeout`, tarmoq → bloklangan, 2 GB xotira → xato, fork limitda to'xtaydi, tizim fayllari ko'rinmaydi ✅ |

**Brauzerda sinalmagan, faqat backend va unit testlarda:** faolsizlik diskvalifikatsiyasi, tarmoq uzilib qayta ulanish, vaqt tugashi, `4409` (ikkinchi oyna). Qo'lda tekshirib ko'rish tavsiya etiladi.

## Qo'lda tekshirish
`make up && make seed`, `demo.candidate@example.com` bilan kiring. Assessment'i `ready` bo'lgan vakansiyaga ariza bering, "Arizalarim" dan intervyuni boshlang.

## Skrinshotlar
`img/` da 9 ta kadr: ariza havolasi, qoidalar, tizim tekshiruvi, warm-up, editor va natijalar, topshirish tasdig'i, yakun, diskvalifikatsiya, mobil xabar.

## Ma'lum cheklovlar
1. **Yolg'on mijoz:** `source: keyboard` deb kelgan katta matnni server hozircha ushlamaydi. Bu Phase 5 signallari vazifasi (D-084).
2. **Hali yo'q:** yashirin testlar va ball (Phase 5), HR diskvalifikatsiyani ko'rib tiklashi (Phase 5/7), mikrofon testi (stub, Phase 6). `completed` dan keyin ariza `stage1_in_progress` da qoladi.
3. **Judge0 xotirasi:** limit jarayon bo'yicha, umumiy chegara workers konteyneridagi 6 GB (D-081). Phase 10 da qayta ko'rish kerak.
4. **Interview ekranida sayt header va footer'i ko'rinadi**, nomzod qidiruvga bosib chiqib ketishi mumkin. Taymer to'xtamaydi.
5. WebSocket API'ga to'g'ridan-to'g'ri ulanadi: production'da API va web bitta saytda bo'lishi kerak (D-083).

## Ochiq savollar
1. SQL: spec PostgreSQL deydi, Judge0 da faqat SQLite (D-079). SQLite qoladimi?
2. Til versiyalari eski (Python 3.8, Node 12, TS 3.7, Go 1.13, Java 13). Phase 10 gacha shu holda qoldiramizmi?
3. Nomzod HR saralovisiz intervyuga kira oladi (D-080). Shu to'g'rimi?
