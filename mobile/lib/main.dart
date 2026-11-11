import 'screens/chat.dart';
import 'l10n/strings.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'core/api.dart';
import 'core/theme.dart';
import 'screens/shared.dart';
import 'screens/vacancies.dart';
import 'screens/applications.dart';
import 'screens/profile.dart';
import 'screens/hr.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(SkillProofApp(api: Api()));
}

class SkillProofApp extends StatefulWidget {
  const SkillProofApp({super.key, required this.api});
  final Api api;
  @override
  State<SkillProofApp> createState() => _SkillProofAppState();
}

class _SkillProofAppState extends State<SkillProofApp> {
  bool ready = false;
  Object? error;
  @override
  void initState() {
    super.initState();
    restore();
  }

  Future<void> restore() async {
    setState(() => error = null);
    try {
      await widget.api.restore();
      if (mounted) setState(() => ready = true);
    } catch (e) {
      if (mounted) setState(() => error = e);
    }
  }

  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: Listenable.merge([widget.api, appLocale]),
    builder: (context, _) => MaterialApp(
      key: ValueKey(widget.api.me?['id'] ?? 'guest'),
      debugShowCheckedModeBanner: false,
      title: 'SkillProof',
      theme: Brand.theme,
      locale: appLocale.value,
      supportedLocales: const [Locale('uz'), Locale('ru'), Locale('en')],
      localizationsDelegates: GlobalMaterialLocalizations.delegates,
      home: !ready
          ? Scaffold(
              body: error != null ? ErrorPane(error!, restore) : const Splash(),
            )
          : widget.api.me == null
          ? LoginScreen(api: widget.api)
          : HomeShell(key: ValueKey(widget.api.me!['id']), api: widget.api),
    ),
  );
}

class Splash extends StatefulWidget {
  const Splash({super.key});
  @override
  State<Splash> createState() => _SplashState();
}

class _SplashState extends State<Splash> with SingleTickerProviderStateMixin {
  late final AnimationController controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 600),
  )..forward();
  @override
  void dispose() {
    controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Center(
    child: MediaQuery.disableAnimationsOf(context)
        ? const SplashMark()
        : FadeTransition(
            opacity: CurvedAnimation(parent: controller, curve: Curves.easeOut),
            child: ScaleTransition(
              scale: Tween<double>(begin: .94, end: 1).animate(controller),
              child: const SplashMark(),
            ),
          ),
  );
}

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key, required this.api});
  final Api api;
  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final form = GlobalKey<FormState>();
  final email = TextEditingController(), password = TextEditingController();
  bool busy = false, hidden = true;
  String? error;
  @override
  void dispose() {
    email.dispose();
    password.dispose();
    super.dispose();
  }

  Future<void> login() async {
    if (!form.currentState!.validate()) return;
    FocusScope.of(context).unfocus();
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await widget.api.login(email.text.trim(), password.text);
    } catch (e) {
      if (mounted) setState(() => error = errorText(e));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    body: SafeArea(
      child: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 480),
            child: Form(
              key: form,
              child: AutofillGroup(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Row(
                      children: [
                        Expanded(child: Logo()),
                        LanguagePicker(),
                      ],
                    ),
                    const SizedBox(height: 50),
                    AppText(
                      'Imkoniyatingizni\nisbotlang.',
                      style: Theme.of(context).textTheme.headlineLarge
                          ?.copyWith(fontWeight: FontWeight.w800),
                    ),
                    const SizedBox(height: 12),
                    const AppText(
                      'Vakansiyalar, arizalaringiz va tasdiqlangan ko‘nikmalar — bir joyda.',
                    ),
                    const SizedBox(height: 32),
                    if (widget.api.expired)
                      const Padding(
                        padding: EdgeInsets.only(bottom: 16),
                        child: AppText(
                          'Sessiya tugadi. Hisobingizga qayta kiring.',
                        ),
                      ),
                    TextFormField(
                      controller: email,
                      keyboardType: TextInputType.emailAddress,
                      autofillHints: const [AutofillHints.username],
                      textInputAction: TextInputAction.next,
                      decoration: InputDecoration(
                        labelText: tr(context, 'Email'),
                        prefixIcon: Icon(Icons.alternate_email),
                      ),
                      validator: (v) => v != null && v.contains('@')
                          ? null
                          : tr(context, 'Email manzilini kiriting'),
                    ),
                    const SizedBox(height: 16),
                    TextFormField(
                      controller: password,
                      obscureText: hidden,
                      autofillHints: const [AutofillHints.password],
                      onFieldSubmitted: (_) {
                        if (!busy) login();
                      },
                      decoration: InputDecoration(
                        labelText: tr(context, 'Parol'),
                        prefixIcon: const Icon(Icons.lock_outline),
                        suffixIcon: IconButton(
                          tooltip: hidden
                              ? 'Parolni ko‘rsatish'
                              : 'Parolni yashirish',
                          onPressed: () => setState(() => hidden = !hidden),
                          icon: Icon(
                            hidden
                                ? Icons.visibility_outlined
                                : Icons.visibility_off_outlined,
                          ),
                        ),
                      ),
                      validator: (v) => v != null && v.isNotEmpty
                          ? null
                          : tr(context, 'Parolni kiriting'),
                    ),
                    if (error != null)
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        child: Semantics(
                          liveRegion: true,
                          child: AppText(
                            error!,
                            style: TextStyle(
                              color: Theme.of(context).colorScheme.error,
                            ),
                          ),
                        ),
                      ),
                    const SizedBox(height: 24),
                    FilledButton(
                      onPressed: busy ? null : login,
                      child: AppText(busy ? 'Kirilmoqda…' : 'Tizimga kirish'),
                    ),
                    const SizedBox(height: 12),
                    TextButton(
                      onPressed: () => openWeb(context, '/register'),
                      child: const AppText('Hisob yaratish · veb'),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    ),
  );
}

