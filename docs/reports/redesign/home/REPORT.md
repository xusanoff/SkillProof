# Bosh sahifa — redesign, 2026-11-06

## O'zgarishlar

User bergan tokenlar global CSS'ga ko'chirildi; mavjud semantic/shadcn nomlari alias sifatida saqlandi. Geist va Geist Mono Next font orqali lokal xizmat qiladi. `.dark` va `data-theme=dark` qo'llanadi. To'q kartalarda matn kontrasti uchun `accent` manbadagi `primary-hover` tokeniga bog'langan. Button minimum 44px; dark va signal variantlar qo'shildi. Logo kvadrat va laym tasdiq belgisiga almashtirildi.

Bosh sahifa: hero, qidiruv, mobilga ham ochilgan jarayon kartasi, to'rt qadam, ikki auditoriya kartasi, real yangi vakansiyalar va yakuniy tamoyil banneri. Header navigatsiyasi va barcha kengliklarda qidiruv paneli; to'q footer. Namuna kartasida shaxsiy ism, qotirilgan ball va dekorativ replay statistikasi yo'q. Mavjud tarjimalar va ariza/qidiruv API oqimlari saqlangan.

## Tekshirish

- Frontend: 49 fayl, 294 test o'tgan; lint va typecheck o'tgan.
- Docker production build o'tgan; faqat web konteyneri `--no-deps` bilan yangilangan.
- `frontend/scripts/review-home.mjs`: UZ/RU/EN × light/dark × 1440/390; skrinshotlar, font, overflow, konsol, axe va haqiqiy qidiruv/til almashtirish tekshiruvi. Yakuniy natijalar `checks.json` va `flows.json`da.
- Yakuniy 12/12 holat: overflow 0, yangi konsol xatolari 0, axe serious/critical 0; Geist va tema ranglari haqiqiy brauzerda tasdiqlangan.
- Desktop va mobil viewport skrinshotlari ko'rib chiqildi. Manba HTML layout talablari bilan solishtirildi; namuna kartasi API cheklovlariga mos jarayon tasviri.
- Mehmon uchun `/auth/me` va `/auth/refresh` 401 javoblari kutiladi va alohida qayd qilinadi.
- Bu hisobot to'liq HR/intervyu live suite o'tganini bildirmaydi. Ular tegishli ekranlar redesignida bajariladi.

## Dastlabki commit holati (tarixiy)

Commit urinishi `Author identity unknown` sabab to'xtadi: repo va global `user.name`/`user.email` sozlanmagan. Userdan ism/email so'ralgan; to'qima muallif qo'yilmadi. Poydevor fayllari alohida stage qilingan; layoutdagi oldingi `tabIndex` tuzatishi indexga qo'shilmagan. Push bajarilmadi.

## Keyingi ekran

User natijani ko'rgach vakansiyalar ro'yxati. Umumiy komponentlar kerakli ekranlar bilan kengaytiriladi; qolgan dizayn va barcha backend ishlari saqlangan.

Git muallifi keyinroq user tomonidan berildi va redesign alohida commitlarga yozildi. Hozirgi holat: `../REPORT.md`.
