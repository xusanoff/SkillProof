import 'dart:async';
import 'dart:math';
import 'package:flutter/material.dart';
import '../core/api.dart';
import '../core/flow.dart';
import '../l10n/strings.dart';
import 'shared.dart';

String messageId() {
  final random = Random.secure();
  final b = List.generate(16, (_) => random.nextInt(256));
  b[6] = (b[6] & 15) | 64;
  b[8] = (b[8] & 63) | 128;
  final h = b.map((x) => x.toRadixString(16).padLeft(2, '0')).join();
  return '${h.substring(0, 8)}-${h.substring(8, 12)}-${h.substring(12, 16)}-${h.substring(16, 20)}-${h.substring(20)}';
}

class ChatInboxScreen extends StatefulWidget {
  const ChatInboxScreen({super.key, required this.api, this.revision = 0});
  final Api api;
  final int revision;
  @override
  State<ChatInboxScreen> createState() => _ChatInboxScreenState();
}

class _ChatInboxScreenState extends State<ChatInboxScreen> {
  Timer? timer;
  final records = <String, Json>{};
  int page = 0, total = 0;
  bool busy = false;
  Object? error;
  @override
  void initState() {
    super.initState();
    load();
    timer = Timer.periodic(const Duration(seconds: 5), (_) {
      if (WidgetsBinding.instance.lifecycleState == AppLifecycleState.resumed) {
        load(refresh: true);
      }
    });
  }

  @override
  void didUpdateWidget(ChatInboxScreen old) {
    super.didUpdateWidget(old);
    if (old.revision != widget.revision) load(refresh: true);
  }

  @override
  void dispose() {
    timer?.cancel();
    super.dispose();
  }

  Future<void> load({bool refresh = false}) async {
    if (busy) return;
    setState(() => busy = true);
    try {
      final Json r = await widget.api.request(
        'GET',
        '/chat/threads',
        query: {'page': refresh ? 1 : page + 1},
      );
      if (!mounted) return;
      setState(() {
        for (final item in r['items']) {
          records[item['application_id']] = item;
        }
        total = r['total'];
        if (!refresh) page++;
        error = null;
      });
    } catch (e) {
      if (mounted) setState(() => error = e);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final items = records.values.toList()
      ..sort(
        (a, b) => (b['last_message']?['sequence'] as int? ?? 0).compareTo(
          a['last_message']?['sequence'] as int? ?? 0,
        ),
      );
    return RefreshIndicator(
      onRefresh: () => load(refresh: true),
      child: ListView(
        padding: const EdgeInsets.all(16),
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          if (error != null) ErrorPane(error!, () => load(refresh: true)),
          if (!busy && error == null && items.isEmpty)
            const Panel(
              children: [
                AppText(
                  'Hozircha yozishmalar yo‘q. Ariza yuborilgach chat ochiladi.',
                ),
              ],
            ),
          for (final item in items)
            Card(
              child: ListTile(
                minVerticalPadding: 18,
                title: AppText(
                  widget.api.candidate
                      ? item['company_name']
                      : item['candidate_name'],
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
                subtitle: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    AppText(item['vacancy_title']),
                    AppText(
                      statusLabels[item['application_status']] ??
                          item['application_status'],
                    ),
                    if (item['unread_count'] > 0)
                      AppText('O‘qilmagan xabarlar: ${item['unread_count']}'),
                  ],
                ),
                trailing: const Icon(Icons.chevron_right),
                onTap: () async {
                  await Navigator.push(
                    context,
                    MaterialPageRoute<void>(
                      builder: (_) => ChatScreen(
                        api: widget.api,
                        id: item['application_id'],
                      ),
                    ),
                  );
                  load(refresh: true);
                },
              ),
            ),
          if (busy)
            const Center(
              child: Padding(
                padding: EdgeInsets.all(16),
                child: CircularProgressIndicator(),
              ),
            ),
          if (!busy && records.length < total)
            OutlinedButton(
              onPressed: load,
              child: const AppText('Yana yuklash'),
            ),
        ],
      ),
    );
  }
}

