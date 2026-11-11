const statusLabels = {
  'applied': 'Ariza yuborildi',
  'interview_pending': 'Suhbat kutilmoqda',
  'stage1_in_progress': 'Amaliy bosqich davom etmoqda',
  'stage1_failed': 'Amaliy bosqich yakunlandi',
  'stage1_disqualified': 'Amaliy bosqich to‘xtatildi',
  'stage2_pending': 'AI suhbatga tayyor',
  'stage2_in_progress': 'AI suhbat davom etmoqda',
  'stage2_disqualified': 'Suhbat to‘xtatildi',
  'evaluated': 'Baholandi',
  'shortlisted': 'Saralandi',
  'rejected': 'Rad etildi',
  'hired': 'Ishga qabul qilindi',
  'withdrawn': 'Qaytarib olindi',
};
String nextAction(String status) => switch (status) {
  'applied' ||
  'interview_pending' ||
  'stage1_in_progress' => 'Siz: kompyuterda amaliy bosqichni davom ettiring.',
  'stage2_pending' ||
  'stage2_in_progress' => 'Siz: veb sahifada AI suhbatni davom ettiring.',
  'evaluated' || 'shortlisted' => 'HR: arizangiz bo‘yicha qaror kutilmoqda.',
  'stage1_failed' ||
  'stage1_disqualified' ||
  'stage2_disqualified' => 'Siz: natija va izohlarni ko‘ring.',
  'hired' => 'HR sizni ishga qabul qildi.',
  'rejected' => 'Siz: boshqa vakansiyalarni ko‘rib chiqing.',
  'withdrawn' => 'Siz arizani qaytarib olgansiz.',
  _ => 'Holat yangilanishini kuting.',
};
bool canWithdraw(String s) =>
    ['applied', 'interview_pending', 'shortlisted'].contains(s);
List<String> hrActions(String s) => switch (s) {
  'withdrawn' || 'hired' => [],
  'shortlisted' => ['applied', 'hired', 'rejected'],
  'rejected' => ['applied', 'shortlisted'],
  'evaluated' => ['shortlisted', 'hired', 'rejected'],
  _ => ['shortlisted', 'rejected'],
};
String salary(Map<String, dynamic> v) {
  final lo = v['salary_min'], hi = v['salary_max'];
  if (lo == null && hi == null) return 'Maosh kelishiladi';
  return '${lo ?? '…'} – ${hi ?? '…'} ${v['currency']}';
}

const formats = {
  'office': 'Ofisda',
  'remote': 'Masofadan',
  'hybrid': 'Aralash',
};

String localDate(String value) {
  final date = DateTime.tryParse(value)?.toLocal();
  if (date == null) return value;
  String two(int value) => value.toString().padLeft(2, '0');
  return '${two(date.day)}.${two(date.month)}.${date.year} ${two(date.hour)}:${two(date.minute)}';
}
