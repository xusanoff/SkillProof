# UI va tarjima tekshiruvi — 2026-11-06

Holat: foydalanuvchi yangi 10 ekranli dizayn yuborgani sabab yakuniy tekshiruv yangi redesign ishiga qo'shildi. Bu hisobot eski ko'rinish bo'yicha topilgan va tuzatilgan muammolarni saqlaydi.

## Topilgan va tuzatilgan

- Webpack build Tailwind'ni kompilyatsiya qilmay, sahifani dizaynsiz chiqarayotgan edi. Rasmiy PostCSS sozlamasiga o'tildi; Docker'dagi odatiy Turbopack build ham o'tdi. Sweep endi haqiqiy shrift/CSS ishlashini tekshiradi.
- Skip-link kontentga aylantirgan, lekin klaviatura fokusini `main`ga bermagan. `tabIndex=-1` qo'shildi; alohida jonli regression testi yozildi.
- 60 ta tarjima tuzatildi: qolgan Assessment/Stage/Replay/Timeline/Run/paste yozuvlari; o'zbekcha maoshdagi so'z tartibi; ishlayotgan intervyuni «keyinroq chiqadi» deb ta'riflagan eski matn; shortlisted holatining yuborilgan taklif sifatida ko'rsatilishi; sozlanadigan 60%/bir yil qiymatlarini qotirib va'da qilish.

## Bajarilgan tekshiruv

- 1516 ta kalit har bir tilda, jami 4548 matn: bo'sh/yo'q kalit va ICU parse xatosi topilmadi. RU/EN'dagi 6 ta qo'shimcha `total` plural-controller ataylab ishlatilgan; chaqiruvchi komponentlar uni yuborishi tekshirildi.
- 294 frontend unit/component testi o'tdi, lint/typecheck o'tdi.
- Tuzatilgan CSS bilan ommaviy, nomzod, HR va admin sahifalari: phone UZ, phone RU dark, desktop EN — 12 sweep o'tdi.
- Brauzerda HR formadan vakansiya yaratdi; nomzod mobil formadan kirdi, profilini o'zgartirib saqladi va qayta yuklab tekshirdi, avvalgi profilini tikladi, vakansiyani saqladi va olib tashladi, ariza yubordi/qaytardi/qayta yubordi. Til almashtirish qidiruv filtrlarini saqladi. HR arizani saraladi. Shu yurishda uncaught JS xatosi bo'lmadi.
- Stage 1 Monaco muharriri, real sandbox Run, internal paste, submit va HR replay o'tdi. Tashqi paste oqimida mahsulot matni yangilangan, testdagi eski regex esa qolgan edi; regex moslandi.
- 20 testli yakuniy suite to'liq tugamadi: yangi dizayn topshirig'i kelgach to'xtatildi. 20/20 o'tdi deb hisoblanmaydi. Stage 2 va yangi fokus regression'i redesign jarayonida yakunlanadi.

## Chegara

LLM/STT/TTS sifat yoki tezligi baholanmadi. Lokal API va worker mock provayderlarda ishladi. Haqiqiy ekran o'quvchi bilan audio tinglash bajarilmadi; klaviatura, semantika, fokus va avtomatik a11y tekshirildi.

Yangi ish rejasi: `docs/REDESIGN_PLAN.md`.
