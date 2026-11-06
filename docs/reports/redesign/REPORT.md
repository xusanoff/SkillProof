# SkillProof — barcha frontend ekranlarini yangi dizaynga o'tkazish

Sana: 2026-11-06.

## Scope

Userning eng so'nggi «hozir hammasini shu dizaynga o'tkaz» ko'rsatmasi bilan ekranlar orasida tasdiq kutish bekor qilindi. Original dizayn materiallari o'zgartirilmadi. Backend, API kontraktlari, bazalar va intervyu qoidalari o'zgartirilmadi.

| Ekranlar | Natija |
|---|---|
| Bosh sahifa | Geist, yangi logo/header/footer, hero va qidiruv, jarayon/auditoriya kartalari, real vakansiyalar, yakuniy tamoyil banneri. Mavjud bo'lmagan employers route o'rniga haqiqiy anchor va HR ro'yxatdan o'tish havolasi. |
| Vakansiyalar | Qidiruv paneli, alohida filtr kartasi, chiplar, kartalar, saralash va sahifalash. |
| Vakansiya detali | To'q hero va maosh, faktlar, ko'nikmalar/tavsif, ariza berish va to'rt qadamli timeline, kompaniya va o'xshash vakansiyalar. |
| Arizalar | Haqiqiy intervyu holatiga bog'langan banner/CTA, har arizada to'rt bo'lakli progress, mavjud amallar va qaytarib olish dialogi. |
| Nomzod natijalari | To'q ball paneli, SVG halqa, bosqichlar, ko'nikmalar, topshiriq va savollar, izohlar; kutish/xato/qayta ishlatilgan natijalar saqlangan. |
| HR | To'q sidebar va laym aktiv chiziq, kompaniya tanlash, oq topbar, hisob/til/tema/qidiruv, mobilga mos menyu. |
| HR nomzodlar | Haqiqiy server tartibi va pagination bo'yicha reyting jadvali, initsiallar, ball/shubha/tavsiya, hisobot havolalari. Batafsil ma'lumot va amallar qator ostidagi ochiladigan blokda. Faqat API bergan jami va joriy sahifa sonlari. |
| HR hisobot/replay | Ball kartalari, shubha signallari va dalillar, kuchli/zaif tomonlar, kod, suhbat javoblari, amallar/eslatmalar/tarix. To'q replay muharriri va haqiqiy eventlardan hisoblangan activity diagrammasi. |
| HR analitika | Davr, olti KPI, voronka, haqiqiy qo'shni bosqichlardan eng katta foizli pasayish, uchta o'rtacha ball ustuni, vakansiyalar jadvali. |
| Stage 1 | Alohida to'q header va bosqichlar, haqiqiy taymer, qoidalar lentasi, topshiriq/testlar kartasi va doim to'q Monaco muharriri. Run/Submit, draft, reconnect, fullscreen, paste va telemetriya handlerlari saqlangan. |
| Stage 2 | To'q xona, savol/javob va yon kod paneli, mavjud savol progressi, ovoz darajasiga bog'langan mikrofon orb'i, haqiqiy mikrofon indikatori va timer/ogohlantirishlar. Matn/audio, qayta eshitish, o'ylash va fallback amallari saqlangan. |
| Qolgan UI | Login/register/parol/email, profil/rezume/ko'nikmalar/saqlanganlar, sozlamalar, kompaniya/jamoa/taklif, vakansiya va assessment formalar, savol/topshiriq banklari, barcha admin sahifalari, qoidalar/tizim tekshiruvi/warm-up, bo'sh/xato/loading holatlar va dialoglar umumiy surface, tipografiya va control tizimiga moslangan. |

## Dizayn tizimi

- Original tokenlar, Geist va Geist Mono, 1240px public konteyner, 16px kartalar, 10px asosiy control radiusi.
- `components/common/design.tsx`: Card, Chip, Avatar, ProgressBar, ScoreRing, StatCard, StageStepper.
- Button/IconButton, input/select/label, tablar, dialog/popover stillari mavjud komponent tizimida saqlangan; yangi og'ir dependency yo'q.
- `.sp-dark` light/dark temadan mustaqil to'q panel tokenlarini beradi. Monaco ham ranglarni CSS tokenlardan oladi.
- HR/Admin `WorkspaceFrame` orqali umumiy qobiqdan foydalanadi; oddiy sayt chrome'i va mobil bottom nav bu qobiqlarda yashiriladi.
- Jamoa boshqaruvidagi ikonali amallarning to'liq accessible nomlari saqlangan.

