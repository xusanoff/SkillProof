# Deploy tekshiruvi — 2026-11-10

## Natija

Frontend Vercel'ga joylandi: https://skillproof-blue.vercel.app

Project: `xusanoffs-projects/skillproof`.
Deployment: `dpl_Hwyjf6uJ9LhYtApBWsL2ZsYSx2Re`, holati `READY`.
GitHub repository ulandi; keyingi Git buildlar uchun root `frontend`,
Node.js `22.x`, build `pnpm build` qilib sozlandi. Hozirgi deploy CLI orqali
ishchi papkadagi frontenddan yuborildi; commit/push qilinmadi.
`.vercelignore` lokal env va test/build artifactlarini upload'dan chiqaradi.

Bu **frontend-only ko'rish versiyasi**. Backend internetga chiqarilmagan,
VPS/SSH va domen ma'lumotlari hali berilmagan. Login, chat, vakansiya
ma'lumotlari va intervyular uchun to'liq tayyor production deb hisoblanmaydi.

## Tekshiruvlar

- Frontend ESLint, TypeScript, 297 unit/component test va lokal production build o'tdi.
- Vercel cloud production build o'tdi.
- Tashqi HTTPS: `/` → `/uz`, `/uz`, `/ru`, `/en`, `/uz/login` — 200.
- Tashqi `/api/health` — 502: backend ulanmaganligi tasdiqlandi.
- Backend Ruff va mypy o'tdi; yakuniy ketma-ket pytest: **375 passed, 2 skipped**.
  `backend-tests.log` yakuniy run. Yangi production konfiguratsiya testlari shu run ichida.
- Lokal API image build, worker, PostgreSQL, Redis, Judge0 ishga tushdi.
  `/health`: database/redis `ok`; migratsiya `c24e85a6f901 (head)`.
- Production Compose config valid; API, baza, Redis portlari yopiq,
  faqat Caddy tashqi portlarni ochadi. Haqiqiy production servislar ishga tushirilmadi.
- Dastlabki mock brauzer suite: 34 passed, 4 mobile timeout. Keyingi tekshiruvda
  Chromium hatto ko'rinadigan oddiy login sahifasida `requestAnimationFrame`
  callbackini bermasligi mustaqil reproducer bilan aniqlandi; button actionability
  ham timeout bo'ldi. Mobil va live tekshiruvlarni muvaffaqiyatli deb hisoblamang.
  Parallel Playwright runlar umumiy artifact papkasiga xalaqit bergan run ham
  bekor qilindi. Yakuniy frontend-e2e/live loglar to'liq qabul runi emas.
  Testlarni yumshatadigan vaqtinchalik tajriba o'zgarishlari olib tashlandi.
- LLM/STT/TTS faqat lokal `mock` bilan ishlatildi; real provayder sifati,
  tezligi, SMTP delivery va Telegram webhook bu sessiyada tekshirilmadi.

## Tuzatishlar

Production startup endi quyidagilarni trafik qabul qilishdan oldin rad etadi:
implementatsiyasi yo'q LLM provider; LLM URL/key/model yetishmasligi;
implementatsiyasi yo'q S3 storage; Judge0 auth token yo'qligi.
10 ta konfiguratsiya regression testi qo'shildi. Bu live provayder tekshiruvi emas.
Eski uncommitted ishlar saqlandi.

## To'liq deploy oldidan qolgan ishlar

1. VPS IP/SSH user va domenni olish. Maxfiy kalit/parolni chatga yozmaslik.
2. Hosting oqimini yakunlash. Hozir host-only `sp_access` cookie frontend
   proxy orqali frontend domeniga o'rnatiladi. Uni boshqa API hostname'idagi
   intervyu WebSocket'i olmaydi. Hatto bir domenning ikki subdomeni uchun ham
   hozirgi sozlama yetmaydi. `NEXT_PUBLIC_WS_URL`/CORS'ni almashtirish bilan
   cheklanmaslik. Mavjud bir hostname'li VPS Compose/Caddy oqimi bunga mos;
   Vercel + alohida API uchun socket auth/routing yechimini joriy qilish kerak.
3. Haqiqiy production provider/SMTP sozlamalarini serverda xavfsiz kiritish,
   DB/files backup va tashqi backup nusxasini sozlash.
4. Ishlaydigan brauzer muhitida mock va 22 ta live e2e'ni **ketma-ket** yakunlash;
   keyin tashqi HTTPS'da login → vakansiya/ariza/chat → ikkala intervyu bosqichi,
   WebSocket reconnect, upload va HR hisobotini tekshirish.

Serverga deploy, DNS o'zgartirish, pullik servis xaridi, Git push bajarilmadi.
