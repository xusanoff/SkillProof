# AI sarf limitlari — 2026-11-06

## Qilingan ish
- Stage 1, Stage 2 va yakuniy hisobotga ariza bo'yicha bitta umumiy byudjet.
- Token rezervi: 1 000 000; STT rezervi: 1800 soniya; TTS rezervi: 30 000 belgi. Global admin chegaralari yoki `THRESHOLDS__BUDGET__...` bilan o'zgaradi. Assessment uchun API orqali `stage1_config.budget` beriladi; oddiy frontend tahriri uni saqlab qoladi.
- Bazadagi atomik hisoblagich parallel so'rovlarda limitdan oshmaydi; qayta ulanish va worker qayta ishga tushishi uni nolga tushirmaydi. Ariza o'chirilsa hisoblagich ham o'chadi.
- Rezerv so'rovdan oldin olinadi, qayta urinishlar va TTS model almashtirishlari hisoblanadi. PCM uzunligi serverda o'lchanadi. Xato yoki timeout uchun rezerv qaytarilmaydi; haqiqiy sarf hisoboti alohida qoladi.
- Limit tugashi avtomatik diskvalifikatsiya qilmaydi. Mavjud provider-failure yo'llari va HR tekshiruvi ishlaydi: Stage 1 yashirin testlar natijasini saqlaydi, Stage 2 tayyor savollar va ekrandagi matndan foydalanadi, STT ishlamasa javob HR ko'rib chiqishi uchun belgilanadi.
- Migratsiya: `b91a42c8d013` (`ai_budgets`). Ishlayotgan bazaga `make migrate` orqali yoki API ishga tushishidagi migratsiya orqali qo'llanadi.

## Sinovlar
- Backend: 363 passed, 2 skipped. Yangi testlar: parallel rezervlar, saqlanib qolish, LLM chaqiruvini oldindan to'xtatish, Stage 1 deterministik natija va HR review, dekodlangan audio uzunligi, TTS keyingi modelini bloklash, sozlamalar validatsiyasi.
- Backend ruff va mypy o'tdi.
- Migratsiya alohida vaqtinchalik bazada: upgrade, alembic check, downgrade va qayta upgrade o'tdi. Vaqtinchalik baza o'chirildi.
- Frontend: 294 unit/component test o'tdi; lint va typecheck o'tdi.
- Production build `pnpm -s build --webpack` bilan o'tdi. Oddiy Turbopack build muhit cheklovi sabab port ocha olmadi.

## Chegaralar va keyingi ishlar
- Bu rezerv bo'yicha xarajat cheklovi; provayder tokenizeriga asoslangan billing kafolati emas. LLM uchun UTF-8 baytlari, schema va maksimal javobdan konservativ hisob olinadi.
- Assessment limitlari uchun alohida frontend maydonlari qo'shilmadi: per-assessment sozlash API orqali, global sozlash admin panelida mavjud.
- LLM/STT/TTS sifati va tezligi, audio heuristikalar foydalanuvchi qarori bilan keyinga qoldirildi. Haqiqiy provayderga baholash chaqiruvi qilinmadi.
- `.env`da SMTP, Telegram va domen sozlamalari berilmagan; `.env.production` mavjud emas. Haqiqiy xabar yuborish va ommaviy deploy bajarilmadi.
- To'liq qo'lda tarjima, ekran o'quvchi va qolgan UI tekshiruvlari alohida vazifa sifatida qoladi.
