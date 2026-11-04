# Phase 6 hisoboti: Stage 2, og'zaki AI intervyu

**Sana:** 2026-11-02 · **Holat:** mock provayderlar va matnli rejimda tayyor ✅ · haqiqiy provayder bilan sinov kutilmoqda ⏳

## Qabul sharti (spec §10, Phase 6)
| Shart | Natija |
|---|---|
| To'liq Stage 2 mock provayderlarda ishlaydi | ✅ Jonli e2e: ovozli rejim (Chromium soxta mikrofoni, transkript qutisi) boshidan oxirigacha |
| To'liq Stage 2 matnli rejimda ishlaydi | ✅ Jonli e2e |
| Qayta ulanish ishlaydi | ✅ Reload'da o'sha savol qaytadi; uzilish vaqti hisoblagichlarga kirmaydi |
| Intervyuer javobni aytmaydi, "javobni ayt" so'rovini rad etadi, mavzudan chiqmaydi | ✅ Kod darajasida tekshiriladi, testlar bor; haqiqiy LLM bilan o'lchanmagan |
| Kamida bitta haqiqiy provayder bilan ishlaydi | ⏳ **Ochiq.** Spec bo'yicha provayder ulangandan keyin tekshiriladi |

## Nima qilindi
- **Holat mashinasi** (`app/ai/interviewer.py`): avval nomzodning o'z kodi bo'yicha savollar (kamida 2 ta), keyin majburiy savollar, keyin ko'nikma vazniga mos savollar. Qo'shimcha savol: bitta savolga ko'pi bilan 1 ta, jami 4 ta. Qiyinlik javob balliga qarab o'zgaradi.
- **Prompt va filtr:** `interviewer.v1`, `answer_evaluator.v1`. Kod savolda javob, baho, taqiqlangan mavzu, ortiqcha uzunlik, boshqa til va mavzudan chetlashishni tekshiradi. Bir marta qayta uriniladi, bo'lmasa tayyor shablon ishlatiladi yoki qo'shimcha savol tashlab ketiladi.
- **Bank savollari** LLM'siz, aynan yozilgan holida o'qiladi (D-093).
- **Vaqt:** savol o'qib bo'lingach hisoblagichlar boshlanadi. 60 s da ogohlantirish va ovozli signal, 90 s da diskvalifikatsiya. "O'ylab olay" tugmasi savolga bir marta vaqtni yangilaydi. Javob va sessiya limitlari ishlaydi.
- **Ovoz:** yozib olish, oddiy VAD, savolni eshittirish, audio saqlash, haqiqiy mikrofon testi. Ovoz ishlamasa matnga bir tomonlama o'tiladi va HR buni ko'radi.
- **Stage 2 signallari:** `docs/INTEGRITY.md`.
- **Seed:** "Python dasturchi (intervyu namunasi)" vakansiyasi, tayyor assessment bilan.
- Qarorlar: D-091…D-096 (backend), D-100…D-103 (frontend).

## Topilgan va tuzatilgan buglar
1. **Birinchi savolda hisoblagich boshlanmas edi.** Matnli rejimda xona ochilganda `question_played` socket tayyor bo'lmasdan yuborilib, yo'qolardi. Ogohlantirish 60 s o'rniga taxminan 120 s da chiqardi. Agent buni "ehtimol shunday mo'ljallangan" deb yozgan edi. E2e'da avval xatoni qayta hosil qildim, keyin tuzatdim.
2. **LLM ishlamasa intervyu to'xtab qolardi.** Endi shablon savol bilan davom etadi.
3. **Test to'plami login limitiga urilardi** (daqiqasiga 10 ta), 4 yugurishdan 2 tasi `429` bilan yiqildi. Bu mahsulot xatosi emas edi. Limit o'zgartirilmadi, testlardagi login kutib qayta urinadi.
4. **Ruscha "выбор" taqiqlangan mavzu sanalardi** ("saylov" ma'nosida), oddiy "tanlov" haqidagi savollar ham rad etilardi. Tuzatildi.

## Testlar
| | Natija |
|---|---|
| Backend pytest | **186/186** ✅ (52 tasi yangi) |
| ruff + mypy strict | toza ✅ |
| Migratsiya | `upgrade`, `alembic check`, `downgrade -1`, qayta `upgrade` toza bazada ✅ |
| `ai-eval --fast` (mock) | fail yo'q; model sifatini o'lchaydigan keyslar o'tkazib yuborildi ⏭️ |
| Frontend lint, typecheck, build | toza ✅ |
| Vitest | **221/221** ✅ |
| Jonli e2e | **6/6, ketma-ket 6 marta** ✅ (login tuzatilgandan keyin) |
| Mock e2e | **28/28** ✅ |
| Skrinshotlar | `img/` da 9 ta; 04 va 07 ko'zdan kechirildi |

## Ishga tushirish va qo'lda sinash
1. `make up && make seed`
2. `demo.candidate@example.com` bilan kiring (parol `make seed` chiqishida).
3. "Python dasturchi (intervyu namunasi)" vakansiyasiga ariza bering va Stage 1 ni o'ting.
4. Taxminan 15 soniyadan keyin natija chiqadi. "2-bosqichga o'tish" tugmasini bosing, mikrofonni sinang va suhbatni boshlang.
5. Mock STT eshitmaydi: aytgan gapingizni belgilangan qutiga yozing.
6. Sinab ko'ring: sahifani qayta yuklash, 60 s jim turish, "O'ylab olay", matnga o'tish, "javobni ayt" deb yozish.

## Tekshirilmagan
- **Haqiqiy LLM, STT va TTS:** savol va baho sifati umuman o'lchanmagan. O'zbek tilidagi STT asosiy xavf bo'lib qolmoqda.
- **Haqiqiy mikrofon:** faqat Chromium soxta qurilmasida sinalgan. VAD chegarasi real muhitda, shovqinda tekshirilmagan.
- **Safari va mp4 yozuv:** faqat unit test.
- **Faqat backend testlarida:** 90 s diskvalifikatsiya, sessiya vaqti tugashi, uzoq uzilish (`abandoned`). Brauzerda sinalmagan.

## Cheklovlar
- Ovozli signal va harakatsizlik brauzerdan keladi: o'zgartirilgan klient ularni soxtalashtirishi mumkin.
- `reading_style` va sukunat chegaralari real intervyularda kalibrlanmagan.
- "Let me think" ovozdan aniqlanmaydi, tugma orqali ishlaydi (D-094).
- Savol tugaganidan keyin 1,5 s ichida reload qilinsa, savol qayta eshittiriladi. Zararsiz, lekin ko'rinadi.
- Stage 2 xonasida to'liq ekranga o'tish so'ralmaydi, chiqish faqat qayd etiladi.
- Mock STT production'da yoqilib qolmasligi kerak: u nomzod yozgan matnni qabul qiladi. Tekshiruv Phase 10 ga qoldirilgan.
- HR hozircha Stage 2 natijasini ko'ra olmaydi va ariza `stage2_in_progress` da qoladi: baholash va HR sahifalari Phase 7 da.

## Ochiq savollar
1. Qaysi LLM, STT va TTS provayderlarini ulaymiz?
2. Phase 6 ni commit qilaymi?
