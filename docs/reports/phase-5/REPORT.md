# Phase 5 hisoboti: Stage 1 baholash, integrity signallari, gate, replay

**Sana:** 2026-11-02 · **Holat:** tayyor ✅ (code review hozircha mock LLM'da)

## Qabul sharti (spec §10, Phase 5)
| Shart | Natija |
|---|---|
| Simulyatsiya qilingan xatti-harakatlar to'g'ri signal beradi (idle start, burst after idle, robotic typing, linear writing, focus loss) | ✅ `tests/test_integrity_signals.py`; halol sessiyada signal chiqmasligi ham tekshirilgan |
| HR sessiyani replay qila oladi | ✅ Jonli e2e: replay oxirida Monaco matni `final_code` ga aynan teng, til almashish, ichki paste, undo/redo va reload bilan |

## Nima qilindi
- **Baholash:** Stage 1 tugagach arq job (15 s sweep) yashirin testlar va `code_reviewer` ni ishga tushiradi. Ball: 70% yashirin testlar + 30% code review, chegara 70%. Natija: `stage2_pending` yoki `stage1_failed`.
- **Signallar va suspicion:** qoidalar, vaznlar va `evidence`: `docs/INTEGRITY.md`.
- **Guardrail'lar:** rubrika kalitlari, ball oralig'i, keltirilgan kod qatorlari, til. Past ishonchda ikkinchi baholash, kelishmovchilikda `needs_review`. Evaluator ism, email va namunaviy yechimni olmaydi.
- **Prompt injection:** kod izohidagi evaluator uchun buyruqlar (uz/ru/en) model ko'rishidan oldin olib tashlanadi va `high` signal yaratadi.
- **Nosozliklar:** sandbox ishlamasa qayta uriniladi (5 marta, keyin `failed`, HR ko'radi). LLM yaroqli natija bermasa, nomzod yiqitilmaydi: vaqtincha ballni yashirin testlar hal qiladi, `needs_review` qo'yiladi.
- **Nomzod ekrani:** ball, chegara, yashirin testlar soni, kuchli va zaif tomonlar. Suspicion va yashirin test nomlari ko'rsatilmaydi.
- **HR:** `/hr/candidates/{id}/stage1` hisoboti va replay player (1×–8×, timeline belgilari, klaviatura).
- **Tasdiqlangan tavsiyalar:** ixcham intervyu xonasi, tilda versiya yorlig'i (masalan, Python 3.8).
- Qarorlar: D-086…D-090 (backend), D-048…D-053 (frontend).

## Topilgan va tuzatilgan bug
**Reload'da hodisalar yo'qolishi (D-090).** Yopilayotgan sahifaning oxirgi hodisalari serverga yangi sahifadan keyin yetib borsa, `seq` to'qnashib, yangi hodisalar dublikat sifatida tashlanardi va replay yakuniy koddan farq qilardi. Bu 5 yugurishdan birida chiqdi. Endi har sahifaga server raqam beradi, sahifalar to'qnashmaydi va yuklanish tartibida saralanadi. Poyganing o'zi uchun alohida backend testi bor.

## Testlar
| | Natija |
|---|---|
| Backend pytest | **134/134** ✅ (59 tasi Phase 4–5 da qo'shilgan) |
| ruff + mypy strict | toza ✅ |
| Migratsiyalar | `upgrade`, `alembic check`, `downgrade -3`, qayta `upgrade` toza bazada ✅ |
| `ai-eval --fast` | yiqilgan holat yo'q ✅ (modelni sinaydigan holatlar mock'da o'tkazib yuboriladi) |
| Frontend lint / typecheck / build | toza ✅ |
| Frontend Vitest | **174/174** ✅ |
| Playwright, jonli stack | **4/4, ketma-ket 12 yugurish, 12/12** ✅ (tuzatishdan oldin 5 tadan 3 tasi o'tgan) |
| Playwright, mock API | **28/28** ✅ |
| Jonli worker | sessiyalar avtomatik baholandi: 94% → `stage2_pending`; tashqi paste → suspicion 100 ✅ |

**Brauzerda sinalmagan, faqat unit testlarda:** `needs_review`, `failed` va `pending` holatlarining HR ekrani, faolsizlik diskvalifikatsiyasi, tarmoq uzilib qayta ulanish.

## Skrinshotlar
`img/` da 6 ta kadr: ixcham xona, natija (o'tgan va o'tmagan), HR hisoboti, replay belgilari bilan, diskvalifikatsiya hisoboti.

## Ma'lum cheklovlar
1. **LLM mock'da.** Code review ballari haqiqiy emas, baholash sifati o'lchanmagan. Boshqacha so'zlar bilan yozilgan injection faqat modelga tayanadi va hali sinalmagan.
2. **Suspicion vazn va chegaralari taxminiy**, real nomzodlarda kalibrlanmagan (`docs/INTEGRITY.md`).
3. **Reload oldidagi matn:** oxirgi ~5 soniyada yozilgan kod editorga qaytmasligi mumkin (draft har 5 s da saqlanadi). Replay buzilmaydi.
4. **Ball oshib ketishi mumkin:** LLM ishlamasa, ball faqat yashirin testlardan olinadi. HR'ga `needs_review` ko'rsatiladi.
5. **Qilinmagan:** warm-up bilan uslub taqqoslash (warm-up yozib olinmaydi, D-086), HR'ning diskvalifikatsiyani tiklashi (Phase 7, D-089).
6. Soxta mijoz `editor_reset` orqali kod kiritishi mumkin. Oddiy brauzerda bu yo'l yo'q (`docs/INTEGRITY.md`).

## Ochiq savollar
1. LLM provayder qaysi bo'ladi? Phase 6 (ovozli intervyu) dan oldin kerak, STT va TTS ham shu jumladan.
