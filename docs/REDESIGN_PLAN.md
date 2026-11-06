# SkillProof — yangi dizaynni joriy etish rejasi

Holat: userning «hozir hammasini shu dizaynga o'tkaz» ko'rsatmasiga muvofiq barcha mavjud UI ekranlari yangi dizaynga o'tkazildi. Yakuniy implementatsiya va tekshiruvlar: `docs/reports/redesign/REPORT.md`. Ekranlar orasida tasdiq kutish bekor qilingan; qolgan matn dastlabki implementatsiya rejasi sifatida saqlandi.

## Manbalar va ustuvorlik

- `skillproof-redesign/design-tokens.css`: vizual qiymatlarning yagona manbai.
- `skillproof-redesign/screens/01..10-*.html`: ekranlar joylashuvi va komponentlar.
- `SkillProof — yangi dizayn.html`: o'nta ekran va shriftlarni o'z ichiga olgan yig'ma maket; manifestida shu o'nta ekran borligi tekshirildi.
- Amaldagi biznes-mantiq, API kontraktlari va intervyu qoidalari saqlanadi. Maketdagi matnlar mavjud UZ/RU/EN i18n mexanizmidan chiqariladi.
- Yangi maketdagi Geist/Geist Mono, laym aksent va uppercase yorliqlar oldingi lokal dizayn yo'riqnomalaridagi boshqa vizual tanlovlardan ustun.

## Mavjud texnologiyalar

Next.js 16 App Router, TypeScript, Tailwind v4, shadcn/Radix umumiy komponentlari, lucide ikonkalari, next-intl (UZ/RU/EN), next-themes (`class="dark"`), TanStack Query va OpenAPI tiplari. Tailwind endi rasmiy PostCSS orqali ishlaydi; bu avvalgi UI tekshiruvida tuzatildi.

## Maket → mavjud route va komponentlar

Barcha route'lar `/{locale}` bilan boshlanadi.

| Maket | Mavjud route | Asosiy komponentlar |
|---|---|---|
| 01 Bosh sahifa | `/` | `features/home/components/*`, `app/[locale]/page.tsx` |
| 02 Vakansiyalar | `/vacancies` | `features/vacancies/components/*`, qidiruv/filtr/sahifalash |
| 03 Vakansiya | `/vacancies/[id]` | vacancy detail, apply block, kompaniya va ko'nikmalar |
| 04 Arizalar | `/candidate/applications` | `features/applications/components/candidate-applications.tsx` |
| 05 1-bosqich | `/candidate/interview/[applicationId]` ichidagi Stage 1 | `features/interview/components/{stage1-step,task-workspace,clock,code-editor}.tsx` |
| 06 2-bosqich | shu route ichidagi Stage 2 | `features/interview-stage2/components/*` |
| 07 Natijalar | `/candidate/applications/[applicationId]/results` | `features/candidate-results/components/*` |
| 08 HR nomzodlar | `/hr/candidates` | `features/applications/components/hr-candidates.tsx`, `features/companies/components/hr-shell.tsx` |
| 09 HR hisoboti | `/hr/candidates/[applicationId]`; replay uchun mavjud `/stage1` | `features/hr-report/components/*`, `features/hr-replay/components/replay-player.tsx` |
| 10 HR analitika | `/hr/analytics` | `features/hr-analytics/components/analytics-page.tsx` |

Login/register, profil, sozlamalar, kompaniya/jamoa, banklar, admin, qoidalar, tizim tekshiruvi, warm-up, bo'sh/xato holatlar va dialoglar shu umumiy komponentlar orqali yangi dizaynga moslanadi.

## Dizayn poydevori

- Geist — asosiy matn va sarlavhalar. Geist Mono — raqamlar, maosh, ball, taymer va kod.
- Yangi raw tokenlar qo'shiladi; mavjud `fg`, `accent`, `border`, `score-*`, `suspicion-*` va shadcn nomlari ularga alias bo'ladi.
- `[data-theme="dark"]` qiymatlari mavjud next-themes `.dark` klassi bilan ham ishlaydi.
- To'q panellar uchun `dark-*` tokenlari ishlatiladi; ularning foni global `ink` rangiga bog'lanmaydi, chunki `ink` dark rejimda och rangga aylanadi.
- Kartochka 16px, tugma 10px, boshqaruvlar kamida 44px, asosiy konteyner 1240px.
- Yangi kutubxona talab qilinmaydi. Halqa va diagrammalar oddiy SVG/CSS bilan chiziladi.

Desktop, 1440px:

```text
Ochiq sayt: [logo | qidiruv/navigatsiya | til | hisob]
            [asosiy kontent                    ]
            [filtr yoki matn] [kartalar/panel  ]
HR:         [to'q menyu] [yuqori panel         ]
            [kompaniya ] [KPI / jadval / dalil ]
Intervyu:   [maxsus header | bosqich | taymer   ]
            [topshiriq] [muharrir yoki javob   ]
```

Telefon, 390px:

```text
[logo | hisob/menyu]
[qidiruv / asosiy sarlavha]
[filtrlar / yig'iladigan HR menyusi]
[kartochka yoki bitta asosiy panel]
[keyingi amal / mavjud pastki navigatsiya]
```

Asosiy tamoyillar: haqiqiy ma'lumotlar birinchi; namuna natija sifatida ko'rsatilmaydi; bir ekranda asosiy amal aniq; ball va shubha o'zaro aralashtirilmaydi.

## Maketdagi qo'shimcha elementlar va mavjud ma'lumotlar

