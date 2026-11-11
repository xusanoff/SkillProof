import 'package:flutter/material.dart';

/// UI copy is kept separate from backend content, following the web UZ/RU/EN locales.
final appLocale = ValueNotifier<Locale>(const Locale('uz'));
String tr(BuildContext context, String key) {
  final language = Localizations.localeOf(context).languageCode;
  if (language == 'uz') return key;
  final values = translations[key];
  if (values != null) return values[language == 'ru' ? 0 : 1];
  if (key.contains(' · ')) {
    return key.split(' · ').map((part) => tr(context, part)).join(' · ');
  }
  for (final prefix in [
    'Amaliy bosqich',
    'AI suhbat',
    'Testlar',
    'Bosqich to‘xtatilgan',
    'Yakuniy ball',
    'Tekshiruv signali',
    'Amal qiladi',
    'Holat',
    'O‘qilmagan xabarlar',
  ]) {
    if (key.startsWith('$prefix: ')) {
      return '${tr(context, prefix)}: ${tr(context, key.substring(prefix.length + 2))}';
    }
  }
  if (key.startsWith('Yana yuklash (')) {
    return '${tr(context, 'Yana yuklash')} ${key.substring(13)}';
  }
  if (key.startsWith('Amal bajarilmadi (')) {
    return '${tr(context, 'Amal bajarilmadi')} ${key.substring('Amal bajarilmadi '.length)}';
  }
  return key;
}

class AppText extends StatelessWidget {
  const AppText(this.data, {super.key, this.style, this.textAlign});
  final String data;
  final TextStyle? style;
  final TextAlign? textAlign;
  @override
  Widget build(BuildContext context) =>
      Text(tr(context, data), style: style, textAlign: textAlign);
}