class ChatScreen extends StatefulWidget {
  const ChatScreen({super.key, required this.api, required this.id});
  final Api api;
  final String id;
  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> with WidgetsBindingObserver {
  final text = TextEditingController(), scroll = ScrollController();
  final items = <Json>[];
  Json? thread;
  Timer? timer;
  bool loading = false, sending = false, older = false, hasMore = false;
  Object? error;
  String? retryId;
  int readThrough = 0, pendingReadThrough = 0;
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) ScaffoldMessenger.of(context).removeCurrentSnackBar();
    });
    load();
    timer = Timer.periodic(const Duration(seconds: 3), (_) {
      if (WidgetsBinding.instance.lifecycleState == AppLifecycleState.resumed &&
          ModalRoute.of(context)?.isCurrent == true) {
        load();
      }
    });
  }

  @override
  void dispose() {
    timer?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    text.dispose();
    scroll.dispose();
    super.dispose();
  }

  Future<void> load({bool history = false}) async {
    if (loading || older) return;
    if (history) {
      setState(() => older = true);
    } else {
      setState(() => loading = true);
    }
    final atBottom =
        !scroll.hasClients ||
        scroll.position.maxScrollExtent - scroll.offset < 100;
    final oldExtent = scroll.hasClients ? scroll.position.maxScrollExtent : 0.0;
    try {
      final Json r = await widget.api.request(
        'GET',
        '/chat/threads/${widget.id}/messages',
        query: {
          if (history && items.isNotEmpty) 'before': items.first['sequence'],
          if (!history && items.isNotEmpty) 'after': items.last['sequence'],
        },
      );
      if (!mounted) return;
      final merged = {
        for (final m in items) m['sequence']: m,
        for (final m in r['items']) m['sequence']: m,
      };
      setState(() {
        thread = r['thread'];
        items
          ..clear()
          ..addAll(
            merged.values.cast<Json>().toList()..sort(
              (a, b) => (a['sequence'] as int).compareTo(b['sequence'] as int),
            ),
          );
        if (history || oldExtent == 0) hasMore = r['has_more'];
        error = null;
      });
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted || !scroll.hasClients) return;
        if (history) {
          scroll.jumpTo(
            (scroll.position.maxScrollExtent - oldExtent + scroll.offset).clamp(
              0,
              scroll.position.maxScrollExtent,
            ),
          );
        } else if (atBottom) {
          scroll.jumpTo(scroll.position.maxScrollExtent);
          markRead();
        }
      });
    } catch (e) {
      if (mounted) setState(() => error = e);
    } finally {
      if (mounted) {
        setState(() {
          loading = false;
          older = false;
        });
      }
    }
  }

  Future<void> markRead() async {
    if (items.isEmpty) return;
    final seq = items.last['sequence'] as int;
    if (seq <= max(readThrough, pendingReadThrough)) return;
    pendingReadThrough = seq;
    try {
      await widget.api.request(
        'POST',
        '/chat/threads/${widget.id}/read',
        data: {'through_sequence': seq},
      );
      readThrough = max(readThrough, seq);
    } catch (_) {
      /* Retry after the next successful fetch. */
    } finally {
      if (pendingReadThrough == seq) pendingReadThrough = 0;
    }
  }

  Future<void> send() async {
    if (sending || text.text.trim().isEmpty) return;
    setState(() => sending = true);
    retryId ??= messageId();
    try {
      await widget.api.request(
        'POST',
        '/chat/threads/${widget.id}/messages',
        data: {'text': text.text.trim(), 'client_id': retryId},
      );
      if (mounted) {
        text.clear();
        retryId = null;
        await load();
      }
    } catch (e) {
      if (mounted) {
        setState(() => error = e);
        message(context, errorText(e));
      }
    } finally {
      if (mounted) setState(() => sending = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const AppText('Xabarlar')),
    body: SafeArea(
      child: Column(
        children: [
          Expanded(
            child: NotificationListener<ScrollNotification>(
              onNotification: (n) {
                if (scroll.hasClients &&
                    scroll.position.maxScrollExtent - scroll.offset < 50) {
                  markRead();
                }
                return false;
              },
              child: ListView(
                controller: scroll,
                padding: const EdgeInsets.all(16),
                children: [
                  if (thread != null)
                    Panel(
                      children: [
                        AppText(
                          widget.api.candidate
                              ? thread!['company_name']
                              : thread!['candidate_name'],
                          style: Theme.of(context).textTheme.titleLarge,
                        ),
                        AppText(thread!['vacancy_title']),
                        StatusBadge(
                          statusLabels[thread!['application_status']] ??
                              thread!['application_status'],
                        ),
                        if (thread!['cover_note'] != null)
                          AppText(thread!['cover_note']),
                      ],
                    ),
                  if (error != null) ErrorPane(error!, load),
                  if (loading && items.isEmpty)
                    const Center(child: CircularProgressIndicator()),
                  if (hasMore)
                    OutlinedButton(
                      onPressed: older ? null : () => load(history: true),
                      child: const AppText('Oldingi xabarlar'),
                    ),
                  for (final m in items)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: m['kind'] == 'status'
                          ? Center(
                              child: StatusBadge(
                                statusLabels[m['application_status']] ??
                                    m['application_status'],
                              ),
                            )
                          : Align(
                              alignment: m['sender_id'] == widget.api.me?['id']
                                  ? Alignment.centerRight
                                  : Alignment.centerLeft,
                              child: ConstrainedBox(
                                constraints: BoxConstraints(
                                  maxWidth:
                                      MediaQuery.sizeOf(context).width * .85,
                                ),
                                child: Card(
                                  child: Padding(
                                    padding: const EdgeInsets.all(12),
                                    child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        AppText(m['text'] ?? ''),
                                        const SizedBox(height: 4),
                                        AppText(
                                          localDate(m['created_at']),
                                          style: Theme.of(
                                            context,
                                          ).textTheme.labelSmall,
                                        ),
                                      ],
                                    ),
                                  ),
                                ),
                              ),
                            ),
                    ),
                ],
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                TextField(
                  controller: text,
                  minLines: 1,
                  maxLines: 2,
                  maxLength: 4000,
                  enabled: !sending && thread != null,
                  onChanged: (_) => retryId = null,
                  decoration: InputDecoration(
                    labelText: tr(context, 'Xabaringizni yozing'),
                  ),
                ),
                const SizedBox(height: 8),
                FilledButton.icon(
                  onPressed: sending || thread == null ? null : send,
                  icon: Icon(sending ? Icons.hourglass_empty : Icons.send),
                  label: AppText(sending ? 'Yuborilmoqda…' : 'Yuborish'),
                ),
              ],
            ),
          ),
        ],
      ),
    ),
  );
}
