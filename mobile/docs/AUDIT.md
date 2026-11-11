# Mobil integratsiya auditi

2026-11-09. Manbalar: docs/API.md, backend/app/api/v1/{auth,candidate,vacancies}.py,
backend/app/schemas/{auth,candidate,vacancy,report}.py, backend/app/models/enums.py,
frontend/src/features/{applications/model.ts,interview/components/interview-flow.tsx}.

| Oqim | Mavjud API | Mobil qaror |
|---|---|---|
| Kirish, sessiya | auth/login, me, refresh, logout | Cookie sessiya, Keychain/Android encrypted storage; refresh bir vaqtda bitta |
| Qidiruv, filtr, detal | vacancies?q=&remote_type=&page=, vacancies/{id} | Qidiruv/scroll saqlanadi, filtr bottom sheet |
| Ariza, kuzatish | vacancies/{id}/apply, candidate/applications, withdraw | Backend tasdig‘i; holatga mos keyingi amal |
| Saqlanganlar | candidate/saved-vacancies | Nomzod sessiyasi bilan |
| Profil, CV | candidate/profile, profile/resume | Tahrir, fayl tanlash/yuklash/o‘chirish |
| Natija, ko‘nikmalar | applications/{id}/results, candidate/verified-skills | Faqat server bergan natija, maxfiylik boshqaruvi |
| HR | me.companies, companies/{id}/applications, report, notes | Kompaniya tanlash, kartalar, hisobot va ruxsat etilgan status amallari |
| Stage 1 | applications/{id}/interview | Kompyuter talab qiladi; mobil muharrir yo‘q |
| Stage 2 | Mavjud veb suhbat audio/telemetriya bilan | Veb sahifaga tashqi havola, brauzerda qayta login zarur; native audio hozir ulanmaydi |

Yangi endpoint/rol/holat qo‘shilmaydi. Admin boshqaruvi vebda qoladi.
Mobil ilova alohida yangi uslubda: siyoh, iliq oq, ko‘k aksent, 48dp boshqaruvlar.
UZ asosiy til; RU/EN tarjimalar alohida resurslarda saqlanadi.
