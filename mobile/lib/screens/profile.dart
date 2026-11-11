import 'applications.dart';
import '../core/flow.dart';
import 'dart:typed_data';
import '../l10n/strings.dart';
import 'package:dio/dio.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import '../core/api.dart';
import 'shared.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key, required this.api, this.revision = 0});
  final int revision;
  final Api api;
  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  final headline = TextEditingController(),
      about = TextEditingController(),
      city = TextEditingController();
  Json? profile;
  bool busy = false;
  Object? error;
  @override
  void initState() {
    super.initState();
    load();
  }

  @override
  void didUpdateWidget(ProfileScreen old) {
    super.didUpdateWidget(old);
    if (old.revision != widget.revision) load();
  }

  @override
  void dispose() {
    headline.dispose();
    about.dispose();
    city.dispose();
    super.dispose();
  }

  Future<void> load() async {
    if (!widget.api.candidate) return;
    try {
      final Json p = await widget.api.request('GET', '/candidate/profile');
      if (mounted) {
        setState(() {
          profile = p;
          headline.text = p['headline'] ?? '';
          about.text = p['about'] ?? '';
          city.text = p['city'] ?? '';
          error = null;
        });
      }
    } catch (e) {
      if (mounted) setState(() => error = e);
    }
  }

  Future<void> action(Future<void> Function() run) async {
    setState(() => busy = true);
    try {
      await run();
      if (mounted) message(context, 'Saqlandi.');
    } catch (e) {
      if (mounted) message(context, errorText(e));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> save() async {
    final Json p = await widget.api.request(
      'PUT',
      '/candidate/profile',
      data: {
        ...(Map<String, dynamic>.from(profile!)..remove('resume')),
        'headline': headline.text,
        'about': about.text,
        'city': city.text,
      },
    );
    if (mounted) setState(() => profile = p);
  }

  Future<void> upload() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: ['pdf', 'doc', 'docx'],
      withData: true,
    );
    if (result == null) return;
    final f = result.files.single;
    if (f.size > 5 * 1024 * 1024) throw const ApiFailure('file_too_large');
    final Json p = await widget.api.request(
      'POST',
      '/candidate/profile/resume',
      data: FormData.fromMap({
        'file': MultipartFile.fromBytes(f.bytes!, filename: f.name),
      }),
    );
    if (mounted) setState(() => profile = p);
  }

  @override
  Widget build(BuildContext context) {
    if (!widget.api.candidate) {
      return ListView(padding: const EdgeInsets.all(16), children: [account()]);
    }
    if (error != null) return ErrorPane(error!, load);
    if (profile == null) {
      return const Center(child: CircularProgressIndicator());
    }
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        account(),
        OutlinedButton(
          onPressed: () => Navigator.push(
            context,
            MaterialPageRoute<void>(
              builder: (_) => Scaffold(
                appBar: AppBar(title: const AppText('Natijalar')),
                body: ApplicationsScreen(api: widget.api, resultsOnly: true),
              ),
            ),
          ),
          child: const AppText('Natijalar'),
        ),
        Panel(
          children: [
            TextField(
              controller: headline,
              decoration: InputDecoration(
                labelText: tr(context, 'Kasbiy sarlavha'),
              ),
              maxLength: 200,
            ),
            const SizedBox(height: 12),
            TextField(
              controller: city,
              decoration: InputDecoration(labelText: tr(context, 'Shahar')),
              maxLength: 120,
            ),
            const SizedBox(height: 12),
            TextField(
              controller: about,
              decoration: InputDecoration(
                labelText: tr(context, 'O‘zingiz haqingizda'),
              ),
              minLines: 3,
              maxLines: 8,
              maxLength: 5000,
            ),
            FilledButton(
              onPressed: busy ? null : () => action(save),
              child: AppText(busy ? 'Saqlanmoqda…' : 'Profilni saqlash'),
            ),
          ],
        ),
        Panel(
          children: [
            const AppText(
              'REZYUME',
              style: TextStyle(fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 8),
            AppText(profile?['resume']?['filename'] ?? 'Rezyume yuklanmagan'),
            const SizedBox(height: 8),
            OutlinedButton.icon(
              onPressed: busy ? null : () => action(upload),
              icon: const Icon(Icons.upload_file),
              label: const AppText('CV yuklash · PDF / DOC / DOCX'),
            ),
            if (profile?['resume'] != null)
              OutlinedButton.icon(
                icon: const Icon(Icons.download),
                label: const AppText('CVni yuklab olish'),
                onPressed: busy
                    ? null
                    : () => action(() async {
                        final List<int> bytes =
                            (await widget.api.request(
                                      'GET',
                                      '/candidate/profile/resume',
                                      responseType: ResponseType.bytes,
                                    )
                                    as List)
                                .cast<int>();
                        await FilePicker.platform.saveFile(
                          fileName: profile!['resume']['filename'],
                          bytes: Uint8List.fromList(bytes),
                        );
                      }),
              ),
            if (profile?['resume'] != null)
              TextButton(
                onPressed: busy
                    ? null
                    : () => action(() async {
                        await widget.api.request(
                          'DELETE',
                          '/candidate/profile/resume',
                        );
                        if (mounted) setState(() => profile!['resume'] = null);
                      }),
                child: const AppText('CVni o‘chirish'),
              ),
          ],
        ),
        OutlinedButton.icon(
          onPressed: () => Navigator.push(
            context,
            MaterialPageRoute<void>(
              builder: (_) => SkillsScreen(api: widget.api),
            ),
          ),
          icon: const Icon(Icons.verified_outlined),
          label: const AppText('Tasdiqlangan ko‘nikmalar'),
        ),
      ],
    );
  }

  Widget account() => Panel(
    children: [
      AppText(
        widget.api.me?['full_name'] ?? '',
        style: Theme.of(context).textTheme.headlineSmall,
      ),
      AppText(widget.api.me?['email'] ?? ''),
      const SizedBox(height: 12),
      const AppText(
        'Veb suhbat tashqi brauzerda ochiladi. U yerda alohida tizimga kirish talab qilinishi mumkin.',
      ),
      const SizedBox(height: 12),
      OutlinedButton(
        onPressed: busy ? null : () => action(widget.api.logout),
        child: const AppText('Hisobdan chiqish'),
      ),
    ],
  );
}

