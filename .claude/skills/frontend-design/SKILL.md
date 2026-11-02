---
name: frontend-design
description: Vizual uslub, kompozitsiya va "shablon" ko'rinishdan qochish qoidalari. SkillProof frontend'ida (job board, nomzod interview ekranlari, HR dashboard, admin) har qanday sahifa yoki komponentni yaratish yoki qayta dizayn qilishda ishlat. Doim yuklanadi.
---

# Frontend dizayn (SkillProof)

no-code-mvp'dagi `frontend-design` skill'i asosida, SkillProof uchun moslangan.
Maqsad: har ekran "AI yasagan shablon" emas, ataylab o'ylangan dizayn bo'lsin.

Uch xil dizayn ishi bor:
- **Job board (ochiq qism)** — guest/nomzod: vakansiya qidirish, kompaniya sahifasi. Telefonda ham, kompyuterda ham. Kontent birinchi: lavozim, kompaniya, maosh, shahar.
- **Interview xonasi** (Stage 1 editor, Stage 2 ovozli suhbat) — kompyuter, fullscreen. Tinch, chalg'itmaydigan, yuqori kontrast. Taymer, ogohlantirish va qoidalar har doim aniq ko'rinadi. Bu yerda bezak yo'q.
- **HR / admin xromi** — zich, neytral, ma'lumot jadvallari. Asosiy narsa: reyting, ball, shubha foizi va dalillar.

## 1. Avval mavzu, keyin piksel
Kod yozishdan oldin uchta savolga javob ber:
- **Kim ishlatadi?** Guest/nomzod (ko'pincha telefonda), interviewdagi nomzod (kompyuter, stressda), HR (kompyuter, ko'p nomzodni tez solishtiradi).
- **Asosiy vazifa nima?** Board = mos vakansiyani topish va ariza berish. Interview = vazifaga diqqat. HR = eng yaxshi nomzodni dalil bilan tanlash.
- **Nima xarakterli?** Board'da — vakansiya kartochkasi (lavozim + maosh + kompaniya), HR'da — nomzodning bali va shubha darajasi dalillari bilan. Ekranni shular bilan och, marketing raqamlari bilan emas.

## 2. Reja (katta ekran yoki yangi sahifa uchun majburiy)
1. Ranglar: design-system tokenlari va ularning roli (fon, sirt, matn, aksent, xavf, ogohlantirish). Yangi hex kiritma.
2. Tipografiya rollari: sarlavha, matn, ball/foiz, maosh, yorliq. Ko'pi bilan 2 shrift oilasi (+ editor uchun monospace).
3. ASCII wireframe: telefon (360px) va kompyuter (1280px).
4. 2–3 printsip (masalan: "maosh har doim ko'rinadi", "shubha foizi dalilsiz ko'rsatilmaydi").

Keyin rejani qayta o'qi: qaysi qismi "standart default"ga o'xshaydi? Shuni o'zgartir.

```
┌──────────────────────┐
│ SkillProof   [uz▾]   │  ← sticky header
│ [ Qidiruv........ 🔍]│
│ [Toshkent][Remote].. │  ← filtr chiplar, gorizontal scroll
│ ┌──────────────────┐ │
│ │ Backend dasturchi│ │  ← lavozim — eng qalin
│ │ Acme · Toshkent  │ │
│ │ 12–18 mln so'm   │ │  ← maosh tabular-nums
│ │ [Python][FastAPI]│ │
│ └──────────────────┘ │
└──────────────────────┘
```

## 3. Tipografiya
- Bitta sarlavha va bitta matn shrifti (yoki bitta oila). Lotin + kirill ikkalasini qo'llasin (uz, ru, en).
- Aniq o'lcham shkalasi (design-system tokenlari). Tasodifiy `text-[17px]` yozma.
- Ball, foiz, maosh, taymer — `tabular-nums`.
- Matn qatori ~80 belgidan uzun emas (`max-w-prose`) — vakansiya tavsifi, qoidalar sahifasi.
- Monospace faqat kod uchun (Monaco, kod parchalari), yorliqlar uchun emas.

## 4. Tuzilma va kompozitsiya
- Chegara, yorliq va raqamlash ma'lumot beradi; bezak uchun qo'yilmaydi.
- Raqamli markerlar faqat haqiqiy ketma-ketlikda: qoidalar → tizim tekshiruvi → warm-up → Stage 1 → Stage 2.
- Bir ekranda bitta asosiy harakat (primary): "Ariza berish", "Qoidalarni qabul qilaman", "Yuborish".
- Bo'sh joy guruhlaydi: bog'liq elementlar yaqin, bo'limlar orasida keng.

## 5. Harakat
- Animatsiya kam va ma'noli. Interview xonasida deyarli yo'q (faqat ogohlantirish/taymer holat o'zgarishi).
- Barcha animatsiya `ui-motion` skill'i orqali.

## 6. Matn (copy)
- Foydalanuvchi nuqtai nazaridan, faol nisbatda: "Ariza berish", "Testlarni ishga tushirish".
- Bir harakat hamma joyda bir xil nomlanadi.
- Xato xabari nima bo'lganini va qanday tuzatishni aytadi: "Fayl 5 MB dan katta. Kichikroq PDF tanlang."
- Nomzodga natija va xatolar — muloyim, konstruktiv (spec 6.5). Diskvalifikatsiya — qabul qilingan qoidaga havola bilan, neytral.
- Matnlar faqat i18n kalitlari orqali (`i18n` skill).

## 7. Qochiladigan default'lar
- Bir xil yumaloq oq kartochkalar + gradient fon (SaaS shablon).
- Krem fon + terrakota aksent; deyarli qora fon + kislotali yashil aksent.
- Hammasi katta harfli kichik "eyebrow" yorliqlar.
- `·` bilan ajratilgan uzun meta qatorlar, "SO'Z — fragment" yorliqlari.
- Ma'lumot yorliqlari uchun monospace, har havola oxiriga `→`.
- Hero'da "katta raqam + kichik yorliq + gradient" formulasi ("10 000+ nomzod").

```tsx
// ❌ Shablon: gradient, eyebrow, statistik hero
<section className="bg-gradient-to-br from-purple-500 to-pink-500 p-8 rounded-3xl">
  <p className="text-xs uppercase tracking-widest">AI HIRING</p>
  <h1 className="text-6xl">10 000+</h1>
</section>

// ✅ Vazifa birinchi: qidiruv va vakansiyalar, tokenlar orqali
<section className="bg-bg text-fg">
  <h1 className="text-title">{t('home.title')}</h1>
  <VacancySearch className="mt-4" />
</section>
```

## 8. Sifat chegarasi (har doim)
- Telefon (360px) va kompyuter (1280px) ishlaydi; interview xonasi — kompyuter (telefonda tushunarli xabar).
- Ko'rinadigan fokus, yetarli kontrast, `prefers-reduced-motion`.
- Light va dark ikkalasida tekshirilgan.
- Tugatishdan oldin o'z ishingni tanqid qil va kamida bitta ortiqcha elementni olib tashla.
