# Phase 8 hisoboti: tasdiqlangan ko'nikmalar

**Sana:** 2026-11-03 · **Holat:** mock LLM bilan tayyor ✅ · haqiqiy LLM bilan sinov kutilmoqda ⏳

## Qabul sharti (spec §10, Phase 8)
| Shart | Natija |
|---|---|
| Ikkinchi ariza birinchi natijani qayta ishlatadi | ✅ Haqiqiy API va worker bilan: 2 ta topshiriqdan 1 tasi, 8 ta savoldan 4 tasi o'tkazib yuborildi |
| HR nomzodlarni tasdiqlangan ko'nikma bo'yicha topadi | ✅ Haqiqiy API va brauzerda (skrinshot 05) |

## Nima qilindi
- **Tasdiqlangan ko'nikma:** ikkala bosqichdan toza o'tgan nomzodda ko'nikma bo'yicha yozuv paydo bo'ladi: ball, daraja, 365 kunlik muddat.
- **Qayta foydalanish:** keyingi arizada nomzod qoidalar ekranida tanlaydi. Tanlasa, tasdiqlangan ko'nikmalar bo'yicha topshiriq va savollar o'tkazib yuboriladi, bosqich bali eski va yangi natijadan hisoblanadi.
- **HR uchun:** "Iste'dod qidiruvi" sahifasi (ko'nikmalar, minimal ball), hisobotda qaysi ko'nikma qayta ishlatilgani belgilanadi.
- **Nomzod uchun:** "Tasdiqlangan ko'nikmalar" sahifasi, har bir ko'nikma uchun ochiq/yopiq tugmasi, login talab qilmaydigan ochiq profil.
- Qarorlar: D-130…D-133 (backend), D-140…D-144 (frontend).

## Qoidalar
- Ko'nikma standart holatda yopiq, nomzod o'zi ochadi. Yopiq ko'nikma HR qidiruvida ham chiqmaydi.
- HR override tasdiqlangan ko'nikma bermaydi. Diskvalifikatsiyasi bekor qilingan, `needs_review` belgisi bor yoki shubhasi yuqori arizalar ham bermaydi.
- Ko'nikma 60% dan past bo'lsa tasdiqlanmaydi. Daraja: 70% dan o'rta, 85% dan yuqori.
- Kodlash topshirig'i faqat kodlash bali bilan, savol faqat og'zaki bal bilan o'tkaziladi. Bal shu vakansiyaning o'tish chegarasidan past bo'lsa, taklif qilinmaydi.
- HR majburiy deb belgilagan savollar baribir so'raladi.
- HR va ochiq profil natija qaysi kompaniyadan kelganini ko'rmaydi.

## Tekshiruvlar
| Tekshiruv | Natija |
|---|---|
| Backend | 237 ta test o'tdi, ruff va mypy toza |
| Frontend | 272 ta test o'tdi, lint, typecheck va build toza |
| Mock e2e | Oxirgi kodda 4 ta to'liq yugurish: 3 tasida 38/38, bittasida 37/38 |
| Jonli e2e | 6 tasi ham o'tdi. Ular Phase 7 gacha bo'lgan oqimni tekshiradi, qayta foydalanish ularda yo'q |
| To'liq oqim (bir martalik skript) | Birinchi ariza → ko'nikma → ikkinchi ariza → ochiq profil → HR qidiruvi: ishladi |

Haqiqiy oqim ikkita xatoni ko'rsatdi, ikkalasi tuzatildi:
- Profilini hali ochmagan nomzod HR qidiruvida chiqmas edi. Test qo'shildi.
- Eski demo vakansiya topshirig'ida ko'nikma yo'q edi, shuning uchun u qayta ishlatilmas edi. `make seed` endi buni to'g'rilaydi.

## Ochiq qolganlar
- **Beqaror test:** `e2e/auth.spec.ts:279` (bosh sahifa qidiruvi) ba'zan yiqiladi: bir marta to'liq yugurishda, bir marta 8 ta takrorlashda. Keyingi 70 ta takrorlashda yiqilmadi, xato matni yozib olinmadi, sababi noma'lum. Taxmin: forma React yuklanishidan oldin to'ldirilsa, matn yo'qoladi. Bu tekshirilmagan. Agar to'g'ri bo'lsa, bu sekin internetdagi haqiqiy foydalanuvchiga ham ta'sir qiladi. Phase 8 kodi bu formaga tegmagan.
- **Haqiqiy LLM:** ballar hali mock'dan. Tasdiqlangan ko'nikma ballari ham shunga bog'liq, shuning uchun ularning sifati tekshirilmagan.
- **Qayta foydalanish tanlovi brauzerda:** faqat mock e2e bilan tekshirilgan. Haqiqiy stack'da API orqali tekshirilgan, brauzerda emas. Barcha savol va topshiriq yopilgan holat esa faqat pytest va mock e2e'da bor.
- **Sahifa yangilansa:** Stage 2 to'liq yopilgan bo'lsa ham, yangilangandan keyin mikrofon testi chiqishi mumkin. Boshlangach darhol yakuniy ekran ochiladi.
- **Eski natijalar:** Phase 8 dan oldin tugagan arizalar ko'nikma bermaydi, chunki hisobot qayta yozilmaydi.
- **`needs_review`:** bunday ariza HR ko'rib chiqqandan keyin ham ko'nikma bermaydi.
- **Natija almashganda:** yangi natija faqat bitta bosqichni o'lchagan bo'lsa, ikkinchi bosqich bali yo'qoladi. Keyingi arizada o'sha bosqichni qayta topshirish kerak bo'ladi.

## Skrinshotlar
- [Nomzod ko'nikmalari](img/01-candidate-skills-uz-desktop.png)
- [Ochiq profil](img/02-public-profile-uz-desktop.png)
- [Nomzod ko'nikmalari, telefon](img/03-candidate-skills-uz-mobile.png)
- [Qidiruv, bo'sh holat](img/04-hr-talent-empty-uz-desktop.png)
- [Qidiruv natijalari](img/05-hr-talent-results-uz-desktop.png)
- [Qidiruv natijalari, telefon](img/06-hr-talent-results-uz-mobile.png)

Skrinshotlardan faqat 03 va 05 ni ko'rib chiqdim.

## Qo'lda sinash
`make up && make seed`, parol hamma uchun `Demo-parol-2026`.
1. `jasur.demo@example.com` bilan kirib, `/uz/candidate/skills` sahifasini oching. Bu hisob faqat hozirgi dev bazada bor.
2. `demo.hr@example.com` bilan `/uz/hr/talent` sahifasida Python yoki FastAPI bo'yicha qidiring.
3. Qayta foydalanish tanlovini ko'rish: yangi nomzod bilan "Python dasturchi (intervyu namunasi)" vakansiyasini tugating, so'ng "Backend dasturchi (qayta foydalanish namunasi)" ga ariza bering.

## Savollar
1. Qaysi LLM, STT va TTS provayderlarini ulaymiz?
2. Phase 6, 7 va 8 ni commit qilaymi?
3. HR topilgan nomzod bilan qanday bog'lansin? Hozir qidiruvda aloqa ma'lumoti yo'q.
4. Ko'nikmalar standart holatda yopiq qolsinmi? Unda nomzod ochmaguncha HR uni topa olmaydi.
5. Muddat 365 kun, tasdiqlash chegarasi 60%. To'g'rimi?
