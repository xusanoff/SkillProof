# Vakansiya yaratish va ariza chati

2026-11-09. Yangi foydalanuvchi talabi asosida backend, veb va Flutter yangilandi.
Avvalgi redesign va AI budget ishlari saqlandi. Commit/push qilinmadi.

## Natija

1. Yangi vakansiya uch qadamda yaratiladi: umumiy ma’lumot → baholash
   konfiguratsiyasi → amaliy topshiriq va savollar tanlash. Dastlabki qadamlar
   qoralama bo‘lib saqlanadi. Yakuniy UI nashr qilishdan oldin serverning
   `ready` natijasini tekshiradi. Ortga qaytishda forma qiymatlari saqlanadi.
2. Vebda savollar banki va uchinchi qadam bir xil savol formasidan foydalanadi.
   Inline savol umumiy kompaniya bankida saqlanib, baholashga tanlanadi.
   Bankda qidirish, savollarni sahifalash, tanlanganlarni tartiblash,
   majburiy belgilash va kompaniya savolini tasdiqlash mavjud.
3. Flutterda ham uch qadamli HR forma, bankdan tanlash, shu joyda ochiq savol
   yaratish/tasdiqlash va alohida Savollar banki sahifasidan savol qo‘shish mavjud.
   Vebdagi MCQ/scenario va rubrikalarni to‘liq tahrirlash imkoniyati saqlangan.
4. Har bir ariza — alohida chat. Nomzod va tegishli kompaniya a’zolari yozadi.
   Rad javobi va boshqa holat o‘zgarishlari shu tarixga avtomatik tushadi.
   Rad etilgandan yoki ariza qaytarilgandan keyin ham yozish mumkin.
5. O‘qilmaganlar hisobi, xabarlar tarixi, sahifalash, matnni xatoda saqlash
   va bir xil yuborish qayta uringanda nusxa yaratmaslik qo‘shildi.
   Eski arizalar uchun migratsiya faqat hozirgi holatni kiritadi.

## Tekshiruvlar

- Backend: **365 passed, 2 skipped**; `ruff check .` va `mypy app` o‘tdi.
  Chat testlari ruxsatlar, ikki tomonlama yozishma, rad javobi, qayta yuborish,
  bo‘sh/uzun xabar, oldingi/yangi xabar kursori va read-cursor rollbackini qamraydi.
- Migratsiya `c24e85a6f901`: alohida `skillproof_workflow_migrations` bazasida
  upgrade → `alembic check` (yangi farq yo‘q) → downgrade → upgrade o‘tdi.
  Lokal ishchi bazaga ham qo‘llandi. Asosiy ma’lumotlar o‘chirilmagan.
- Veb: **297 test o‘tdi**, lint/typecheck va production webpack build o‘tdi.
  Yangi komponent testlari: uch qadam, faqat yakunda publish, inline savol,
  qoralamani saqlash va xatodan keyingi bir xil UUID bilan chat retry.
- Playwright + real backend + production veb: **2/2 o‘tdi**. HR yangi savolni
  formada yaratib/tasdiqlab vakansiyani nashr qildi; alohida nomzod/HR brauzer
  sessiyalarida xabarlar almashildi va rad javobidan keyin ham yozish davom etdi.
  390 px overflow yo‘q; yangi ekranlarda axe serious/critical: **0**.
- Flutter: analyze va **12 test o‘tdi**. 320 dp / 180% matn + klaviatura
  ochiq yangi forma regressiyasi qo‘shildi.
- Android API 35 emulyatori va real backend: asosiy nomzod oqimi, native chatda
  haqiqiy yuborish va HR javobini olish tekshirildi. Yuborilgan matn serverda
  bir nusxa ekanligi ham tekshirildi. Uch bosqichli HR oqimi yangi savolning
  bankka tushishini, tasdiqlanishini va tayyor baholash bilan publishni tekshiradi.
  Alohida Savollar bankidan ikkinchi savol qo‘shish ham native UI orqali o‘tdi.
- `next dev` rejimida ham yangi vakansiya va chat sahifalari brauzerda
  tekshirildi: page error yo‘q. Auth guardli yangi sahifalar instant-validation
  talabini alohida boshqaradi; production uchun umumiy sozlamalar o‘zgarmagan.
- Yakuniy Android debug APK `lib/main.dart`dan, test hisob/parollarini
  kiritmasdan qayta yig‘ildi; unda API manzili `http://10.0.2.2:8001`.
  O‘rnatilgan oddiy APKning cold launch tekshiruvi ham bajarildi.

## Ochish va ishga tushirish

Lokal veb: `http://localhost:3000/uz/hr/vacancies/new`.
HR yozishmalar: `/uz/hr/messages`; nomzod: `/uz/candidate/messages`.
Ariza kartasida ham chat havolasi bor. Demo hisoblar repo seed’idan olinadi.
Ushbu sessiyadagi veb yangilangan API’ga `http://127.0.0.1:8001` orqali ulanadi.

Oddiy stackni yangilashda backend build va `alembic upgrade head` kerak.
Yangi API va cookie shartnomasi: `docs/API.md`. Arxitektura: D-183.
Flutter buyrug‘i va muhit sozlamasi: `mobile/README.md`.

## Skrinshotlar

- [Uchinchi bosqich, desktop](wizard-desktop.png)
- [Nomzod chati, 390 px](chat-mobile.png)
- [Native chat](../../../mobile/docs/screenshots/chat-native.png)

Rasmlardagi vakansiya/savollar lokal test ma’lumotlari. Test vakansiyalari
tekshiruvdan keyin arxivlandi; oldingi testlardan qolgan lokal bank savollari
real mijoz ma’lumoti emas. Tashqi email/Telegram xabari yuborilmadi.

## Chegaralar

Chat matnli, veb/native suhbat 3 soniyada, native ro‘yxat 5 soniyada yangilanadi.
Fayl yuborish, typing/online indikatori va OS push bu o‘zgarishga kiritilmagan.
iOS bu Linux muhitida tekshirilmadi. Oldingi native AI audio cheklovi saqlanadi;
ushbu vazifa vakansiya yaratish va kompaniya–nomzod matnli chatini o‘zgartiradi.
