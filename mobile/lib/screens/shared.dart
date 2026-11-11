import 'dart:async';
import '../l10n/strings.dart';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../core/api.dart';

String errorText(Object e) {
  final code = e is ApiFailure ? e.code : 'connection_error';
  return switch (code) {
    'invalid_credentials' => 'Email yoki parol noto‘g‘ri.',
    'unauthorized' ||
    'invalid_refresh_token' => 'Sessiya tugadi. Qayta kiring.',
    'already_applied' => 'Bu vakansiyaga ariza yuborgansiz.',
    'vacancy_not_open' => 'Vakansiya arizalar uchun yopilgan.',
    'rate_limited' => 'Juda ko‘p so‘rov. Birozdan keyin qayta urinib ko‘ring.',
    'permission_denied' || 'role_mismatch' => 'Bu amal uchun ruxsat yo‘q.',
    'validation_error' => 'Kiritilgan ma’lumotlarni tekshiring.',
    'unsupported_file_type' => 'PDF, DOC yoki DOCX tanlang.',
    'file_too_large' => 'Fayl hajmi ruxsat etilgan chegaradan katta.',
    'not_found' => 'Ma’lumot topilmadi yoki sizga ruxsat yo‘q.',
    'connection_error' =>
      'Ulanib bo‘lmadi. Internetni tekshirib qayta urining.',
    _ => 'Amal bajarilmadi ($code). Qayta urinib ko‘ring.',
  };
}

void message(BuildContext c, String text) =>
    ScaffoldMessenger.of(c).showSnackBar(SnackBar(content: AppText(text)));
Future<void> openWeb(BuildContext context, String path) async {
  const base = String.fromEnvironment(
    'WEB_BASE_URL',
    defaultValue: 'http://localhost:3000',
  );
  final uri = Uri.parse('$base/uz$path');
  try {
    if (!await launchUrl(uri, mode: LaunchMode.externalApplication)) {
      throw const ApiFailure('connection_error');
    }
  } catch (e) {
    if (context.mounted) message(context, errorText(e));
  }
}

class Panel extends StatelessWidget {
  const Panel({super.key, required this.children});
  final List<Widget> children;
  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.all(18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: children,
      ),
    ),
  );
}

class StatusBadge extends StatelessWidget {
  const StatusBadge(this.text, {super.key});
  final String text;
  @override
  Widget build(BuildContext context) => Align(
    alignment: Alignment.centerLeft,
    child: Chip(
      avatar: const Icon(Icons.circle, size: 12),
      label: AppText(text),
      padding: const EdgeInsets.all(2),
    ),
  );
}

class RemotePage extends StatefulWidget {
  const RemotePage({
    super.key,
    required this.api,
    required this.path,
    required this.builder,
    this.pollInterval,
  });
  final Api api;
  final String path;
  final Widget Function(dynamic, VoidCallback) builder;
  final Duration? Function(dynamic)? pollInterval;
  @override
  State<RemotePage> createState() => _RemotePageState();
}

class _RemotePageState extends State<RemotePage> {
  late Future<dynamic> future;
  Timer? pollTimer;
  int generation = 0;
  @override
  void initState() {
    super.initState();
    reload();
  }

  @override
  void didUpdateWidget(RemotePage old) {
    super.didUpdateWidget(old);
    if (old.path != widget.path || old.api != widget.api) reload();
  }

  void reload() {
    pollTimer?.cancel();
    final current = ++generation;
    future = widget.api.request('GET', widget.path).then((data) {
      if (mounted && current == generation) {
        final delay = widget.pollInterval?.call(data);
        if (delay != null) {
          // Schedule after the response so requests never overlap.
          pollTimer = Timer(delay, () {
            if (mounted && current == generation) setState(reload);
          });
        }
      }
      return data;
    });
  }

  @override
  void dispose() {
    generation++;
    pollTimer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => FutureBuilder<dynamic>(
    future: future,
    builder: (c, s) {
      if (s.hasError) return ErrorPane(s.error!, () => setState(reload));
      if (s.connectionState != ConnectionState.done) {
        return const Center(child: CircularProgressIndicator());
      }
      return RefreshIndicator(
        onRefresh: () async {
          setState(reload);
          try {
            await future;
          } catch (_) {
            /* FutureBuilder renders the error. */
          }
        },
        child: widget.builder(s.data, () => setState(reload)),
      );
    },
  );
}

class ErrorPane extends StatelessWidget {
  const ErrorPane(this.error, this.retry, {super.key});
  final Object error;
  final VoidCallback retry;
  @override
  Widget build(BuildContext context) => Center(
    child: SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.cloud_off, size: 44),
          const SizedBox(height: 16),
          AppText(errorText(error), textAlign: TextAlign.center),
          const SizedBox(height: 16),
          FilledButton(onPressed: retry, child: const AppText('Qayta urinish')),
        ],
      ),
    ),
  );
}

class PagedList extends StatefulWidget {
  const PagedList({
    super.key,
    required this.api,
    required this.path,
    required this.item,
    this.query = const {},
    this.empty = 'Hozircha ma’lumot yo‘q.',
    this.header,
  });
  final Api api;
  final String path;
  final Map<String, dynamic> query;
  final Widget Function(Json, VoidCallback) item;
  final String empty;
  final Widget? header;
  @override
  State<PagedList> createState() => _PagedListState();
}

class _PagedListState extends State<PagedList> {
  final controller = ScrollController();
  List<Json> items = [];
  int page = 0, total = 0;
  bool loading = false;
  Object? error;
  int generation = 0;
  @override
  void initState() {
    super.initState();
    load(reset: true);
  }

  @override
  void didUpdateWidget(PagedList old) {
    super.didUpdateWidget(old);
    if (old.path != widget.path ||
        old.query.toString() != widget.query.toString()) {
      load(reset: true);
    }
  }

  @override
  void dispose() {
    controller.dispose();
    super.dispose();
  }

  Future<void> load({bool reset = false}) async {
    if (loading && !reset) return;
    if (reset) {
      generation++;
      items = [];
      page = 0;
      total = 0;
    }
    final epoch = generation;
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final Json data = await widget.api.request(
        'GET',
        widget.path,
        query: {...widget.query, 'page': page + 1},
      );
      if (!mounted || epoch != generation) return;
      setState(() {
        items.addAll((data['items'] as List).cast<Json>());
        total = data['total'];
        page++;
      });
    } catch (e) {
      if (mounted && epoch == generation) setState(() => error = e);
    } finally {
      if (mounted && epoch == generation) setState(() => loading = false);
    }
  }

  @override
  Widget build(BuildContext context) => RefreshIndicator(
    onRefresh: () => load(reset: true),
    child: ListView(
      controller: controller,
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.all(16),
      children: [
        if (widget.header != null) widget.header!,
        if (error != null) ErrorPane(error!, () => load(reset: items.isEmpty)),
        if (!loading && error == null && items.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 70),
            child: AppText(widget.empty, textAlign: TextAlign.center),
          ),
        ...items.map((item) => widget.item(item, () => load(reset: true))),
        if (loading)
          const Center(
            child: Padding(
              padding: EdgeInsets.all(24),
              child: CircularProgressIndicator(),
            ),
          ),
        if (!loading && items.length < total)
          OutlinedButton(
            onPressed: load,
            child: AppText('Yana yuklash (${items.length}/$total)'),
          ),
      ],
    ),
  );
}