class SkillsScreen extends StatelessWidget {
  const SkillsScreen({super.key, required this.api});
  final Api api;
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const AppText('Tasdiqlangan ko‘nikmalar')),
    body: RemotePage(
      api: api,
      path: '/candidate/verified-skills',
      builder: (data, reload) => ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if ((data as List).isEmpty)
            const AppText('Hali tasdiqlangan ko‘nikmalar yo‘q.'),
          for (final s in data) SkillTile(api: api, s: s, reload: reload),
        ],
      ),
    ),
  );
}

class SkillTile extends StatefulWidget {
  const SkillTile({
    super.key,
    required this.api,
    required this.s,
    required this.reload,
  });
  final Api api;
  final Json s;
  final VoidCallback reload;
  @override
  State<SkillTile> createState() => _SkillTileState();
}

class _SkillTileState extends State<SkillTile> {
  bool busy = false;
  Future<void> toggle(bool value) async {
    setState(() => busy = true);
    try {
      await widget.api.request(
        'PATCH',
        '/candidate/verified-skills/${widget.s['id']}',
        data: {'is_public': value},
      );
      widget.reload();
    } catch (e) {
      if (mounted) message(context, errorText(e));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Panel(
    children: [
      AppText(widget.s['name'], style: Theme.of(context).textTheme.titleLarge),
      AppText('${widget.s['score']} / 100 · ${widget.s['level']}'),
      AppText(
        widget.s['is_valid'] == true
            ? 'Amal qiladi: ${localDate(widget.s['valid_until'])}'
            : 'Amal qilish muddati tugagan',
      ),
      SwitchListTile(
        contentPadding: EdgeInsets.zero,
        title: const AppText('Ommaviy profilda ko‘rsatish'),
        value: widget.s['is_public'],
        onChanged: busy ? null : toggle,
      ),
    ],
  );
}