class HomeShell extends StatefulWidget {
  const HomeShell({super.key, required this.api});
  final Api api;
  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> with WidgetsBindingObserver {
  int index = 0;
  final revisions = [0, 0, 0, 0];
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      setState(() {
        revisions[1]++;
        revisions[2]++;
        if (!widget.api.candidate) revisions[0]++;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final candidate = widget.api.candidate, hr = widget.api.me?['role'] == 'hr';
    final profileRevision =
        revisions[candidate
            ? 3
            : hr
            ? 2
            : 0];
    final titles = candidate
        ? ['Vakansiyalar', 'Arizalarim', 'Xabarlar', 'Profil']
        : hr
        ? ['Nomzodlar', 'Xabarlar', 'Profil']
        : ['Profil'];
    final icons = candidate
        ? [
            Icons.work_outline,
            Icons.assignment_outlined,
            Icons.chat_bubble_outline,
            Icons.person_outline,
          ]
        : hr
        ? [
            Icons.groups_outlined,
            Icons.chat_bubble_outline,
            Icons.person_outline,
          ]
        : [Icons.person_outline];
    final pages = candidate
        ? <Widget>[
            VacanciesScreen(api: widget.api, revision: revisions[0]),
            ApplicationsScreen(
              key: ValueKey('applications-${revisions[1]}'),
              api: widget.api,
            ),
            ChatInboxScreen(api: widget.api, revision: revisions[2]),
            ProfileScreen(api: widget.api, revision: profileRevision),
          ]
        : hr
        ? <Widget>[
            HrScreen(api: widget.api, revision: revisions[0]),
            ChatInboxScreen(api: widget.api, revision: revisions[1]),
            ProfileScreen(api: widget.api, revision: profileRevision),
          ]
        : <Widget>[ProfileScreen(api: widget.api, revision: profileRevision)];
    return Scaffold(
      appBar: AppBar(
        title: const Logo(),
        actions: [
          const LanguagePicker(),
          IconButton(
            tooltip: 'Yangilash',
            onPressed: () => setState(() => revisions[index]++),
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: SafeArea(
        child: IndexedStack(index: index, children: pages),
      ),
      bottomNavigationBar: titles.length < 2
          ? null
          : NavigationBar(
              selectedIndex: index,
              onDestinationSelected: (v) => setState(() {
                index = v;
                if (widget.api.candidate && (v == 1 || v == 2)) revisions[v]++;
              }),
              destinations: [
                for (var i = 0; i < titles.length; i++)
                  NavigationDestination(
                    icon: Icon(icons[i]),
                    label: tr(context, titles[i]),
                  ),
              ],
            ),
    );
  }
}

class LanguagePicker extends StatelessWidget {
  const LanguagePicker({super.key});
  @override
  Widget build(BuildContext context) => PopupMenuButton<String>(
    tooltip: 'O‘zbekcha / Русский / English',
    icon: const Icon(Icons.language),
    onSelected: (value) => appLocale.value = Locale(value),
    itemBuilder: (_) => const [
      PopupMenuItem(value: 'uz', child: Text('O‘zbekcha')),
      PopupMenuItem(value: 'ru', child: Text('Русский')),
      PopupMenuItem(value: 'en', child: Text('English')),
    ],
  );
}

class SplashMark extends StatelessWidget {
  const SplashMark({super.key});
  @override
  Widget build(BuildContext context) => Stack(
    alignment: Alignment.center,
    children: [
      Container(
        width: 48,
        height: 48,
        decoration: BoxDecoration(
          color: Brand.ink,
          borderRadius: BorderRadius.circular(10),
        ),
        child: const Icon(Icons.check, color: Colors.white, size: 32),
      ),
      Transform.translate(
        offset: const Offset(0, 56),
        child: const Text(
          'SkillProof',
          style: TextStyle(
            fontSize: 23,
            fontWeight: FontWeight.w800,
            color: Brand.ink,
          ),
        ),
      ),
    ],
  );
}
