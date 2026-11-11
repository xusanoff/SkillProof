# Natija kechikishi — 2026-11-11

## Yakuniy holat

Natija tayyorlash oqimi tezlashtirildi va sekin provayder sabab cheksiz kutish
yo‘li yopildi. Lokal API, worker, web, PostgreSQL, Redis va Judge0 ishga tushirildi.
`http://localhost:3000/api/health`: database, redis, worker — ok.
Haqiqiy navbat testi: API → Redis → worker → `pong`.

Userning aynan qaysi sayti/arizasi kechikkani noma’lum. Production loglari
olinmagan; tashqi serverga deploy va real provider tezligi/sifati tekshirilmagan.
Lokal asosiy bazada tekshiruv payti pending hisobot/ended Stage 2 yo‘q edi.
Mavjud tayyor hisobotlar qayta hisoblanmadi.

## Sabablar va tuzatishlar

| Oldin | Hozir |
|---|---|
| Natija navbati har 15 s tekshirilgan | Har 3 s tekshiriladi |
| Ishonchi past yoki bahosi yo‘q javoblar ketma-ket AI kutgan | Faqat AI chaqiruvlari bir vaqtda, standart maksimum 3 ta; DB session amallari ketma-ket |
| Har javobning timeout/retry vaqti qo‘shilib ketgan | Barcha yakuniy qayta baholashga umumiy 30 s deadline; navbatdagi slotni kutish va barcha provider retry ham shu vaqt ichida |
| HR xulosasi va nomzod izohi ketma-ket yaratilgan | Mustaqil AI chaqiruvlari parallel; har bir yozuvchining barcha urinishlari uchun 30 s deadline |
| 600 s worker cancellation failure hisobini chetlab o‘tishi mumkin bo‘lgan | Umumiy report deadline 180 s, worker limitidan oldin rollback/failure hisobi ishlaydi |
| Eskirgan navbat vazifasi tayyor report yozuvchilarini takror chaqirgan | Tayyor/failed report qayta chaqirilmaydi; HR Stage 1 gate’ni ochib, yangi Stage 2 tugatilsa qayta hisoblash ishlaydi |
| API sog‘lom ko‘rinsa ham worker o‘chiq bo‘lishi mumkin bo‘lgan | `/health` worker heartbeatni ham tekshiradi; worker heartbeat har 5 s, TTL taxminan 6 s; Docker worker healthcheck va restart policy bor |
| Mobil natija faqat ochilganda/manual refresh bilan yuklangan | Pending holatida har 3 s avtomatik yangilanadi; done/failed va dispose’da timer to‘xtaydi; so‘rovlar bir-birini kutadi |

OpenAI-compatible providerning oldingi standart 120 s timeout + 2 transport
urinishi + 3 s tanaffusi bitta chaqiruvni taxminan 243 s ga cho‘zishi mumkin edi.
Ikki yozuvchi shunday ishlasa taxminan 486 s (8 min 6 s); bu hisob javoblarni
qayta baholashni ham o‘z ichiga olmaydi. JSON/guardrail retry yanada vaqt qo‘shishi
mumkin edi. Bu koddan olingan misol, user arizasining live o‘lchovi emas.

## Tezlik va bahoning to‘g‘riligi

Standart sozlamada AI kutishi: qayta baholashga ko‘pi bilan 30 s, parallel
xulosa/izohlarga yana ko‘pi bilan 30 s. Demak, AI kutish budjeti taxminan 60 s.
Ishonchli oldingi baholar mavjud bo‘lsa qayta baholash chaqiruvlari yo‘q.
Bu 60 s umumiy SLA emas: servis/navbat/DB va web polling (5 s) qo‘shimcha.

AI vaqtida javob bermasa:
- Mavjud baho, mezonlar va dalillar saqlanadi, noaniq baho `needs_review` bo‘ladi.
- Olinmagan baho 0 yoki taxminiy raqamga aylantirilmaydi; null qoladi.
- Izoh olinmasa mavjud ballar ko‘rinadi, HR tekshiruvi belgilanadi.
- Provider sekinligi nomzodni avtomatik diskvalifikatsiya qilmaydi.

`report_phase` loglari ariza ID, grading/summary/feedback fazasi va latency_ms
beradi; yozuvchilarda timeout outcome ham bor. `report_completed` umumiy ishlov
vaqtini beradi. Keyingi live hodisani shu loglar bilan aniq ajratish mumkin.

## Sozlamalar

- `REPORT_AI_PHASE_TIMEOUT_S=30` — grading fazasining umumiy deadline’i va har yozuvchining deadline’i.
- `REPORT_GRADING_CONCURRENCY=3` — bitta report uchun parallel grading chaqiruvlari.
- `REPORT_TIMEOUT_S=180` — umumiy favqulodda deadline; maksimum 540 s.
- Standart `evaluation_max_attempts=5` infratuzilma/dastur xatolari uchun saqlangan;
  odatiy AI timeout report jobni boshidan qayta boshlatmaydi, safe fallback bilan yakunlaydi.

## Tekshiruvlar

- Backend to‘liq suite: 383 passed / 2 skipped; so‘ng qo‘shilgan missing-score
  regression testi ham alohida o‘tdi (1/1).
- Report suite dastlabki yangi 5 regression bilan 44/44 o‘tdi.
- Frontend results + status 12/12, typecheck, tegishli ESLint, production build
  va tarjimalar Prettier tekshiruvi o‘tdi.
- Mobile to‘liq suite 15/15; Flutter analyze — no issues; Dart format o‘tdi.
- Ruff va mypy butun backend uchun o‘tdi; Compose config va git diff whitespace o‘tdi.
- Sun’iy 10 s kutadigan provider testlarda 0.15 s phase deadline bilan bekor
  qilindi; test 3 s chegarasida done natija va haqiqiy ball saqlanishini tekshiradi.
  Parallel writer testi ikkala chaqiruv bir paytda boshlanishini event barrier bilan tekshiradi.
- Mobil testlar pending → done, so‘rovlar ustma-ust tushmasligi va dispose’da
  polling to‘xtashini tekshiradi.

Lokal Docker image’lar yangilandi va servislar ishga tushirildi.
Mobil source yangilandi; mavjud eski APK qayta yig‘ilmadi (Android SDK yo‘q).
GitHub relizi: backend/web 0.2.0, mobile 1.0.1+2, tag v0.2.0.
Tashqi backend server deploy bu reliz tarkibida bajarilmadi.
