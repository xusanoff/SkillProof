# Phase 9 hisoboti: bildirishnomalar, tarjima, mobil va a11y

## Holat
Bildirishnomalar, tarjima tekshiruvi, mobil va a11y tekshiruvi tayyor. Audio signallar qilinmadi: ular provayder tanlangach, real yozuvlarda sozlanishi kerak.

## Nima qilindi

### Bildirishnomalar
- Email va Telegram orqali: yangi ariza, taklif, bosqich natijasi, holat o'zgarishi. Jadval: `docs/NOTIFICATIONS.md`.
- Xabar holat o'zgarishi bilan bitta tranzaksiyada yoziladi. Xato bo'lsa, 4 marta qayta urinadi.
- Sozlamalar sahifasida har kanalni o'chirish va Telegram ulash mumkin.
- Xabarda ball, shubha darajasi va nomzod ismi yo'q.

### Tarjima
- Kalitlar uchala tilda bir xil (1387 ta), placeholder'lar mos, kodda qattiq yozilgan matn yo'q.
- 12 ta backend xatosida matn yo'q edi, foydalanuvchi umumiy xabarni ko'rardi. Qo'shildi.
- Ruschada "соискатель" va "заявка" atamalari "кандидат" va "отклик" bilan birxillashtirildi, "еще" o'rniga "ещё".
- O'zbekchada inglizcha qolgan "Assessment" va "Timeline" tarjima qilindi.
- 1387 ta matnning hammasi birma-bir o'qilmadi. Tekshiruv skript va atamalar bo'yicha qilindi, shuning uchun til sifatini ona tilida so'zlashuvchi ko'rgani ma'qul.

### Mobil va a11y
Yangi `e2e/responsive-a11y.spec.ts` barcha kod yozilmaydigan sahifalarni uch rejimda tekshiradi: telefon uz, telefon ru dark, desktop en. Topilgan va tuzatilgan muammolar:
- `/hr/vacancies` va `/hr/candidates`: telefonda sahifa yon tomonga 168 px gacha chiqib ketardi.
- HR hisobotidagi kod bloklariga klaviatura bilan kirib bo'lmasdi.
- Dark rejimda kod muharriridagi izohlar kontrasti past edi.

## Sinovlar
- Backend: 276 ta test; ruff, mypy toza.
- Frontend: 278 ta unit, 38 ta mock e2e; lint, typecheck, build toza.
- Jonli stack: 9 ta sweep to'plami o'tdi. Worker xatni console rejimida yetkazdi.

## Sinalmagan yoki cheklangan
- Haqiqiy SMTP va Telegram bot: faqat soxta mijozlar bilan sinalgan.
- Axe faqat avtomatik topiladigan a11y xatolarini ushlaydi (serious va critical). Ekran o'quvchi bilan qo'lda sinalmagan.
- Interview xonasi sweep'ga kirmagan: kod yoziladigan ekran kompyuter uchun.

## Bilish kerak
- Tasdiqlanmagan pochtaga bildirishnoma ketmaydi (D-152).
- Tasdiqlash, parol tiklash va kompaniya taklifi xatlari ketmasa, so'rov xato bermaydi, faqat logga yoziladi (D-154). HR taklif ketmaganini sezmasligi mumkin.
- Bo'sh env qiymati endi barcha sozlamalar uchun "berilmagan" degani.
- Telegram uchun production'da ommaviy HTTPS manzil kerak.

## Skrinshotlar
- [Bildirishnoma sozlamalari, telefon](img/01-settings-notifications-uz-mobile.png)
- [HR vakansiyalari, ruscha, dark, telefon](img/02-hr-vacancies-ru-dark-mobile.png)

## Qo'lda sinash
`make up && make seed`, parol `Demo-parol-2026`.
1. Yangi nomzod bilan "Python dasturchi (intervyu namunasi)" ga ariza bering.
2. 30 soniyadan keyin `docker compose logs worker | grep email_sent`: `demo.hr@example.com` ga xat ko'rinadi.
3. `/uz/settings` da "Bildirishnomalar" bo'limini oching.
4. Sweep: `BASE_URL=http://localhost:3000 pnpm test:e2e:live responsive-a11y --workers=1`.

## Savollar
1. Qaysi LLM, STT va TTS provayderlarini ulaymiz? Audio signallar ham shunga bog'liq.
2. SMTP va Telegram bot ma'lumotlari qachon bo'ladi?
