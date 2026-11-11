import 'package:flutter/material.dart';
import '../core/api.dart';
import '../l10n/strings.dart';
import 'shared.dart';
import 'vacancy_wizard.dart';

class QuestionBankScreen extends StatefulWidget {
  const QuestionBankScreen({
    super.key,
    required this.api,
    required this.companyId,
  });
  final Api api;
  final String companyId;
  @override
  State<QuestionBankScreen> createState() => _QuestionBankScreenState();
}

class _QuestionBankScreenState extends State<QuestionBankScreen> {
  int revision = 0;
  String query = '';
  final search = TextEditingController();
  @override
  void dispose() {
    search.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const AppText('Savollar banki')),
    body: PagedList(
      key: ValueKey(revision),
      api: widget.api,
      path: '/companies/${widget.companyId}/questions',
      query: {'include_global': true, if (query.isNotEmpty) 'q': query},
      header: TextField(
        controller: search,
        textInputAction: TextInputAction.search,
        onSubmitted: (v) => setState(() => query = v.trim()),
        decoration: InputDecoration(
          labelText: tr(context, 'Bankdan qidirish'),
          suffixIcon: IconButton(
            tooltip: tr(context, 'Qidirish'),
            onPressed: () => setState(() => query = search.text.trim()),
            icon: const Icon(Icons.search),
          ),
        ),
      ),
      item: (q, reload) => Panel(
        children: [
          AppText(q['text'], style: Theme.of(context).textTheme.titleMedium),
          Text(
            '${q['language']} · ${tr(context, q['is_approved'] == true ? 'Tasdiqlangan' : 'Tasdiqlanmagan')}',
          ),
          if (q['company_id'] == widget.companyId)
            ApproveQuestion(
              api: widget.api,
              companyId: widget.companyId,
              q: q,
              reload: reload,
            ),
        ],
      ),
    ),
    floatingActionButton: FloatingActionButton.extended(
      onPressed: () async {
        final q = await Navigator.push<Json>(
          context,
          MaterialPageRoute(
            builder: (_) => NewQuestionScreen(
              api: widget.api,
              companyId: widget.companyId,
              language: appLocale.value.languageCode,
            ),
          ),
        );
        if (q != null && mounted) setState(() => revision++);
      },
      icon: const Icon(Icons.add),
      label: const AppText('Yangi savol qo‘shish'),
    ),
  );
}

class ApproveQuestion extends StatefulWidget {
  const ApproveQuestion({
    super.key,
    required this.api,
    required this.companyId,
    required this.q,
    required this.reload,
  });
  final Api api;
  final String companyId;
  final Json q;
  final VoidCallback reload;
  @override
  State<ApproveQuestion> createState() => _ApproveQuestionState();
}

class _ApproveQuestionState extends State<ApproveQuestion> {
  bool busy = false;
  Future<void> approve() async {
    setState(() => busy = true);
    try {
      await widget.api.request(
        'POST',
        '/companies/${widget.companyId}/questions/${widget.q['id']}/approve',
        data: {'approved': true},
      );
      widget.reload();
    } catch (e) {
      if (mounted) message(context, errorText(e));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => widget.q['is_approved'] == true
      ? const SizedBox.shrink()
      : OutlinedButton(
          onPressed: busy ? null : approve,
          child: const AppText('Tasdiqlash'),
        );
}