| Element | Tekshiruv va rejalashtirilgan yechim |
|---|---|
| Vakansiya qidiruviga obuna | API yo'q. Ushbu redesign doirasida ishlamaydigan tugma yoki yangi endpoint qo'shilmaydi. |
| Ariza banneridagi taklif muddati/taxminiy 60 daqiqa | Bunday ariza muddati API'da yo'q. Faqat mavjud intervyu holati va mavjud konfiguratsiya ko'rsatiladi. |
| Vakansiyadagi 70% va intervyudagi 90 soniya | Maketdan ko'chirilmaydi; mavjud konfiguratsiya/sessiya qiymati olinadi. Kerakli qiymat olinmagan sahifada son ko'rsatilmaydi. |
| Stage 2 jonli transkript | STT yakuniy audio yuborilgach ishlaydi; streaming transkript API'si yo'q. Haqiqiy recording/loading/saqlangan transkript holatlari ko'rsatiladi. |
| Stage 2 kelgusi savollar ro'yxati | API faqat joriy savolni beradi. Savol raqami va mavjud progress ko'rsatiladi; kelgusi savollar to'qilmaydi. |
| «O'tkazib yuborish» | Mavjud maxsus skip amali yo'q. Yangi intervyu harakati qo'shilmaydi; mavjud javob yuborish, o'ylash va text fallback amallari saqlanadi. |
| Sukunat ko'rsatkichi va mikrofon to'lqini | Mavjud client activity/VAD va sessiya warning/limit qiymatlaridan chiziladi; soxta sekund yoki transkript kiritilmaydi. |
| Replay activity grafigi | Mavjud replay event vaqtlaridan hisoblanadi; dekorativ tasodifiy ustunlar ishlatilmaydi. |
| Analitikadagi «eng katta yo'qotish» | Mavjud funnel sonlaridan qo'shni bosqichlar orasidagi eng katta foizli pasayish hisoblanadi; natija yo'q bo'lsa blok yashiriladi. O'rtacha ball diagrammasi mavjud maydonlardan chiziladi. |
| HR KPI va «#1 reytingda» | Mavjud API'da tasdiqlangan jami/ball ishlatiladi. Bitta sahifa o'rtachasi butun kompaniyaning o'rtachasi deb berilmaydi; global tavsiya soni va detal sahifasidagi mutlaq reyting mavjud bo'lmasa chiqarilmaydi. Jadval qatori reytingi sort va pagination'dan olinadi. |
| Hisobot tarixi | Mavjud override tarixi va haqiqatan mavjud vaqtlar ko'rsatiladi; umumiy audit timeline to'qilmaydi. |
| Landingdagi nomzod namunasi | Shaxsiy nomzod ma'lumotlari ommaviy sahifaga chiqarilmaydi. Soxta ism va natija bilan real hisobot taassuroti berilmaydi. |
| Kompaniyalar katalogi, umumiy qoidalar, maxfiylik va aloqa havolalari | Hozir alohida route yo'q. Faqat mavjud sahifa va haqiqiy manzillarga havola qo'yiladi. |
| «Tabriklaymiz — taklif kutilmoqda» | Faqat haqiqiy ariza holatiga mos matn ko'rsatiladi; ball HR taklifini kafolatlamaydi. |

## Amalga oshirish ketma-ketligi

1. Tokenlar, shriftlar, global CSS va umumiy UI komponentlari.
2. Bosh sahifa: yangi header/logo, hero, qidiruv, jarayon, auditoriya bloklari, vakansiyalar va footer. Birinchi ko'rib chiqiladigan natija shu.
3. Vakansiyalar ro'yxati va detal sahifasi.
4. Arizalar va nomzod natijalari.
5. HR qobig'i, nomzodlar jadvali, hisobot/replay, analitika.
6. 1-bosqich va 2-bosqich intervyu xonalari: faqat ko'rinish, mantiqni o'zgartirmasdan.
7. Qolgan mavjud sahifalarni bir xil dizayn tiliga moslash.

`PROMPT.md` talabiga ko'ra har ekran tugagach natija va skrinshotlar ko'rsatiladi. Har katta qadam alohida commit bo'ladi; eski o'zgarishlar bilan aralashtirilmaydi. Push uchun alohida ruxsat kerak.

## Qabul mezonlari

- Har yangilangan ekran: 1440px va 390px, yorug'/qorong'i; UZ/RU/EN uzun matnlari sig'adi. Qo'shimcha 360px/768px tekshiruv saqlanadi.
- Dizayn maket bilan skrinshot orqali solishtiriladi. Intervyuning kichik ekran uchun mavjud cheklovi tushunarli ko'rsatiladi.
- Klaviatura, skip link, dialog fokusi, form label'lari, kontrast; axe serious/critical 0.
- Console'da yangi JS/i18n xatosi yo'q; CSS/shriftlar haqiqatan ishlaydi.
- Frontend unit/component, zarur e2e, lint, typecheck va Docker production build o'tadi.
- Mavjud ariza, saralash, replay, telemetriya, paste-blok, taymer, reconnect, mikrofon va fallback oqimlari saqlanadi.

## Oldingi UI tekshiruvidan o'tadigan ishlar

Tarjimalardagi 60 ta tuzatish, Tailwind'ning ikkala builderda ishlashi va skip-link fokus tuzatishi mavjud ish daraxtida turibdi. Ular yangi dizayn bilan saqlanadi. Yangi dizayn tasdiqlangach, qolgan jonli tekshiruvlar yangi ko'rinishga nisbatan yakunlanadi.
