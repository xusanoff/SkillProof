# Phase 10 hisoboti: admin, analitika, xavfsizlik, deploy

## Holat
Hamma band tayyor va sinalgan. Lekin tizim hali production'ga chiqa olmaydi: STT va TTS'ning faqat mock varianti bor, production esa mock bilan ishga tushmaydi. Avval provayderlarni tanlash kerak.

## Nima qilindi

### Admin panel (`/admin`)
- Foydalanuvchilarni qidirish, o'chirib qo'yish va qayta yoqish. O'chirilgan foydalanuvchi darhol tizimdan chiqadi.
- Kompaniyani tasdiqlash va bloklash, vakansiyani yashirish. Ma'lumot o'chmaydi, faqat saytdan yo'qoladi. Kompaniya sababini ko'radi.
- Global savol va topshiriq shablonlari.
- Global chegaralar: 30 soniyada kuchga kiradi, faqat yangi sessiyalarga ta'sir qiladi.
- AI sarfi: chaqiruv, token, narx. Narx `AI_PRICES` sozlamasidan olinadi. Narxi berilmagan chaqiruv "noma'lum" deb ko'rsatiladi, bepul deb emas.

### Analitika (`/hr/analytics`)
Voronka, bosqichlardan o'tish foizi, o'rtacha ballar, saralashgacha vaqt, vakansiyalar kesimida.

### Shaxsiy ma'lumotlar
- Har kuni saqlash muddati (180 kun) o'tgan telemetriya va ovoz yozuvlari o'chiriladi. Ball, hisobot, yakuniy kod va transkript qoladi.
- Sozlamalarda ma'lumotlarni yuklab olish va hisobni o'chirish.

Ega endi jamoa a'zosini ham ega qila oladi. Busiz yagona ega hisobini o'chira olmasdi.

### Xavfsizlik
To'liq ro'yxat: `docs/SECURITY_REVIEW.md`. Asosiylari:
- `dompurify` zaifligi yopildi (critical va high).
- Production mock AI bilan ishga tushmaydi, aks holda nomzodlarga o'ylab topilgan ball qo'yilardi.
- Login limiti endi har bir mijoz uchun alohida. Oldin bitta odam hammaning kirishini to'sib qo'yishi mumkin edi.
- Xavfsizlik sarlavhalari va CSP qo'shildi.

### Deploy
`docker-compose.prod.yml`, `Caddyfile` (avtomatik HTTPS), `scripts/backup.sh`, `scripts/restore.sh`, `docs/DEPLOY.md`.

## Sinovlar
- Backend: 313 ta test; ruff, mypy, alembic check toza.
- Frontend: 293 ta unit, 38 ta mock e2e; lint, typecheck, build toza.
- Dev stack'da jonli e2e: 18/18.
- Production sozlamasi vaqtinchalik stack'da (Caddy, HTTPS, `ENVIRONMENT=staging`) sinaldi: sweep 12/12, Monaco CSP ostida 0 buzilish, soxta `X-Forwarded-For` limitni aylanib o'tmadi, boshqa mijoz bloklanmadi, 60 MB dan katta so'rov 413 oldi. Zaxira alohida bazaga tiklandi va qator sonlari mos keldi.
- Shu stack'da voice testi yiqildi, chunki u production'da yopiq to'g'ridan-to'g'ri API yo'lini tekshiradi. Dev stack'da o'tadi.

## Topilgan xatolar
- Phase 9'dagi tarjima o'zgarishlari ikkita jonli testni buzgan edi (`Timeline`, `Assessment`). O'shanda jonli testlarni yugurtirmaganman. Tuzatildi.
- Chegaralar maydonini tozalab bo'lmas edi. Test topdi, tuzatildi.

## Sinalmagan yoki cheklangan
- Haqiqiy domen, Let's Encrypt sertifikati, SMTP va Telegram. HTTPS faqat `localhost` sertifikati bilan sinalgan.
- "Ega qilish" tugmasi va qisqartirilgan menyu yorlig'i jonli e2e va sweep'dan keyin qo'shildi: API testda sinalgan, tugmaning o'zi brauzerda sinalmagan.
- Tashqi penetratsion test qilinmagan. Xavfsizlik tekshiruvini o'zim qildim.
- Retention ishi testlarda sinalgan, lekin worker jadvali bo'yicha real ishlaganini kuzatmadim.
- AI sessiyasi uchun token va audio byudjeti (spec §9) hali yo'q, sarf faqat hisoblanadi.
- Saralash vaqti faqat HR holat o'zgartirish yo'li orqali o'tganlarni hisoblaydi.

## Bilish kerak
- Hisob o'chirilsa, kompaniya ham shu nomzodning ariza va natijalarini yo'qotadi.
- Eksportga shubha signallari va HR izohlari kirmaydi. Bu qonunga mosligini yurist ko'rishi kerak.
- Zaxiralar shu serverda qoladi. Boshqa joyga shifrlab ko'chirish sizning qaroringiz.
- Kompaniyaning yagona egasi hisobini o'chira olmaydi. Avval Jamoa sahifasida boshqa a'zoni ham ega qilishi kerak.

## Skrinshotlar
- [Analitika](img/01-hr-analytics-uz-desktop.png)
- [Analitika, telefon](img/02-hr-analytics-uz-mobile.png)
- [Admin paneli](img/03-admin-overview-uz-desktop.png)
- [Kompaniyalar, telefon](img/04-admin-companies-uz-mobile.png)
- [Chegaralar](img/05-admin-thresholds-uz-desktop.png)

Faqat 01 va 04 ni ko'rib chiqdim.

## Qo'lda sinash
`make up && make seed`, parol `Demo-parol-2026`.
1. `demo.admin@example.com` bilan `/uz/admin` ni oching.
2. `demo.hr@example.com` bilan `/uz/hr/analytics` ni oching.
3. `/uz/settings` da ma'lumotlarni yuklab oling.

## Savollar
1. Qaysi LLM, STT va TTS provayderlarini ulaymiz?
2. Phase 10'ni commit qilaymi?