const translations = <String, List<String>>{
  'Savollar banki': ['Банк вопросов', 'Question bank'],
  "Vakansiya yaratish": ["Создать вакансию", "Create vacancy"],
  "Umumiy ma’lumot": ["Общая информация", "General information"],
  "Baholash sozlamalari": ["Настройки оценки", "Assessment settings"],
  "Savollar": ["Вопросы", "Questions"],
  "Lavozim": ["Должность", "Job title"],
  "Lavozimni kiriting": ["Введите должность", "Enter a job title"],
  "Vakansiya tavsifi": ["Описание вакансии", "Job description"],
  "Tavsifni kiriting": ["Введите описание", "Enter a description"],
  "Eng kam maosh": ["Минимальная зарплата", "Minimum salary"],
  "Eng yuqori maosh": ["Максимальная зарплата", "Maximum salary"],
  "Valyuta": ["Валюта", "Currency"],
  "Bandlik": ["Занятость", "Employment"],
  "To‘liq kun": ["Полный день", "Full time"],
  "Yarim kun": ["Неполный день", "Part time"],
  "Loyiha": ["Проект", "Project"],
  "Amaliyot": ["Стажировка", "Internship"],
  "Tajriba": ["Опыт", "Experience"],
  "Tajribasiz": ["Без опыта", "No experience"],
  "1–3 yil": ["1–3 года", "1–3 years"],
  "3–6 yil": ["3–6 лет", "3–6 years"],
  "6 yildan ko‘p": ["Более 6 лет", "More than 6 years"],
  "Suhbat tili": ["Язык собеседования", "Interview language"],
  "Bo‘sh maydonlar umumiy sozlamalardan olinadi.": [
    "Пустые поля используют общие настройки.",
    "Empty fields use global settings.",
  ],
  "Amaliy bosqich davomiyligi (daqiqa)": [
    "Длительность практического этапа (мин)",
    "Practical stage duration (minutes)",
  ],
  "Amaliy bosqich o‘tish bali": [
    "Проходной балл практического этапа",
    "Practical stage pass score",
  ],
  "AI suhbat davomiyligi (daqiqa)": [
    "Длительность AI-собеседования (мин)",
    "AI interview duration (minutes)",
  ],
  "AI suhbat savollar soni": [
    "Количество вопросов AI-собеседования",
    "AI interview question count",
  ],
  "AI suhbat o‘tish bali": [
    "Проходной балл AI-собеседования",
    "AI interview pass score",
  ],
  "Suhbat rejimi": ["Режим собеседования", "Interview mode"],
  "Ovozli": ["Голосовой", "Voice"],
  "Matnli": ["Текстовый", "Text"],
  "Moslashuvchan savollar": ["Адаптивные вопросы", "Adaptive questions"],
  "Tasdiqlangan ko‘nikmalarni qayta ishlatish": [
    "Повторное использование навыков",
    "Reuse verified skills",
  ],
  "Tashqi matn chegarasi (qator)": [
    "Лимит внешней вставки (строки)",
    "External paste limit (lines)",
  ],
  "Harakatsizlik chegarasi (soniya)": [
    "Лимит бездействия (сек)",
    "Inactivity limit (seconds)",
  ],
  "Baholash hali tayyor emas. Kamchiliklarni tuzating.": [
    "Оценка не готова. Исправьте проблемы.",
    "Assessment is not ready. Resolve the issues.",
  ],
  "Amaliy topshiriqlar": ["Практические задания", "Practical tasks"],
  "Tasdiqlangan": ["Одобрено", "Approved"],
  "Tasdiqlanmagan": ["Не одобрено", "Not approved"],
  "Tasdiqlash": ["Одобрить", "Approve"],
  "Bankdan qidirish": ["Поиск в банке", "Search the bank"],
  "Yangi savol qo‘shish": ["Добавить вопрос", "Create a question"],
  "Oldingi bosqich": ["Назад", "Previous step"],
  "Keyingi bosqich": ["Далее", "Next step"],
  "Qoralama saqlash": ["Сохранить черновик", "Save draft"],
  "Saqlash va nashr qilish": ["Сохранить и опубликовать", "Save and publish"],
  "Qoralama saqlandi.": ["Черновик сохранён.", "Draft saved."],
  "Vakansiya nashr qilindi.": ["Вакансия опубликована.", "Vacancy published."],
  "Savol matni": ["Текст вопроса", "Question text"],
  "Tayanch javob": ["Эталонный ответ", "Reference answer"],
  "Baholash mezoni": ["Критерий оценки", "Assessment criterion"],
  "Maydonni to‘ldiring": ["Заполните поле", "Fill in this field"],
  "Yangi savol umumiy savollar bankida ham saqlanadi. Ishlatishdan oldin tasdiqlang.": [
    "Новый вопрос также сохраняется в банке. Одобрите его перед использованием.",
    "The new question is also saved to the bank. Approve it before use.",
  ],
  "Kamida bitta amaliy topshiriq tanlang.": [
    "Выберите хотя бы одно практическое задание.",
    "Select at least one practical task.",
  ],
  "Tanlangan topshiriq tasdiqlanmagan.": [
    "Выбранное задание не одобрено.",
    "The selected task is not approved.",
  ],
  "Topshiriq kod bajarish muhitida tekshirilishi kerak.": [
    "Задание необходимо проверить в среде выполнения.",
    "The task needs execution environment validation.",
  ],
  "Tanlangan savolni tasdiqlang.": [
    "Одобрите выбранный вопрос.",
    "Approve the selected question.",
  ],
  "Savol tili suhbat tiliga mos emas.": [
    "Язык вопроса не совпадает с языком собеседования.",
    "Question and interview languages do not match.",
  ],
  "Konfiguratsiyadagi miqdorga yetadigan savollar tanlang.": [
    "Выберите достаточно вопросов для настройки.",
    "Select enough questions for the configured count.",
  ],
  "Majburiy savollar sonini kamaytiring.": [
    "Уменьшите количество обязательных вопросов.",
    "Reduce the mandatory question count.",
  ],
  "Baholash sozlamalarini tekshiring.": [
    "Проверьте настройки оценки.",
    "Review the assessment settings.",
  ],

  'Xabarlar': ['Сообщения', 'Messages'],
  'Chatni ochish': ['Открыть чат', 'Open chat'],
  'Xabaringizni yozing': ['Напишите сообщение', 'Write a message'],
  'Yuborish': ['Отправить', 'Send'],
  'Oldingi xabarlar': ['Предыдущие сообщения', 'Older messages'],
  'Hozircha yozishmalar yo‘q. Ariza yuborilgach chat ochiladi.': [
    'Пока нет переписки. Чат появится после отклика.',
    'No conversations yet. Applying creates a chat.',
  ],
  'O‘qilmagan xabarlar': ['Непрочитанные сообщения', 'Unread messages'],

  'Amaliy bosqich': ['Практический этап', 'Practical stage'],
  'AI suhbat': ['AI-собеседование', 'AI interview'],
  'Testlar': ['Тесты', 'Tests'],
  'Bosqich to‘xtatilgan': ['Этап остановлен', 'Stage stopped'],
  'Yakuniy ball': ['Итоговый балл', 'Overall score'],
  'Tekshiruv signali': ['Сигнал проверки', 'Review signal'],
  'Amal qiladi': ['Действует до', 'Valid until'],
  'Holat': ['Статус', 'Status'],
  'Yana yuklash': ['Загрузить ещё', 'Load more'],
  'Amal bajarilmadi': ['Действие не выполнено', 'Action failed'],
  'Hali tayyor emas': ['Ещё не готов', 'Not ready yet'],
  'basic': ['Базовый', 'Basic'],
  'intermediate': ['Средний', 'Intermediate'],
  'advanced': ['Продвинутый', 'Advanced'],
  'CVni yuklab olish': ['Скачать резюме', 'Download CV'],
  'Vakansiyalar': ['Вакансии', 'Jobs'],
  'Arizalarim': ['Мои отклики', 'Applications'],
  'Natijalar': ['Результаты', 'Results'],
  'Profil': ['Профиль', 'Profile'],
  'Nomzodlar': ['Кандидаты', 'Candidates'],
  'Imkoniyatingizni\nisbotlang.': [
    'Докажите\nсвои навыки.',
    'Prove your\npotential.',
  ],
  'Vakansiyalar, arizalaringiz va tasdiqlangan ko‘nikmalar — bir joyda.': [
    'Вакансии, отклики и подтверждённые навыки в одном месте.',
    'Jobs, applications and verified skills in one place.',
  ],
  'Email': ['Email', 'Email'],
  'Parol': ['Пароль', 'Password'],
  'Tizimga kirish': ['Войти', 'Sign in'],
  'Kirilmoqda…': ['Вход…', 'Signing in…'],
  'Email manzilini kiriting': ['Введите email', 'Enter your email'],
  'Parolni kiriting': ['Введите пароль', 'Enter your password'],
  'Parolni ko‘rsatish': ['Показать пароль', 'Show password'],
  'Parolni yashirish': ['Скрыть пароль', 'Hide password'],
  'Hisob yaratish · veb': ['Создать аккаунт · веб', 'Create account · web'],
  'Sessiya tugadi. Hisobingizga qayta kiring.': [
    'Сессия завершена. Войдите снова.',
    'Your session expired. Sign in again.',
  ],
  'Email yoki parol noto‘g‘ri.': [
    'Неверный email или пароль.',
    'Incorrect email or password.',
  ],
  'Sessiya tugadi. Qayta kiring.': [
    'Сессия завершена. Войдите снова.',
    'Session expired. Sign in again.',
  ],
  'Bu vakansiyaga ariza yuborgansiz.': [
    'Вы уже откликнулись на эту вакансию.',
    'You have already applied for this job.',
  ],
  'Vakansiya arizalar uchun yopilgan.': [
    'Приём откликов закрыт.',
    'This job is closed to applications.',
  ],
  'Juda ko‘p so‘rov. Birozdan keyin qayta urinib ko‘ring.': [
    'Слишком много запросов. Попробуйте позже.',
    'Too many requests. Try again later.',
  ],
  'Bu amal uchun ruxsat yo‘q.': [
    'Недостаточно прав для этого действия.',
    'You do not have permission for this action.',
  ],
  'Kiritilgan ma’lumotlarni tekshiring.': [
    'Проверьте введённые данные.',
    'Check the information you entered.',
  ],
  'PDF, DOC yoki DOCX tanlang.': [
    'Выберите PDF, DOC или DOCX.',
    'Choose PDF, DOC or DOCX.',
  ],
  'Fayl hajmi ruxsat etilgan chegaradan katta.': [
    'Файл превышает допустимый размер.',
    'File exceeds the size limit.',
  ],
  'Ma’lumot topilmadi yoki sizga ruxsat yo‘q.': [
    'Данные не найдены или недоступны.',
    'Data was not found or access is restricted.',
  ],
  'Ulanib bo‘lmadi. Internetni tekshirib qayta urining.': [
    'Не удалось подключиться. Проверьте интернет и повторите.',
    'Could not connect. Check your connection and try again.',
  ],
  'Qayta urinish': ['Повторить', 'Retry'],
  'Hozircha ma’lumot yo‘q.': ['Пока нет данных.', 'No data yet.'],
  'Keyingi imkoniyatingiz': [
    'Ваша следующая возможность',
    'Your next opportunity',
  ],
  'Lavozim, ko‘nikma yoki kompaniya': [
    'Должность, навык или компания',
    'Role, skill or company',
  ],
  'Qidirish': ['Поиск', 'Search'],
  'Filtrlar': ['Фильтры', 'Filters'],
  'Ish formati': ['Формат работы', 'Work format'],
  'Barchasi': ['Все', 'All'],
  'Ofisda': ['В офисе', 'On site'],
  'Masofadan': ['Удалённо', 'Remote'],
  'Aralash': ['Гибрид', 'Hybrid'],
  'Saqlanganlar': ['Сохранённые', 'Saved'],
  'Saqlangan': ['Сохранено', 'Saved'],
  'Saqlash': ['Сохранить', 'Save'],
  'Mos vakansiya topilmadi. Qidiruv yoki filtrni o‘zgartiring.': [
    'Вакансий не найдено. Измените поиск или фильтры.',
    'No matching jobs. Change the search or filters.',
  ],
  'Maosh kelishiladi': ['Зарплата по договорённости', 'Salary negotiable'],
  'Amaliy baholash · kompyuter kerak': [
    'Практический этап · нужен компьютер',
    'Practical assessment · computer required',
  ],
  'Vakansiya': ['Вакансия', 'Job details'],
  'VAKANSIYA HAQIDA': ['О ВАКАНСИИ', 'ABOUT THE JOB'],
  'Talablar': ['Требования', 'Requirements'],
  'Ariza berishdan oldin: amaliy topshiriqni kompyuterda bajarish kerak. Keyingi AI suhbatni mavjud veb ilovada telefonda ham davom ettirish mumkin.': [
    'Перед откликом: практическое задание выполняется на компьютере. Затем AI-собеседование можно пройти на телефоне в веб-приложении.',
    'Before applying: the practical task requires a computer. The following AI interview can be continued on your phone in the web app.',
  ],
  'HR uchun xabar (ixtiyoriy)': [
    'Сообщение HR (необязательно)',
    'Message to HR (optional)',
  ],
  'Yuborilmoqda…': ['Отправка…', 'Sending…'],
  'Ariza berish': ['Откликнуться', 'Apply'],
  'Ariza yuborilgan': ['Отклик отправлен', 'Application sent'],
  'Ariza yuborildi. Holatni Arizalarim bo‘limida kuzating.': [
    'Отклик отправлен. Следите за статусом в разделе откликов.',
    'Application sent. Track its status in Applications.',
  ],
  'Ariza yuborish uchun nomzod hisobi bilan kiring.': [
    'Войдите как кандидат, чтобы откликнуться.',
    'Sign in as a candidate to apply.',
  ],
  'Hali arizangiz yo‘q. Vakansiya tanlab ariza yuboring.': [
    'У вас ещё нет откликов. Выберите вакансию.',
    'No applications yet. Choose a job and apply.',
  ],
  'Arizani qaytarib olasizmi?': [
    'Отозвать отклик?',
    'Withdraw your application?',
  ],
  'Bekor qilish': ['Отмена', 'Cancel'],
  'Qaytarib olish': ['Отозвать', 'Withdraw'],
  'Arizani qaytarib olish': ['Отозвать отклик', 'Withdraw application'],
  'Bajarilmoqda…': ['Выполняется…', 'Working…'],
  'Vebda davom etish': ['Продолжить в веб-приложении', 'Continue on the web'],
  'Natijalar va izohlar': ['Результаты и отзывы', 'Results and feedback'],
  'Ariza yuborildi': ['Отклик отправлен', 'Applied'],
  'Suhbat kutilmoqda': ['Ожидается собеседование', 'Interview pending'],
  'Amaliy bosqich davom etmoqda': [
    'Практический этап идёт',
    'Practical stage in progress',
  ],
  'Amaliy bosqich yakunlandi': [
    'Практический этап завершён',
    'Practical stage ended',
  ],
  'Amaliy bosqich to‘xtatildi': [
    'Практический этап остановлен',
    'Practical stage stopped',
  ],
  'AI suhbatga tayyor': ['AI-собеседование готово', 'AI interview ready'],
  'AI suhbat davom etmoqda': [
    'AI-собеседование идёт',
    'AI interview in progress',
  ],
  'Suhbat to‘xtatildi': ['Собеседование остановлено', 'Interview stopped'],
  'Baholandi': ['Оценено', 'Evaluated'],
  'Saralandi': ['В шорт-листе', 'Shortlisted'],
  'Rad etildi': ['Отклонено', 'Rejected'],
  'Ishga qabul qilindi': ['Нанят', 'Hired'],
  'Qaytarib olindi': ['Отозвано', 'Withdrawn'],
  'Siz: kompyuterda amaliy bosqichni davom ettiring.': [
    'Ваш шаг: продолжите практический этап на компьютере.',
    'Your turn: continue the practical stage on a computer.',
  ],
  'Siz: veb sahifada AI suhbatni davom ettiring.': [
    'Ваш шаг: продолжите AI-собеседование в веб-приложении.',
    'Your turn: continue the AI interview on the web.',
  ],
  'HR: arizangiz bo‘yicha qaror kutilmoqda.': [
    'HR: ожидается решение по вашему отклику.',
    'HR: a decision on your application is pending.',
  ],
  'Siz: natija va izohlarni ko‘ring.': [
    'Ваш шаг: посмотрите результаты и отзывы.',
    'Your turn: review results and feedback.',
  ],
  'HR sizni ishga qabul qildi.': [
    'HR подтвердил приём на работу.',
    'HR has marked you as hired.',
  ],
  'Siz: boshqa vakansiyalarni ko‘rib chiqing.': [
    'Ваш шаг: посмотрите другие вакансии.',
    'Your turn: explore other jobs.',
  ],
  'Siz arizani qaytarib olgansiz.': [
    'Вы отозвали отклик.',
    'You withdrew this application.',
  ],
  'Natija tayyor': ['Результаты готовы', 'Results ready'],
  'Baholanmoqda': ['Идёт оценка', 'Evaluation pending'],
  'HR tekshiruvi kerak': ['Требуется проверка HR', 'HR review needed'],
  'Natija hali tayyor emas': [
    'Результаты ещё не готовы',
    'Results are not ready',
  ],
  'Yaxshilash uchun': ['Для улучшения', 'To improve'],
  'Yangilash': ['Обновить', 'Refresh'],
  'Kasbiy sarlavha': ['Профессиональный заголовок', 'Professional headline'],
  'Shahar': ['Город', 'City'],
  'O‘zingiz haqingizda': ['О себе', 'About you'],
  'Saqlandi.': ['Сохранено.', 'Saved.'],
  'Saqlanmoqda…': ['Сохранение…', 'Saving…'],
  'Profilni saqlash': ['Сохранить профиль', 'Save profile'],
  'REZYUME': ['РЕЗЮМЕ', 'RESUME'],
  'Rezyume yuklanmagan': ['Резюме не загружено', 'No resume uploaded'],
  'CV yuklash · PDF / DOC / DOCX': [
    'Загрузить резюме · PDF / DOC / DOCX',
    'Upload CV · PDF / DOC / DOCX',
  ],
  'CVni o‘chirish': ['Удалить резюме', 'Delete CV'],
  'Tasdiqlangan ko‘nikmalar': ['Подтверждённые навыки', 'Verified skills'],
  'Hali tasdiqlangan ko‘nikmalar yo‘q.': [
    'Пока нет подтверждённых навыков.',
    'No verified skills yet.',
  ],
  'Ommaviy profilda ko‘rsatish': [
    'Показывать в публичном профиле',
    'Show on public profile',
  ],
  'Amal qilish muddati tugagan': ['Срок действия истёк', 'Expired'],
  'Veb suhbat tashqi brauzerda ochiladi. U yerda alohida tizimga kirish talab qilinishi mumkin.': [
    'Веб-собеседование открывается во внешнем браузере. Возможно, потребуется войти снова.',
    'The web interview opens in your browser. You may need to sign in there separately.',
  ],
  'Hisobdan chiqish': ['Выйти', 'Sign out'],
  'Kompaniya': ['Компания', 'Company'],
  'Kompaniya a’zoligi topilmadi. Kompaniyangizni veb ilovada sozlang.': [
    'Членство в компании не найдено. Настройте компанию в веб-приложении.',
    'No company membership found. Set up your company on the web.',
  ],
  'Nomzod va dalillar': ['Кандидат и доказательства', 'Candidate and evidence'],
  'Nomzod tafsiloti': ['Данные кандидата', 'Candidate details'],
  'HISOBOT': ['ОТЧЁТ', 'REPORT'],
  'Inson tekshiruvi zarur. Yakuniy qarorni HR qabul qiladi.': [
    'Нужна проверка человеком. Окончательное решение принимает HR.',
    'Human review is required. HR makes the final decision.',
  ],
  'Kuchli tomoni': ['Сильная сторона', 'Strength'],
  'Rivojlantirish uchun': ['Для развития', 'To develop'],
  'To‘liq hisobot va replay · veb': [
    'Полный отчёт и replay · веб',
    'Full report and replay · web',
  ],
  'HR eslatmalari': ['Заметки HR', 'HR notes'],
  'Hisobotni yangilash': ['Обновить отчёт', 'Refresh report'],
  'Ichki eslatmalar': ['Внутренние заметки', 'Internal notes'],
  'Eslatma': ['Заметка', 'Note'],
};
