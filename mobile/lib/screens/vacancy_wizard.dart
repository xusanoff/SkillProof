import 'package:flutter/material.dart';
import '../core/api.dart';
import '../core/flow.dart';
import '../l10n/strings.dart';
import 'shared.dart';

class VacancyWizardScreen extends StatefulWidget {
  const VacancyWizardScreen({
    super.key,
    required this.api,
    required this.companyId,
  });
  final Api api;
  final String companyId;
  @override
  State<VacancyWizardScreen> createState() => _VacancyWizardScreenState();
}

class _VacancyWizardScreenState extends State<VacancyWizardScreen> {
  final general = GlobalKey<FormState>(), config = GlobalKey<FormState>();
  final scroll = ScrollController();
  final title = TextEditingController(),
      description = TextEditingController(),
      city = TextEditingController(),
      salaryMin = TextEditingController(),
      salaryMax = TextEditingController(),
      search = TextEditingController();
  final s1Duration = TextEditingController(),
      s1Threshold = TextEditingController(),
      s2Duration = TextEditingController(),
      s2Count = TextEditingController(),
      s2Threshold = TextEditingController(),
      paste = TextEditingController(),
      inactivity = TextEditingController();
  String? vacancyId;
  String remote = 'office',
      employment = 'full_time',
      experience = 'between_1_3',
      currency = 'UZS',
      language = 'uz',
      mode = 'voice';
  bool adaptive = true, reuse = true, busy = false, attempted = false;
  int step = 0, qPage = 0, tPage = 0, qTotal = 0, tTotal = 0;
  String query = '';
  Object? error;
  Json? readiness;
  final questions = <String, Json>{}, tasks = <String, Json>{};
  final selectedQuestions = <String>{}, selectedTasks = <String>{};
  @override
  void dispose() {
    for (final c in [
      title,
      description,
      city,
      salaryMin,
      salaryMax,
      search,
      s1Duration,
      s1Threshold,
      s2Duration,
      s2Count,
      s2Threshold,
      paste,
      inactivity,
    ]) {
      c.dispose();
    }
    scroll.dispose();
    super.dispose();
  }