## API cheklovlari

Obuna, soxta jonli transkript, kelgusi savollar, skip amali, taklif muddati, global #1 reyting va kompaniya bo'yicha mavjud bo'lmagan KPI qo'shilmadi. Nomzod bosqich progressi mavjud statusdan keladi; noaniq HR qarori test o'tgan deb talqin qilinmaydi. Replay ustunlari real eventlardan; tushish bloki real funnel sonlaridan hisoblanadi.

## Tekshirish

Yakuniy natijalar quyida qayd qilingan. Tekshiruvlar real lokal stack va alohida mock web instance'da o'tkaziladi; API/worker LLM/STT/TTS provayderlari `mock` ekani tekshirildi. Provayder sifati baholanmadi.

- Unit/component, lint, typecheck, production Docker build.
- Mock brauzer: auth/jamoa, vakansiya/ariza/saralash, report/override/eslatma, nomzod natijalari, uch til va mobil oqimlar.
- Live: assessment yaratish, haqiqiy Monaco/Run/Submit/internal paste, katta tashqi paste bloki, HR replay, text/voice Stage 2 va profil/skip-link regressionlari.
- `REDESIGN_REVIEW=1`: UZ/RU/EN × light/dark × 390/1440, public/candidate/HR/admin sahifalarining 48 sweep'i. Har sahifada font, i18n/runtime, overflow va axe serious/critical tekshiriladi; skrinshotlar `screens/`da.
- `REDESIGN_CAPTURE_ROOMS=1`: haqiqiy intervyu xonalarining skrinshotlari va axe/overflow tekshiruvi `rooms/`da. Kod yozish kichik ekranda mavjud tushunarli cheklovni saqlaydi.

## Yakuniy natijalar

- **294/294 unit/component**, 49 fayl; lint va typecheck o'tgan.
- **38/38 mock brauzer testi** o'tgan, shu jumladan yangi HR jadvalidan tafsilotni ochish, saralash va report/override/eslatma oqimlari.
- **20/20 live test** o'tgan: assessment, Stage 1, replay, tashqi paste bloki, 360px/1440px public/candidate/HR/admin, fokus/locale/profil, text va voice Stage 2.
- **48/48 vizual sweep** qamrab olingan (asosiy matrix va ikki HR qayta tekshiruvi orqali). Birinchi 56-testli run 50 passed / 4 failed / 2 not run bo'lgan; buni bir urinishda 56 passed deb talqin qilmaslik kerak. Dastlabki xatolar screenshot helper fullscreen resize'i, parallel runlarning umumiy artifact papkasi, lokal web qayta yaratilgandagi ulanish uzilishi va eski Onest assertion'i edi. Tegishli testlar tuzatilib, qayta o'tgan.
- **768px RU-dark planshet**: 4/4 public/candidate/admin/HR sweep o'tgan.
- Monaco va replay shriftini yakuniy tekshirish: **3/3 live test**, DOM'da Geist Mono tasdiqlangan; code/Run/Submit/paste/replay tekshiruvlari ham qayta o'tgan.
- Production Docker build o'tgan; oxirgi web image lokal `localhost:3000`da ishga tushirilgan. API/worker o'zgartirilmagan. Vaqtinchalik mock web instance tekshiruvdan keyin to'xtatilgan.
- HR reytingi va ovozli xona viewport skrinshotlari vizual ko'rib chiqildi. Mobil, dark va uch tildagi barcha skrinshotlar `screens/` va `rooms/`da. Sonlar va runlar: `validation.json`; yakuniy qisqa log: `validation.log`.
- Real ekran o'quvchi audiosi baholanmagan; klaviatura, semantika/fokus va axe tekshirilgan. LLM/STT/TTS sifati scope'dan tashqarida qoldi.

## Saqlash

Oldingi uncommitted backend, tarjima, AI-budget va deploy ishlari saqlandi. User bergan Git muallifi faqat shu repo uchun sozlandi. Redesign alohida commitlarga ajratildi: poydevor `247cde9`, UI `5fda6ac`, testlar va hisobot alohida commit. Push qilinmadi.

Commitda to'rtta asosiy viewport skrinshoti saqlangan: HR nomzodlar, Stage 1, ovozli Stage 2 va HR replay. To'liq 491 sahifa va 24 xona skrinshoti lokal `screens/` va `rooms/` papkalarida saqlanadi; ularni review skriptlari bilan qayta yaratish mumkin. Katta generatsiya qilingan skrinshot to'plami Git commitiga qo'shilmadi.
