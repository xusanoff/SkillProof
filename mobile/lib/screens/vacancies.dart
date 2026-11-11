import '../l10n/strings.dart';
import 'package:flutter/material.dart';
import '../core/api.dart';
import '../core/flow.dart';
import '../core/theme.dart';
import 'shared.dart';

class VacanciesScreen extends StatefulWidget {
  const VacanciesScreen({super.key, required this.api, this.revision = 0});
  final int revision;
  final Api api;
  @override
  State<VacanciesScreen> createState() => _VacanciesScreenState();
}

class _VacanciesScreenState extends State<VacanciesScreen> {
  final search = TextEditingController();
  String q = '', remote = '';
  bool saved = false;
  @override
  void dispose() {
    search.dispose();
    super.dispose();
  }

  Future<void> filters() async {
    final value = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (c) => SafeArea(
        child: SingleChildScrollView(
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                AppText(
                  'Ish formati',
                  style: Theme.of(c).textTheme.headlineSmall,
                ),
                for (final entry in {'': 'Barchasi', ...formats}.entries)
                  ListTile(
                    minVerticalPadding: 14,
                    leading: Icon(
                      remote == entry.key
                          ? Icons.radio_button_checked
                          : Icons.radio_button_off,
                    ),
                    title: AppText(entry.value),
                    onTap: () => Navigator.pop(c, entry.key),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
    if (value != null && mounted) setState(() => remote = value);
  }

  @override
  Widget build(BuildContext context) => PagedList(
    header: Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const AppText(
            'Keyingi imkoniyatingiz',
            style: TextStyle(
              fontSize: 28,
              fontWeight: FontWeight.w800,
              color: Brand.ink,
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: search,
            onSubmitted: (v) => setState(() => q = v.trim()),
            textInputAction: TextInputAction.search,
            decoration: InputDecoration(
              labelText: tr(context, 'Lavozim, ko‘nikma yoki kompaniya'),
              prefixIcon: const Icon(Icons.search),
              suffixIcon: IconButton(
                tooltip: 'Qidirish',
                onPressed: () => setState(() => q = search.text.trim()),
                icon: const Icon(Icons.arrow_forward),
              ),
            ),
          ),
          Wrap(
            spacing: 8,
            children: [
              ActionChip(
                avatar: const Icon(Icons.tune),
                label: const AppText('Filtrlar'),
                onPressed: saved ? null : filters,
              ),
              if (remote.isNotEmpty)
                InputChip(
                  label: AppText(formats[remote]!),
                  onDeleted: () => setState(() => remote = ''),
                ),
              if (widget.api.candidate)
                FilterChip(
                  label: const AppText('Saqlanganlar'),
                  selected: saved,
                  onSelected: (v) => setState(() => saved = v),
                ),
            ],
          ),
        ],
      ),
    ),
    key: ValueKey(widget.revision),
    api: widget.api,
    path: saved ? '/candidate/saved-vacancies' : '/vacancies',
    query: saved
        ? {}
        : {
            if (q.isNotEmpty) 'q': q,
            if (remote.isNotEmpty) 'remote_type': remote,
          },
    empty: 'Mos vakansiya topilmadi. Qidiruv yoki filtrni o‘zgartiring.',
    item: (v, reload) => VacancyTile(
      v,
      onTap: () async {
        await Navigator.push(
          context,
          MaterialPageRoute<void>(
            builder: (_) => VacancyDetail(api: widget.api, id: v['id']),
          ),
        );
        if (saved && mounted) reload();
      },
    ),
  );
}

class VacancyTile extends StatelessWidget {
  const VacancyTile(this.v, {super.key, required this.onTap});
  final Json v;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) => Card(
    child: InkWell(
      borderRadius: BorderRadius.circular(20),
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.business_outlined, size: 20),
                const SizedBox(width: 8),
                Expanded(
                  child: AppText(
                    v['company']['name'],
                    style: const TextStyle(color: Colors.black54),
                  ),
                ),
                if (v['company']['is_verified'] == true)
                  const Icon(Icons.verified, color: Brand.accent, size: 18),
              ],
            ),
            const SizedBox(height: 12),
            AppText(
              v['title'],
              style: const TextStyle(fontSize: 21, fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 8),
            AppText(
              salary(v),
              style: const TextStyle(
                fontWeight: FontWeight.w600,
                color: Brand.accent,
              ),
            ),
            const SizedBox(height: 8),
            AppText(
              '${formats[v['remote_type']] ?? v['remote_type']} · ${v['city'] ?? v['region_code'] ?? ''}',
            ),
            if (v['has_assessment'] == true)
              const Padding(
                padding: EdgeInsets.only(top: 12),
                child: AppText(
                  'Amaliy baholash · kompyuter kerak',
                  style: TextStyle(fontSize: 12),
                ),
              ),
          ],
        ),
      ),
    ),
  );
}