  void changeStep(int value) {
    FocusScope.of(context).unfocus();
    setState(() => step = value);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted && scroll.hasClients) scroll.jumpTo(0);
    });
  }

  Future<void> act(Future<void> Function() work) async {
    if (busy) return;
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await work();
    } catch (e) {
      if (mounted) setState(() => error = e);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Map<String, dynamic> body() => {
    'title': title.text.trim(),
    'description': description.text,
    'city': city.text,
    'salary_min': int.tryParse(salaryMin.text),
    'salary_max': int.tryParse(salaryMax.text),
    'currency': currency,
    'profession_area': 'it',
    'country': 'UZ',
    'remote_type': remote,
    'employment_type': employment,
    'experience_level': experience,
  };
  Map<String, dynamic> assessment() => {
    'language': language,
    'question_mode': 'manual',
    'allow_skill_reuse': reuse,
    'auto_approve_ai_items': false,
    'stage1_config': {
      'task_ids': selectedTasks.toList(),
      if (s1Duration.text.isNotEmpty)
        'duration_minutes': int.parse(s1Duration.text),
      if (s1Threshold.text.isNotEmpty)
        'pass_threshold': double.parse(s1Threshold.text),
    },
    'stage2_config': {
      'mode': mode,
      'adaptive': adaptive,
      if (s2Duration.text.isNotEmpty)
        'duration_minutes': int.parse(s2Duration.text),
      if (s2Count.text.isNotEmpty) 'question_count': int.parse(s2Count.text),
      if (s2Threshold.text.isNotEmpty)
        'pass_threshold': double.parse(s2Threshold.text),
    },
    'integrity_config': {
      if (paste.text.isNotEmpty) 'paste_max_lines': int.parse(paste.text),
      if (inactivity.text.isNotEmpty)
        'inactivity_limit_s': int.parse(inactivity.text),
    },
    'questions': [
      for (final id in selectedQuestions)
        {'question_id': id, 'is_mandatory': false},
    ],
  };
  Future<void> next() async {
    if (step == 0 && !general.currentState!.validate()) return;
    if (step == 1 && !config.currentState!.validate()) return;
    await act(() async {
      if (step == 0) {
        final Json v = await widget.api.request(
          vacancyId == null ? 'POST' : 'PATCH',
          '/companies/${widget.companyId}/vacancies${vacancyId == null ? '' : '/$vacancyId'}',
          data: body(),
        );
        vacancyId = v['id'];
        if (mounted) changeStep(1);
      } else if (step == 1) {
        readiness = await widget.api.request(
          'PUT',
          '/companies/${widget.companyId}/vacancies/$vacancyId/assessment',
          data: assessment(),
        );
        await bank('questions', reset: true);
        await bank('tasks', reset: true);
        if (mounted) changeStep(2);
      }
    });
  }

  Future<void> finish({bool draft = false}) async {
    await act(() async {
      final Json saved = await widget.api.request(
        'PUT',
        '/companies/${widget.companyId}/vacancies/$vacancyId/assessment',
        data: assessment(),
      );
      if (mounted) {
        setState(() {
          readiness = saved;
          attempted = true;
        });
      }
      if (!draft && saved['ready'] != true) {
        if (mounted) {
          message(
            context,
            tr(context, 'Baholash hali tayyor emas. Kamchiliklarni tuzating.'),
          );
        }
        return;
      }
      if (!draft) {
        await widget.api.request(
          'PATCH',
          '/companies/${widget.companyId}/vacancies/$vacancyId',
          data: {'status': 'published'},
        );
      }
      if (mounted) {
        message(
          context,
          tr(
            context,
            draft ? 'Qoralama saqlandi.' : 'Vakansiya nashr qilindi.',
          ),
        );
        Navigator.pop(context);
      }
    });
  }

  Future<void> bank(String kind, {bool reset = false}) async {
    final isQuestion = kind == 'questions';
    final page = reset ? 1 : (isQuestion ? qPage : tPage) + 1;
    final Json data = await widget.api.request(
      'GET',
      '/companies/${widget.companyId}/$kind',
      query: {
        'include_global': true,
        'page_size': 20,
        'page': page,
        if (isQuestion && query.isNotEmpty) 'q': query,
      },
    );
    if (!mounted) return;
    setState(() {
      final target = isQuestion ? questions : tasks;
      if (reset) {
        target.removeWhere(
          (id, v) =>
              !(isQuestion ? selectedQuestions : selectedTasks).contains(id),
        );
      }
      for (final row in data['items']) {
        target[row['id']] = row;
      }
      if (isQuestion) {
        qPage = page;
        qTotal = data['total'];
      } else {
        tPage = page;
        tTotal = data['total'];
      }
    });
  }

  Future<void> addQuestion() async {
    final q = await Navigator.push<Json>(
      context,
      MaterialPageRoute(
        builder: (_) => NewQuestionScreen(
          api: widget.api,
          companyId: widget.companyId,
          language: language,
        ),
      ),
    );
    if (q != null && mounted) {
      setState(() {
        questions[q['id']] = q;
        selectedQuestions.add(q['id']);
      });
    }
  }

  Widget dropdown(
    String label,
    String value,
    Map<String, String> values,
    ValueChanged<String> changed,
  ) => Padding(
    padding: const EdgeInsets.only(bottom: 14),
    child: DropdownButtonFormField<String>(
      key: ValueKey('$label-$value'),
      initialValue: value,
      isExpanded: true,
      decoration: InputDecoration(labelText: tr(context, label)),
      items: [
        for (final v in values.entries)
          DropdownMenuItem(value: v.key, child: AppText(v.value)),
      ],
      onChanged: busy
          ? null
          : (v) {
              if (v != null) setState(() => changed(v));
            },
    ),
  );
  Widget number(
    TextEditingController c,
    String label, {
    int? min,
    int? max,
    bool decimal = false,
  }) => Padding(
    padding: const EdgeInsets.only(bottom: 14),
    child: TextFormField(
      controller: c,
      keyboardType: TextInputType.number,
      decoration: InputDecoration(labelText: tr(context, label)),
      validator: (v) {
        if (v == null || v.isEmpty) return null;
        final n = decimal ? double.tryParse(v) : int.tryParse(v);
        if (n == null || (min != null && n < min) || (max != null && n > max)) {
          return '${min ?? 0} – ${max ?? '…'}';
        }
        return null;
      },
    ),
  );
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const AppText('Vakansiya yaratish')),
    body: SafeArea(
      child: Column(
        children: [
          if (MediaQuery.viewInsetsOf(context).bottom == 0)
            Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  for (var i = 0; i < 3; i++)
                    Expanded(
                      child: Column(
                        children: [
                          CircleAvatar(
                            backgroundColor: step == i
                                ? Theme.of(context).colorScheme.primary
                                : null,
                            child: Text(
                              '${i + 1}',
                              style: TextStyle(
                                color: step == i ? Colors.white : null,
                              ),
                            ),
                          ),
                          AppText(
                            [
                              'Umumiy ma’lumot',
                              'Baholash sozlamalari',
                              'Savollar',
                            ][i],
                            textAlign: TextAlign.center,
                          ),
                        ],
                      ),
                    ),
                ],
              ),
            ),
          Expanded(
            child: ListView(
              controller: scroll,
              padding: const EdgeInsets.all(16),
              children: [
                if (error != null)
                  Panel(children: [AppText(errorText(error!))]),
                if (step == 0)
                  Form(
                    key: general,
                    child: Column(
                      children: [
                        TextFormField(
                          controller: title,
                          maxLength: 200,
                          decoration: InputDecoration(
                            labelText: tr(context, 'Lavozim'),
                          ),
                          validator: (v) => v == null || v.trim().length < 3
                              ? tr(context, 'Lavozimni kiriting')
                              : null,
                        ),
                        const SizedBox(height: 14),
                        TextFormField(
                          controller: description,
                          maxLength: 20000,
                          minLines: 3,
                          maxLines: 8,
                          decoration: InputDecoration(
                            labelText: tr(context, 'Vakansiya tavsifi'),
                          ),
                          validator: (v) => v == null || v.trim().isEmpty
                              ? tr(context, 'Tavsifni kiriting')
                              : null,
                        ),
                        number(salaryMin, 'Eng kam maosh', min: 0),
                        number(salaryMax, 'Eng yuqori maosh', min: 0),
                        dropdown('Valyuta', currency, {
                          'UZS': 'UZS',
                          'USD': 'USD',
                          'EUR': 'EUR',
                        }, (v) => currency = v),
                        dropdown(
                          'Ish formati',
                          remote,
                          formats,
                          (v) => remote = v,
                        ),
                        dropdown('Bandlik', employment, {
                          'full_time': 'To‘liq kun',
                          'part_time': 'Yarim kun',
                          'project': 'Loyiha',
                          'internship': 'Amaliyot',
                        }, (v) => employment = v),
                        dropdown('Tajriba', experience, {
                          'no_experience': 'Tajribasiz',
                          'between_1_3': '1–3 yil',
                          'between_3_6': '3–6 yil',
                          'more_than_6': '6 yildan ko‘p',
                        }, (v) => experience = v),
                        TextFormField(
                          controller: city,
                          maxLength: 120,
                          decoration: InputDecoration(
                            labelText: tr(context, 'Shahar'),
                          ),
                        ),
                      ],
                    ),
                  ),
                if (step == 1)
                  Form(
                    key: config,
                    child: Column(
                      children: [
                        dropdown('Suhbat tili', language, {
                          'uz': 'O‘zbekcha',
                          'ru': 'Русский',
                          'en': 'English',
                        }, (v) => language = v),
                        const AppText(
                          'Bo‘sh maydonlar umumiy sozlamalardan olinadi.',
                        ),
                        const SizedBox(height: 12),
                        number(
                          s1Duration,
                          'Amaliy bosqich davomiyligi (daqiqa)',
                          min: 5,
                          max: 240,
                        ),
                        number(
                          s1Threshold,
                          'Amaliy bosqich o‘tish bali',
                          min: 0,
                          max: 100,
                          decimal: true,
                        ),
                        number(
                          s2Duration,
                          'AI suhbat davomiyligi (daqiqa)',
                          min: 5,
                          max: 120,
                        ),
                        number(
                          s2Count,
                          'AI suhbat savollar soni',
                          min: 1,
                          max: 30,
                        ),
                        number(
                          s2Threshold,
                          'AI suhbat o‘tish bali',
                          min: 0,
                          max: 100,
                          decimal: true,
                        ),
                        dropdown('Suhbat rejimi', mode, {
                          'voice': 'Ovozli',
                          'text': 'Matnli',
                        }, (v) => mode = v),
                        SwitchListTile(
                          title: const AppText('Moslashuvchan savollar'),
                          value: adaptive,
                          onChanged: busy
                              ? null
                              : (v) => setState(() => adaptive = v),
                        ),
                        SwitchListTile(
                          title: const AppText(
                            'Tasdiqlangan ko‘nikmalarni qayta ishlatish',
                          ),
                          value: reuse,
                          onChanged: busy
                              ? null
                              : (v) => setState(() => reuse = v),
                        ),
                        number(paste, 'Tashqi matn chegarasi (qator)', min: 0),
                        number(
                          inactivity,
                          'Harakatsizlik chegarasi (soniya)',
                          min: 1,
                        ),
                      ],
                    ),
                  ),
                if (step == 2) ...[
                  if (attempted &&
                      readiness != null &&
                      readiness!['ready'] != true)
                    Panel(
                      children: [
                        const AppText(
                          'Baholash hali tayyor emas. Kamchiliklarni tuzating.',
                        ),
                        for (final issue in readiness!['issues'])
                          AppText(issueText(issue['code'])),
                      ],
                    ),
                  const AppText(
                    'Amaliy topshiriqlar',
                    style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700),
                  ),
                  for (final task in tasks.values)
                    CheckboxListTile(
                      contentPadding: EdgeInsets.zero,
                      title: AppText(task['title']),
                      subtitle: AppText(
                        task['is_approved'] == true
                            ? 'Tasdiqlangan'
                            : 'Tasdiqlanmagan',
                      ),
                      value: selectedTasks.contains(task['id']),
                      onChanged: busy
                          ? null
                          : (v) => setState(() {
                              if (v == true && selectedTasks.length < 5) {
                                selectedTasks.add(task['id']);
                              } else {
                                selectedTasks.remove(task['id']);
                              }
                            }),
                    ),
                  if (tPage * 20 < tTotal)
                    OutlinedButton(
                      onPressed: busy ? null : () => act(() => bank('tasks')),
                      child: const AppText('Yana yuklash'),
                    ),
                  const SizedBox(height: 16),
                  const AppText(
                    'Savollar',
                    style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700),
                  ),
                  TextField(
                    controller: search,
                    onSubmitted: (v) {
                      query = v.trim();
                      act(() => bank('questions', reset: true));
                    },
                    decoration: InputDecoration(
                      labelText: tr(context, 'Bankdan qidirish'),
                      suffixIcon: IconButton(
                        tooltip: tr(context, 'Qidirish'),
                        icon: const Icon(Icons.search),
                        onPressed: () {
                          query = search.text.trim();
                          act(() => bank('questions', reset: true));
                        },
                      ),
                    ),
                  ),
                  for (final q in questions.values)
                    Panel(
                      children: [
                        CheckboxListTile(
                          contentPadding: EdgeInsets.zero,
                          title: AppText(q['text']),
                          subtitle: Text(
                            '${q['language']} · ${q['is_approved'] == true ? tr(context, 'Tasdiqlangan') : tr(context, 'Tasdiqlanmagan')}',
                          ),
                          value: selectedQuestions.contains(q['id']),
                          onChanged: busy
                              ? null
                              : (v) => setState(() {
                                  if (v == true) {
                                    selectedQuestions.add(q['id']);
                                  } else {
                                    selectedQuestions.remove(q['id']);
                                  }
                                }),
                        ),
                        if (q['company_id'] == widget.companyId &&
                            q['is_approved'] != true)
                          OutlinedButton(
                            onPressed: busy
                                ? null
                                : () => act(() async {
                                    await widget.api.request(
                                      'POST',
                                      '/companies/${widget.companyId}/questions/${q['id']}/approve',
                                      data: {'approved': true},
                                    );
                                    if (mounted) {
                                      setState(() => q['is_approved'] = true);
                                    }
                                  }),
                            child: const AppText('Tasdiqlash'),
                          ),
                      ],
                    ),
                  if (qPage * 20 < qTotal)
                    OutlinedButton(
                      onPressed: busy
                          ? null
                          : () => act(() => bank('questions')),
                      child: const AppText('Yana yuklash'),
                    ),
                  OutlinedButton.icon(
                    onPressed: busy ? null : addQuestion,
                    icon: const Icon(Icons.add),
                    label: const AppText('Yangi savol qo‘shish'),
                  ),
                ],
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(16),
            child: Wrap(
              spacing: 10,
              runSpacing: 8,
              children: [
                if (step > 0 && MediaQuery.viewInsetsOf(context).bottom == 0)
                  OutlinedButton(
                    onPressed: busy ? null : () => changeStep(step - 1),
                    child: const AppText('Oldingi bosqich'),
                  ),
                if (step == 2 && MediaQuery.viewInsetsOf(context).bottom == 0)
                  OutlinedButton(
                    onPressed: busy ? null : () => finish(draft: true),
                    child: const AppText('Qoralama saqlash'),
                  ),
                FilledButton(
                  onPressed: busy
                      ? null
                      : step == 2
                      ? () => finish()
                      : next,
                  child: AppText(
                    busy
                        ? 'Saqlanmoqda…'
                        : step == 2
                        ? 'Saqlash va nashr qilish'
                        : 'Keyingi bosqich',
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    ),
  );
}

class NewQuestionScreen extends StatefulWidget {
  const NewQuestionScreen({
    super.key,
    required this.api,
    required this.companyId,
    required this.language,
  });
  final Api api;
  final String companyId, language;
  @override
  State<NewQuestionScreen> createState() => _NewQuestionScreenState();
}

class _NewQuestionScreenState extends State<NewQuestionScreen> {
  final form = GlobalKey<FormState>(),
      text = TextEditingController(),
      reference = TextEditingController(),
      criterion = TextEditingController(text: 'Javobning asoslanganligi');
  bool busy = false;
  Object? error;
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) ScaffoldMessenger.of(context).removeCurrentSnackBar();
    });
  }

  @override
  void dispose() {
    text.dispose();
    reference.dispose();
    criterion.dispose();
    super.dispose();
  }

  Future<void> save() async {
    if (!form.currentState!.validate()) return;
    setState(() => busy = true);
    try {
      final Json q = await widget.api.request(
        'POST',
        '/companies/${widget.companyId}/questions',
        data: {
          'type': 'open',
          'text': text.text.trim(),
          'language': widget.language,
          'difficulty': 3,
          'reference_answer': reference.text.trim(),
          'rubric': {
            'criteria': [
              {
                'key': 'reasoning',
                'name': criterion.text.trim(),
                'max_points': 5,
                'description': criterion.text.trim(),
                'levels': {},
              },
            ],
          },
        },
      );
      if (mounted) Navigator.pop(context, q);
    } catch (e) {
      if (mounted) setState(() => error = e);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const AppText('Yangi savol qo‘shish')),
    body: SafeArea(
      child: Form(
        key: form,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            if (error != null) Panel(children: [AppText(errorText(error!))]),
            for (final field in [
              (text, 'Savol matni'),
              (reference, 'Tayanch javob'),
              (criterion, 'Baholash mezoni'),
            ])
              Padding(
                padding: const EdgeInsets.only(bottom: 16),
                child: TextFormField(
                  controller: field.$1,
                  minLines: 2,
                  maxLines: 6,
                  maxLength: field.$1 == text ? 4000 : 3000,
                  decoration: InputDecoration(labelText: tr(context, field.$2)),
                  validator: (v) => v == null || v.trim().isEmpty
                      ? tr(context, 'Maydonni to‘ldiring')
                      : null,
                ),
              ),
            const AppText(
              'Yangi savol umumiy savollar bankida ham saqlanadi. Ishlatishdan oldin tasdiqlang.',
            ),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: busy ? null : save,
              child: AppText(busy ? 'Saqlanmoqda…' : 'Saqlash'),
            ),
          ],
        ),
      ),
    ),
  );
}

String issueText(String code) => switch (code) {
  'stage1_no_tasks' => 'Kamida bitta amaliy topshiriq tanlang.',
  'task_not_approved' => 'Tanlangan topshiriq tasdiqlanmagan.',
  'task_not_sandbox_validated' =>
    'Topshiriq kod bajarish muhitida tekshirilishi kerak.',
  'question_not_approved' => 'Tanlangan savolni tasdiqlang.',
  'question_language_mismatch' => 'Savol tili suhbat tiliga mos emas.',
  'stage2_not_enough_questions' =>
    'Konfiguratsiyadagi miqdorga yetadigan savollar tanlang.',
  'too_many_mandatory_questions' => 'Majburiy savollar sonini kamaytiring.',
  _ => 'Baholash sozlamalarini tekshiring.',
};
