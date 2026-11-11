import 'question_bank.dart';
import 'vacancy_wizard.dart';
import 'chat.dart';
import '../l10n/strings.dart';
import 'package:flutter/material.dart';
import '../core/api.dart';
import '../core/flow.dart';
import 'shared.dart';

class HrScreen extends StatefulWidget {
  const HrScreen({super.key, required this.api, this.revision = 0});
  final int revision;
  final Api api;
  @override
  State<HrScreen> createState() => _HrScreenState();
}

class _HrScreenState extends State<HrScreen> {
  String? company;
  @override
  Widget build(BuildContext context) {
    final companies = (widget.api.me?['companies'] as List? ?? []).cast<Json>();
    if (companies.isEmpty) {
      return const Center(
        child: Padding(
          padding: EdgeInsets.all(24),
          child: AppText(
            'Kompaniya a’zoligi topilmadi. Kompaniyangizni veb ilovada sozlang.',
          ),
        ),
      );
    }
    final cid = company ?? companies.first['id'] as String;
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
          child: FilledButton.icon(
            onPressed: () => Navigator.push(
              context,
              MaterialPageRoute<void>(
                builder: (_) =>
                    VacancyWizardScreen(api: widget.api, companyId: cid),
              ),
            ),
            icon: const Icon(Icons.add),
            label: const AppText('Vakansiya yaratish'),
          ),
        ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: OutlinedButton(
            onPressed: () => Navigator.push(
              context,
              MaterialPageRoute<void>(
                builder: (_) =>
                    QuestionBankScreen(api: widget.api, companyId: cid),
              ),
            ),
            child: const AppText('Savollar banki'),
          ),
        ),
        Padding(
          padding: const EdgeInsets.all(16),
          child: DropdownButtonFormField<String>(
            initialValue: cid,
            isExpanded: true,
            decoration: InputDecoration(labelText: tr(context, 'Kompaniya')),
            items: [
              for (final c in companies)
                DropdownMenuItem(
                  value: c['id'] as String,
                  child: AppText(c['name']),
                ),
            ],
            onChanged: (v) => setState(() => company = v),
          ),
        ),
        Expanded(
          child: PagedList(
            key: ValueKey(widget.revision),
            api: widget.api,
            path: '/companies/$cid/applications',
            query: const {'sort': 'score'},
            item: (a, reload) => Panel(
              children: [
                AppText(
                  a['candidate']['full_name'],
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                AppText(a['vacancy']['title']),
                StatusBadge(statusLabels[a['status']] ?? a['status']),
                if (a['final_score'] != null)
                  AppText('Yakuniy ball: ${a['final_score']} / 100'),
                if (a['needs_review'] == true)
                  const AppText('HR tekshiruvi kerak'),
                OutlinedButton(
                  onPressed: () async {
                    await Navigator.push(
                      context,
                      MaterialPageRoute<void>(
                        builder: (_) =>
                            HrDetail(api: widget.api, cid: cid, a: a),
                      ),
                    );
                    reload();
                  },
                  child: const AppText('Nomzod va dalillar'),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class HrDetail extends StatefulWidget {
  const HrDetail({
    super.key,
    required this.api,
    required this.cid,
    required this.a,
  });
  final Api api;
  final String cid;
  final Json a;
  @override
  State<HrDetail> createState() => _HrDetailState();
}

class _HrDetailState extends State<HrDetail> {
  bool busy = false;
  late Json a;
  final note = TextEditingController();
  @override
  void initState() {
    super.initState();
    a = Map.of(widget.a);
  }

  @override
  void dispose() {
    note.dispose();
    super.dispose();
  }

  Future<void> status(String value) async {
    setState(() => busy = true);
    try {
      final Json result = await widget.api.request(
        'PATCH',
        '/companies/${widget.cid}/applications/${a['id']}',
        data: {'status': value},
      );
      if (mounted) setState(() => a = result);
    } catch (e) {
      if (mounted) message(context, errorText(e));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const AppText('Nomzod tafsiloti')),
    body: RemotePage(
      api: widget.api,
      path: '/companies/${widget.cid}/applications/${a['id']}/report',
      builder: (data, reload) {
        final r = data as Json;
        return ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Panel(
              children: [
                AppText(
                  a['candidate']['full_name'],
                  style: Theme.of(context).textTheme.headlineSmall,
                ),
                SelectableText(a['candidate']['email']),
                OutlinedButton.icon(
                  onPressed: () => Navigator.push(
                    context,
                    MaterialPageRoute<void>(
                      builder: (_) => ChatScreen(api: widget.api, id: a['id']),
                    ),
                  ),
                  icon: const Icon(Icons.chat_bubble_outline),
                  label: const AppText('Chatni ochish'),
                ),
                if (a['candidate']['headline'] != null)
                  AppText(a['candidate']['headline']),
                StatusBadge(statusLabels[a['status']] ?? a['status']),
                if (a['cover_note'] != null) AppText(a['cover_note']),
                Wrap(
                  spacing: 8,
                  children: [
                    for (final s in hrActions(a['status']))
                      OutlinedButton(
                        onPressed: busy ? null : () => status(s),
                        child: AppText(statusLabels[s] ?? s),
                      ),
                  ],
                ),
              ],
            ),
            Panel(
              children: [
                const AppText(
                  'HISOBOT',
                  style: TextStyle(fontWeight: FontWeight.w700),
                ),
                AppText(
                  'Holat: ${switch (r['state']) {
                    'done' => 'Natija tayyor',
                    'pending' => 'Baholanmoqda',
                    'failed' => 'HR tekshiruvi kerak',
                    _ => 'Hali tayyor emas',
                  }}',
                ),
                if (r['overall_score'] != null)
                  AppText(
                    '${r['overall_score']} / 100',
                    style: Theme.of(context).textTheme.headlineLarge,
                  ),
                if (r['summary'] != null) AppText(r['summary']),
                if (r['suspicion_percent'] != null)
                  AppText(
                    'Tekshiruv signali: ${r['suspicion_percent']}% · ${r['suspicion_label']}',
                  ),
                if (r['needs_review'] == true)
                  const AppText(
                    'Inson tekshiruvi zarur. Yakuniy qarorni HR qabul qiladi.',
                  ),
              ],
            ),
            for (final key in ['strengths', 'gaps'])
              for (final p in r[key] ?? [])
                Panel(
                  children: [
                    AppText(
                      key == 'strengths'
                          ? 'Kuchli tomoni'
                          : 'Rivojlantirish uchun',
                    ),
                    AppText(p['text']),
                    if (p['excerpt'] != null) SelectableText(p['excerpt']),
                  ],
                ),
            OutlinedButton(
              onPressed: () => openWeb(context, '/hr/candidates/${a['id']}'),
              child: const AppText('To‘liq hisobot va replay · veb'),
            ),
            OutlinedButton(
              onPressed: () => Navigator.push(
                context,
                MaterialPageRoute<void>(
                  builder: (_) => HrNotes(
                    api: widget.api,
                    path:
                        '/companies/${widget.cid}/applications/${a['id']}/notes',
                  ),
                ),
              ),
              child: const AppText('HR eslatmalari'),
            ),
            OutlinedButton(
              onPressed: reload,
              child: const AppText('Hisobotni yangilash'),
            ),
          ],
        );
      },
    ),
  );
}

class HrNotes extends StatefulWidget {
  const HrNotes({super.key, required this.api, required this.path});
  final Api api;
  final String path;
  @override
  State<HrNotes> createState() => _HrNotesState();
}

class _HrNotesState extends State<HrNotes> {
  final text = TextEditingController();
  bool busy = false;
  @override
  void dispose() {
    text.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const AppText('Ichki eslatmalar')),
    body: RemotePage(
      api: widget.api,
      path: widget.path,
      builder: (data, reload) => ListView(
        padding: const EdgeInsets.all(16),
        children: [
          TextField(
            controller: text,
            minLines: 2,
            maxLines: 6,
            maxLength: 4000,
            decoration: InputDecoration(labelText: tr(context, 'Eslatma')),
          ),
          FilledButton(
            onPressed: busy
                ? null
                : () async {
                    if (text.text.trim().isEmpty) return;
                    setState(() => busy = true);
                    try {
                      await widget.api.request(
                        'POST',
                        widget.path,
                        data: {'text': text.text},
                      );
                      text.clear();
                      reload();
                    } catch (e) {
                      if (context.mounted) message(context, errorText(e));
                    } finally {
                      if (mounted) setState(() => busy = false);
                    }
                  },
            child: const AppText('Saqlash'),
          ),
          const SizedBox(height: 16),
          for (final n in data as List)
            Panel(
              children: [
                AppText(n['text']),
                AppText(n['author_name']),
                AppText(localDate(n['created_at'])),
              ],
            ),
        ],
      ),
    ),
  );
}
