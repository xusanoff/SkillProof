# Uch bosqichli vakansiya va ariza chati

Manba: foydalanuvchining 2026-11-09 talabi. Oldingi redesignning «API o‘zgarmaydi»
cheklovi ushbu yangi funksional vazifaga tatbiq qilinmaydi.

- Vakansiya: umumiy ma’lumot → baholash konfiguratsiyasi → topshiriq/savol tanlash.
  Birinchi ikki bosqich qoralamani saqlaydi; faqat tayyor baholash bilan yakunda nashr qilinadi.
  Vebda mavjud savol formasi bankda ham, uchinchi qadamda ham ishlatiladi.
  Inline yangi savol shu kompaniya bankida saqlanib, darhol tanlanganlarga qo‘shiladi.
  Savollar bankida qidiruv va sahifalash bor. Tasdiqlanmagan savolni shu joyda tasdiqlash mumkin.
- Chat: har ariza alohida yozishma. Nomzod va tegishli kompaniya a’zolari ko‘radi.
  Rad etilgan yoki qaytarilgan arizadagi yozishma saqlanadi va yozish mumkin.
- Ariza statuslari xabarga shu DB tranzaksiyasida yoziladi, jumladan baholash xizmatlari
  o‘zgartirgan holatlar. Migratsiya eski arizalar uchun faqat hozirgi holatni kiritadi.
- Xabar matni 1–4000 belgi. Client UUID qayta urinishda takroriy xabarni to‘sadi.
  Ketma-ketlik kursori eski/yangi xabarlarni sahifalaydi; o‘qish kursori har foydalanuvchiga alohida.
  Veb suhbat 3 s, mobil suhbat 3 s, mobil ro‘yxat 5 s oralig‘ida yangilanadi.
- Qo‘shimcha tashqi xabar/SMTP/Telegram yuborilmaydi. Ilova ichidagi xabarlar va mavjud
  status bildirishnomalari bir-birini to‘ldiradi. Hozirgi scope: matnli chat va holat tarixi;
  fayl yuborish, typing/online indikatori va OS push ushbu bosqichga kiritilmagan.
- Mavjud qoralama tahriri va mustaqil baholash sahifasi saqlanadi.
  Backend API ikkalasiga umumiy; veb va Flutter shu shartnomadan foydalanadi.

Tekshiruvlar: backend API/ruxsat/idempotency/kursor testlari, frontend forma va xato
regressiyalari, real backend bilan veb va Android emulyator yurishlari, build/migratsiya.