class VacancyDetail extends StatefulWidget {
  const VacancyDetail({super.key, required this.api, required this.id});
  final Api api;
  final String id;
  @override
  State<VacancyDetail> createState() => _VacancyDetailState();
}

class _VacancyDetailState extends State<VacancyDetail> {
  final note = TextEditingController();
  bool sending = false, saving = false;
  Json? application;
  bool? saved;
  @override
  void dispose() {
    note.dispose();
    super.dispose();
  }

  Future<void> apply() async {
    setState(() => sending = true);
    try {
      final Json a = await widget.api.request(
        'POST',
        '/vacancies/${widget.id}/apply',
        data: {'cover_note': note.text},
      );
      if (mounted) {
        setState(() => application = a);
        message(
          context,
          'Ariza yuborildi. Holatni Arizalarim bo‘limida kuzating.',
        );
      }
    } catch (e) {
      if (mounted) message(context, errorText(e));
    } finally {
      if (mounted) setState(() => sending = false);
    }
  }

  Future<void> toggleSaved(bool current) async {
    setState(() => saving = true);
    try {
      await widget.api.request(
        current ? 'DELETE' : 'PUT',
        '/candidate/saved-vacancies/${widget.id}',
      );
      if (mounted) setState(() => saved = !current);
    } catch (e) {
      if (mounted) message(context, errorText(e));
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const AppText('Vakansiya')),
    body: RemotePage(
      api: widget.api,
      path: '/vacancies/${widget.id}',
      builder: (data, reload) {
        final v = data as Json;
        final hasApplied =
            application != null ||
            (v['viewer']?['application_status'] != null &&
                v['viewer']?['application_status'] != 'withdrawn');
        final current = saved ?? v['viewer']?['is_saved'] == true;
        return Scaffold(
          body: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Panel(
                children: [
                  AppText(
                    v['company']['name'],
                    style: const TextStyle(color: Colors.black54),
                  ),
                  const SizedBox(height: 10),
                  AppText(
                    v['title'],
                    style: Theme.of(context).textTheme.headlineMedium,
                  ),
                  const SizedBox(height: 12),
                  AppText(
                    salary(v),
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                  StatusBadge(formats[v['remote_type']] ?? v['remote_type']),
                  if (widget.api.candidate)
                    OutlinedButton.icon(
                      onPressed: saving ? null : () => toggleSaved(current),
                      icon: Icon(
                        current ? Icons.bookmark : Icons.bookmark_border,
                      ),
                      label: AppText(current ? 'Saqlangan' : 'Saqlash'),
                    ),
                ],
              ),
              Panel(
                children: [
                  const AppText(
                    'VAKANSIYA HAQIDA',
                    style: TextStyle(fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 12),
                  SelectableText(v['description'] ?? ''),
                  if (v['requirements'] != null) ...[
                    const SizedBox(height: 16),
                    const AppText(
                      'Talablar',
                      style: TextStyle(fontWeight: FontWeight.w700),
                    ),
                    SelectableText(v['requirements']),
                  ],
                  Wrap(
                    spacing: 6,
                    children: [
                      for (final s in v['skills'])
                        Chip(label: AppText(s['name'])),
                    ],
                  ),
                ],
              ),
              if (v['has_assessment'] == true)
                const Panel(
                  children: [
                    Icon(Icons.computer_outlined),
                    SizedBox(height: 8),
                    AppText(
                      'Ariza berishdan oldin: amaliy topshiriqni kompyuterda bajarish kerak. Keyingi AI suhbatni mavjud veb ilovada telefonda ham davom ettirish mumkin.',
                    ),
                  ],
                ),
              if (widget.api.candidate && !hasApplied)
                TextField(
                  controller: note,
                  minLines: 3,
                  maxLines: 6,
                  maxLength: 3000,
                  decoration: InputDecoration(
                    labelText: tr(context, 'HR uchun xabar (ixtiyoriy)'),
                  ),
                ),
              const SizedBox(height: 16),
            ],
          ),
          bottomNavigationBar: Padding(
            padding: const EdgeInsets.all(16),
            child: widget.api.candidate
                ? SafeArea(
                    top: false,
                    child: FilledButton.icon(
                      onPressed: sending || hasApplied ? null : apply,
                      icon: Icon(hasApplied ? Icons.check_circle : Icons.send),
                      label: AppText(
                        sending
                            ? 'Yuborilmoqda…'
                            : hasApplied
                            ? 'Ariza yuborilgan'
                            : 'Ariza berish',
                      ),
                    ),
                  )
                : const Panel(
                    children: [
                      AppText(
                        'Ariza yuborish uchun nomzod hisobi bilan kiring.',
                      ),
                    ],
                  ),
          ),
        );
      },
    ),
  );
}
