# Phase 7 hisoboti: baholash, hisobotlar, HR paneli, nomzod natijalari

**Sana:** 2026-11-03 · **Holat:** mock LLM bilan tayyor ✅ · haqiqiy LLM bilan sinov kutilmoqda ⏳

## Qabul sharti (spec §10, Phase 7)
| Shart | Natija |
|---|---|
| HR izohli, tartiblangan ro'yxatni shubha darajasi bilan ko'radi | ✅ Jonli stack'da, demo nomzodlar real API orqali o'tkazildi |
| Nomzod natijalari va xatolarini ko'radi | ✅ Jonli e2e |
| Double-check, `needs_review`, bias va prompt-injection testlari | ✅ Testlar bor. Baholash sifati mock'da tekshirilmaydi |
| Golden dataset barcha baholovchi rollarni qamraydi | ✅ 28 ta holat: mock'da 20 tasi o'tdi, 8 tasi o'tkazib yuborildi (faqat haqiqiy provayder uchun) |
| Promptlar haqiqiy modelda ishlaydi | ⏳ **Ochiq.** `make ai-eval` provayder ulangach ishga tushiriladi |

## Nima qilindi
- **Yakuniy baholash:** Stage 2 tugagach worker har bir javobni baholaydi. Ishonch past bo'lsa ikkinchi baholash, farq katta bo'lsa `needs_review`. MCQ LLM'siz.
- **Hisobot:** `report_writer.v1`, `feedback_writer.v1`. Iqtiboslar va kod qatorlari kod bilan tekshiriladi. Nomzod matnida javob yoki yashirin test qiymati chiqsa, matn rad etiladi.
- **Tavsiya:** model taklif qiladi, kod uni ball oralig'idan bir pog'onadan ortiq uzoqlashtirmaydi.
- **HR:** reyting va "o'tmagan / chetlatilgan" tablari, minimal ball filtri, to'liq hisobot sahifasi (spec §8 tartibida), override tarixi bilan, yopiq eslatmalar, ishga olish, javob audiosi.
- **Nomzod:** ballar, topshiriqlar, xatolar, "keyin nimani o'rganish kerak". Shubha ma'lumoti ko'rsatilmaydi, faqat diskvalifikatsiya sababi neytral so'zlar bilan.
- Qarorlar: D-110…D-117 (backend), D-120…D-125 (frontend).

## Testlar
| Tekshiruv | Natija |
|---|---|
| Backend pytest | 224 passed; ruff va mypy toza |
| Frontend unit/component | 252 passed; lint, typecheck, build toza |
| Mock e2e | 32 passed. **1 marta 1 ta test yiqildi**, qaysi test ekani yozib olinmadi; keyingi 4 yugurishda (bittasi yangi server bilan) takrorlanmadi |
| Jonli e2e | 6 passed, jumladan intervyu → worker → nomzod natijalari |

## Ma'lum cheklovlar
- Hamma natija mock LLM bilan olingan: ballar javob uzunligiga qarab chiqadi, baholash sifati haqida hech narsa aytmaydi.
- Audio va transkript sinxron emas: har bir javobga alohida pleyer va matn.
- Mock e2e'dagi bir martalik yiqilish sababi noma'lum.

## Qo'lda tekshirish
`make up && make seed`, keyin `demo.hr@example.com` / `Demo-parol-2026` bilan `/uz/hr/candidates`. Skrinshotlar: `img/`.

## Ochiq savollar
1. Qaysi LLM, STT va TTS provayderlarini ulaymiz?
2. Phase 6 va Phase 7 ni commit qilaymi? Ikkalasi ham hozir commit qilinmagan.
3. Umumiy ball 50/50 va 2-bosqich o'tish chegarasi 60%: shu qiymatlar to'g'rimi?
