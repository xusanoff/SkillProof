import 'chat.dart';
import '../l10n/strings.dart';
import 'package:flutter/material.dart';
import '../core/api.dart';
import '../core/flow.dart';
import 'shared.dart';

class ApplicationsScreen extends StatelessWidget {
  const ApplicationsScreen({
    super.key,
    required this.api,
    this.resultsOnly = false,
  });
  final Api api;
  final bool resultsOnly;
  @override
  Widget build(BuildContext context) => PagedList(
    api: api,
    path: '/candidate/applications',
    empty: 'Hali arizangiz yo‘q. Vakansiya tanlab ariza yuboring.',
    item: (a, reload) => ApplicationTile(
      api: api,
      a: a,
      reload: reload,
      resultsOnly: resultsOnly,
    ),
  );
}

class ApplicationTile extends StatefulWidget {
  const ApplicationTile({
    super.key,
    required this.api,
    required this.a,
    required this.reload,
    required this.resultsOnly,
  });
  final Api api;
  final Json a;
  final VoidCallback reload;
  final bool resultsOnly;
  @override
  State<ApplicationTile> createState() => _ApplicationTileState();
}

class _ApplicationTileState extends State<ApplicationTile> {
  bool busy = false;
  Future<void> withdraw() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: const AppText('Arizani qaytarib olasizmi?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(c, false),
            child: const AppText('Bekor qilish'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(c, true),
            child: const AppText('Qaytarib olish'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    setState(() => busy = true);
    try {
      await widget.api.request(
        'POST',
        '/candidate/applications/${widget.a['id']}/withdraw',
      );
      widget.reload();
    } catch (e) {
      if (mounted) message(context, errorText(e));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final a = widget.a;
    final s = a['status'] as String;
    return Panel(
      children: [
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
        AppText(
          a['vacancy']['company']['name'],
          style: const TextStyle(color: Colors.black54),
        ),
        AppText(
          a['vacancy']['title'],
          style: Theme.of(context).textTheme.titleLarge,
        ),
        StatusBadge(statusLabels[s] ?? s),
        AppText(
          a['vacancy']['has_assessment'] != true &&
                  ['applied', 'interview_pending'].contains(s)
              ? 'HR: arizangiz bo‘yicha qaror kutilmoqda.'
              : nextAction(s),
        ),
        const SizedBox(height: 12),
        if (!widget.resultsOnly &&
            a['vacancy']['has_assessment'] == true &&
            [
              'applied',
              'interview_pending',
              'stage1_in_progress',
              'stage2_pending',
              'stage2_in_progress',
            ].contains(s))
          OutlinedButton.icon(
            onPressed: () =>
                openWeb(context, '/candidate/interview/${a['id']}'),
            icon: const Icon(Icons.open_in_new),
            label: const AppText('Vebda davom etish'),
          ),
        OutlinedButton(
          onPressed: () => Navigator.push(
            context,
            MaterialPageRoute<void>(
              builder: (_) => ResultsScreen(api: widget.api, id: a['id']),
            ),
          ),
          child: const AppText('Natijalar va izohlar'),
        ),
        if (!widget.resultsOnly && canWithdraw(s))
          TextButton(
            onPressed: busy ? null : withdraw,
            child: AppText(busy ? 'Bajarilmoqda…' : 'Arizani qaytarib olish'),
          ),
      ],
    );
  }
}

class ResultsScreen extends StatelessWidget {
  const ResultsScreen({super.key, required this.api, required this.id});
  final Api api;
  final String id;
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const AppText('Natijalar')),
    body: RemotePage(
      api: api,
      path: '/applications/$id/results',
      pollInterval: (data) => data is Map && data['state'] == 'pending'
          ? const Duration(seconds: 3)
          : null,
      builder: (data, reload) {
        final r = data as Json;
        return ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Panel(
              children: [
                AppText(
                  r['vacancy_title'],
                  style: Theme.of(context).textTheme.headlineSmall,
                ),
                StatusBadge(switch (r['state']) {
                  'done' => 'Natija tayyor',
                  'pending' => 'Baholanmoqda',
                  'failed' => 'HR tekshiruvi kerak',
                  _ => 'Natija hali tayyor emas',
                }),
                if (r['overall_score'] != null)
                  AppText(
                    '${r['overall_score']} / 100',
                    style: const TextStyle(
                      fontSize: 40,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                for (final key in ['stage1_score', 'stage2_score'])
                  if (r[key] != null)
                    AppText(
                      '${key == 'stage1_score' ? 'Amaliy bosqich' : 'AI suhbat'}: ${r[key]}',
                    ),
                if (r['disqualification_reason'] != null)
                  AppText(
                    'Bosqich to‘xtatilgan: ${r['disqualification_reason']}',
                  ),
              ],
            ),
            for (final s in r['per_skill'] ?? [])
              Panel(
                children: [
                  AppText(
                    s['name'],
                    style: const TextStyle(fontWeight: FontWeight.w700),
                  ),
                  AppText('${s['percent']} / 100'),
                ],
              ),
            for (final t in r['tasks'] ?? [])
              Panel(
                children: [
                  AppText(
                    t['title'],
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  AppText(
                    'Testlar: ${t['hidden_passed']} / ${t['hidden_total']}',
                  ),
                  for (final x in t['strengths'] ?? []) AppText('✓ $x'),
                  for (final x in t['weaknesses'] ?? []) AppText('• $x'),
                ],
              ),
            for (final a in r['answers'] ?? [])
              Panel(
                children: [
                  AppText(a['question_text']),
                  if (a['percent'] != null) AppText('${a['percent']} / 100'),
                ],
              ),
            for (final m in r['mistakes'] ?? [])
              Panel(
                children: [
                  const AppText('Yaxshilash uchun'),
                  AppText(m['text']),
                ],
              ),
            for (final l in r['learn_next'] ?? [])
              Panel(
                children: [
                  AppText(
                    l['topic'],
                    style: const TextStyle(fontWeight: FontWeight.w700),
                  ),
                  AppText(l['reason']),
                ],
              ),
            OutlinedButton(
              onPressed: reload,
              child: const AppText('Yangilash'),
            ),
          ],
        );
      },
    ),
  );
}
