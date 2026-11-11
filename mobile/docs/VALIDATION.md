# Mobil modul tekshiruvi

Sana: 2026-11-09. Flutter 3.47.9 / Dart 3.13.7, Java 17.0.21,
Android SDK 36, Android 15 / API 35 x86_64 Pixel 4 emulyatori.
Backend: joriy FastAPI kodi, lokal PostgreSQL va Redis, mavjud demo hisoblar.
Backend va vebdagi oldingi uncommitted o‘zgarishlar saqlandi; yangi kod `mobile/`da.

## O‘tgan tekshiruvlar

| Tekshiruv | Natija |
|---|---|
| `flutter analyze` | No issues found |
| `flutter test` | 11 test o‘tdi |
| `flutter test tool/live_check_test.dart` | 1 jonli test, 13 backend tekshiruvi o‘tdi |
| `flutter drive --driver=test_driver/integration_test.dart --target=integration_test/candidate_flow_test.dart -d emulator-5554 …` | Real Android emulyatori + real backend: All tests passed |
| `flutter build apk --debug --dart-define=API_BASE_URL=http://10.0.2.2:8000 --dart-define=WEB_BASE_URL=http://10.0.2.2:3000` | APK yaratildi |

Unit/widget testlar: parallel refresh bitta bajarilishi, cookie rotatsiyasi,
sessiya tugaganda xavfsiz saqlashni tozalash, aloqa xatosida sessiyani saqlash,
backend statuslari va HR amallari, yo‘q maoshni to‘qimaslik, 320 dp / 180% matn,
klaviatura ochiq login, splash majburiy kutish qo‘shmasligi, reduced motion,
uzun tavsifda pastki ariza tugmasi, ikki marta yuborishni to‘sish va tarmoq
xatosida kiritilgan izohni saqlash.

Real backend: kirish, qidiruv/filtr, detal, vakansiyani saqlash, ariza,
takroriy arizani rad etish, nomzod kuzatuvi, HR holati yangilanishi, hisobot,
hali tayyor bo‘lmagan natija, HR uchun nomzod endpointining 403 javobi,
sessiyani tiklash va logout.

Qurilmada: login → qidiruv → detal → izoh bilan ariza → ortga qaytishda
qidiruv saqlanishi → Arizalarim → HR o‘zgartirgan status → natija → ortga
qaytish; 180% matn; API manziliga ulanish imkonsiz bo‘lganda xato va qayta
urinish; haqiqiy Android secure storage orqali sessiyani qayta tiklash.
Keyin HR sifatida kirish, nomzod kartalarini sahifalash, nomzod tafsiloti,
status o‘zgartirish va ichki eslatma saqlash ham tekshirildi.

Oxirgi APK test runner emas, `lib/main.dart`dan yig‘ilgan oddiy ilova.
Unda test hisob/parollari yo‘q. APK: `build/app/outputs/flutter-apk/app-debug.apk`.

## Skrinshotlar

- [Login](screenshots/login.png)
- [Vakansiya tafsiloti](screenshots/vacancy-detail.png)
- [Arizalar](screenshots/applications.png)
- [Qidiruv](screenshots/candidate-vacancies.png)
- [180% matn](screenshots/large-text.png)
- [HR nomzod tafsiloti](screenshots/hr-candidate.png)

Skrinshotlardagi `Flutter device …` vakansiyalari jonli test backendida
yaratilgan vaqtinchalik test ma’lumotlari; ilovaga namuna sifatida kiritilmagan.
Muvaffaqiyatli test oxirida vakansiya arxivlanadi va ariza qaytariladi.

## Tekshirilmagan yoki vebda qolgan qismlar

- iOS build, simulator va Keychain amaliy tekshiruvi: bu Linux muhitida
  macOS/Xcode yo‘q. iOS runner, launch resurslari va Keychain entitlement qo‘shilgan.
- Haqiqiy jismoniy telefonlarda sinov o‘tkazilmadi.
- CV fayl tanlash/saqlash platforma dialogi va ko‘nikma maxfiylik tugmasi
  qurilmada alohida bosib tekshirilmagan; mavjud API kontraktiga ulangan.
- Native AI ovozli suhbat, mikrofon/STT/TTS/telemetriya yozilmagan.
  Stage 2 mavjud mobil veb suhbat orqali ishlaydi; brauzerda alohida login
  talab qilinishi mumkin. Veb serverning mavjudligi `WEB_BASE_URL`ga bog‘liq.
- Stage 1 uchun kompyuter kerak. Admin, HR vakansiya yaratish, analitika,
  replay va hisobot override boshqaruvi vebda qoladi.
- RU/EN resurslari va til tanlash mavjud; barcha ekranlarning RU/EN uzun
  matnlari qurilmada alohida vizual tekshirilmadi.
- `file_picker` 10.x uchun Flutter kelajakdagi Built-in Kotlin migratsiyasi
  haqida build ogohlantirishi beradi. Joriy Flutter 3.47.9 debug build o‘tdi.

SDK bu sessiyada `/tmp/skillproof-flutter`, Java `/tmp/skillproof-java`,
Android SDK `/tmp/skillproof-android`ga tayyorlandi; ular vaqtinchalik muhit
fayllari va repo tarkibiga kirmaydi. Global shell sozlamalari o‘zgartirilmadi.

## 2026-11-09 — yangi HR oqimi va chat

Ushbu tarixiy mobil hisobotdan keyin yangi funksiyalar qo‘shildi: uch qadamli HR
vakansiya yaratish, inline savol yaratish/tasdiqlash, alohida savollar banki va
nomzod–kompaniya chati. Natijalar va joriy chegaralar:
[`docs/reports/hiring-workflow/REPORT.md`](../../docs/reports/hiring-workflow/REPORT.md).
