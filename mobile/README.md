# SkillProof mobile

Android/iOS Flutter ilovasi. Audit va API xaritasi: [docs/AUDIT.md](docs/AUDIT.md).
Mavjud backend va veb kodiga o‘zgartirish kiritilmaydi.

## Ishga tushirish

Flutter stable **3.47.9 / Dart 3.13.7**, Android SDK va Java 17+ kerak.

```sh
cd mobile
flutter pub get
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:8000 \
  --dart-define=WEB_BASE_URL=http://10.0.2.2:3000
```

`API_BASE_URL` — FastAPI origin, oxirida `/api/v1` yozilmaydi.
Android emulyatorida host `10.0.2.2`, iOS simulyatorida `localhost`, haqiqiy
telefonda kompyuteringizning LAN manzili ishlatiladi. Backend telefondan
kirish mumkin bo‘lgan interfeysda tinglashi kerak. Production uchun ikkala URL
HTTPS bo‘lishi kerak; Android HTTP faqat debug manifestida ruxsat etilgan.
iOS lokal tarmoq uchun ATS local networking qoidasiga ega; iOS build/signing Mac/Xcode talab qiladi.

Backend: repo ildizida `make up`, lokal demo ma’lumot zarur bo‘lsa `make seed`.
Ilovaga demo hisob/parol hardcode qilinmagan. Backend rollarni belgilaydi.

## Ekranlar

- Nomzod: vakansiyalar, qidiruv, pastki filtr paneli, saqlanganlar, tafsilot,
  izoh bilan ariza, holat, arizani qaytarish, natija va izohlar.
- Profil: sarlavha/shahar/tavsif, CV yuklash/yuklab olish/o‘chirish, tasdiqlangan
  ko‘nikmalar va ularni ommaviy qilish sozlamasi.
- HR: kompaniya tanlash, ball bo‘yicha nomzod kartalari, tafsilot, mavjud
  status amallari, hisobot dalillari va ichki eslatmalar. Vakansiya yaratish uch
  bosqichda: umumiy ma’lumot, konfiguratsiya, bankdan savol/topshiriq tanlash; shu
  joyda yangi savol yaratish va tasdiqlash ham mavjud.
- Til tanlash: UZ/RU/EN. Matnlar `lib/l10n/strings.dart`da; server bergan
  vakansiya, suhbat va hisobot mazmuni o‘zgartirilmaydi.

Sessiya cookie’lari Android xavfsiz shifrlangan saqlash/iOS Keychain’da.
401 javobida refresh bir vaqtda bitta bajariladi. Sessiya tugaganda ochiq
tafsilotlar yopilib login ko‘rsatiladi. Parol saqlanmaydi.

Stage 1 kompyuterda bajariladi. Stage 2, replay va hisob yaratish mavjud veb
ilovaga tashqi havola orqali ochiladi. Brauzer sessiyasi alohida: qayta login
kerak bo‘lishi mumkin. Native AI audio/STT/TTS va mikrofon ulanmagan.
Admin, analitika va hisobot override boshqaruvi vebda qoladi.

Nomzod va HR uchun **Xabarlar** bo‘limi mavjud. Har arizaga alohida chat ochiladi,
status o‘zgarishi (jumladan rad javobi) shu tarixga tushadi. Chat 3 soniyada,
ro‘yxat 5 soniyada yangilanadi. Nomzod natijalariga Profil orqali ham kiriladi.
API migratsiyasi: `cd backend && alembic upgrade head`.
Yangi funksiyalar hisoboti: [hiring workflow](../docs/reports/hiring-workflow/REPORT.md).

## Tekshirish

```sh
flutter analyze
flutter test
flutter build apk --debug
# Lokal, seed qilingan backend: maxfiy qiymatni shell environment orqali bering.
MOBILE_TEST_PASSWORD='<local-demo-password>' flutter test tool/live_check_test.dart
# Android/iOS qurilma yoki emulyatorda haqiqiy nomzod va HR UI oqimi:
flutter test integration_test/candidate_flow_test.dart -d emulator-5554 \
  --dart-define=API_BASE_URL=http://10.0.2.2:8000 \
  --dart-define=TEST_PASSWORD='<local-demo-password>'
```

Skrinshotlar bilan tekshirish:

```sh
flutter drive --driver=test_driver/integration_test.dart \
  --target=integration_test/candidate_flow_test.dart -d emulator-5554 \
  --dart-define=API_BASE_URL=http://10.0.2.2:8000 \
  --dart-define=TEST_PASSWORD='<local-demo-password>'
```

Skrinshotlar `docs/screenshots/`ga yoziladi. 320 dp / 180% matn va klaviatura
regressiyalari widget testlarda, 180% matn Android emulyatorida ham tekshiriladi.

Live testlar alohida test vakansiya yaratadi, ariza holatini o‘zgartiradi,
so‘ng arizani qaytarib, vakansiyani arxivlaydi. Faqat lokal test backendida ishlating.
`TEST_CANDIDATE`, `TEST_HR` dart define va `MOBILE_TEST_CANDIDATE`,
`MOBILE_TEST_HR`, `MOBILE_TEST_API` environment orqali hisob/manzilni almashtirish mumkin.

Ikonka va splash belgisini qayta yaratish: `python3 tool/generate_brand.py`.
Tekshiruvlarning amaldagi natijalari: [docs/VALIDATION.md](docs/VALIDATION.md).
