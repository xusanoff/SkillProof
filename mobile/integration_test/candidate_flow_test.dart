import 'package:skillproof_mobile/screens/chat.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:skillproof_mobile/core/api.dart';
import 'package:skillproof_mobile/main.dart';
import 'package:skillproof_mobile/l10n/strings.dart';

class MemoryStore implements SessionStore {
  String? value;
  @override
  Future<String?> read() async => value;
  @override
  Future<void> write(String v) async {
    value = v;
  }

  @override
  Future<void> clear() async {
    value = null;
  }
}

void main() {
  final binding = IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  testWidgets(
    'real device: login search detail apply track HR update and return',
    (tester) async {
      const base = String.fromEnvironment(
        'API_BASE_URL',
        defaultValue: 'http://10.0.2.2:8000',
      );
      const password = String.fromEnvironment('TEST_PASSWORD');
      expect(
        password,
        isNotEmpty,
        reason: 'Pass --dart-define=TEST_PASSWORD for local seeded backend',
      );
      final hr = Api(
        client: Dio(
          BaseOptions(
            baseUrl: base,
            connectTimeout: const Duration(seconds: 10),
            receiveTimeout: const Duration(seconds: 20),
          ),
        ),
        store: MemoryStore(),
      );
      await tester.runAsync(
        () => hr.login(
          const String.fromEnvironment(
            'TEST_HR',
            defaultValue: 'demo.hr@example.com',
          ),
          password,
        ),
      );
      final cid = hr.me!['companies'][0]['id'];
      final title = 'Flutter device ${DateTime.now().millisecondsSinceEpoch}';
      final Json v = await tester.runAsync(
        () => hr.request(
          'POST',
          '/companies/$cid/vacancies',
          data: {
            'title': title,
            'description': 'Real device integration check',
            'remote_type': 'remote',
            'employment_type': 'full_time',
            'experience_level': 'between_1_3',
          },
        ),
      );
      final vid = v['id'];
      await tester.runAsync(
        () => hr.request(
          'PATCH',
          '/companies/$cid/vacancies/$vid',
          data: {'status': 'published'},
        ),
      );
      final api = Api(
        client: Dio(
          BaseOptions(
            baseUrl: base,
            connectTimeout: const Duration(seconds: 10),
            receiveTimeout: const Duration(seconds: 20),
          ),
        ),
      );
      await tester.runAsync(() => api.store.clear());
      appLocale.value = const Locale('uz');
      Future<void> until(Finder finder) async {
        for (var i = 0; i < 150; i++) {
          await tester.pump(const Duration(milliseconds: 200));
          if (finder.evaluate().isNotEmpty) return;
        }
        throw StateError('Not found: $finder');
      }

      bool converted = false;
      Future<void> capture(String name) async {
        await tester.pumpAndSettle();
        if (!converted) {
          await binding.convertFlutterSurfaceToImage();
          converted = true;
          await tester.pump();
        }
        await binding.takeScreenshot(name);
      }

      try {
        await tester.pumpWidget(SkillProofApp(api: api));
        await until(find.byType(LoginScreen));
        await capture('login');
        await tester.enterText(
          find.byType(TextFormField).first,
          const String.fromEnvironment(
            'TEST_CANDIDATE',
            defaultValue: 'demo.candidate@example.com',
          ),
        );
        await tester.enterText(find.byType(TextFormField).last, password);
        await tester.ensureVisible(find.text('Tizimga kirish'));
        await tester.tap(find.text('Tizimga kirish'));
        await until(find.text('Keyingi imkoniyatingiz'));
        await tester.enterText(find.byType(TextField).first, title);
        await tester.tap(find.byTooltip('Qidirish'));
        await until(find.widgetWithText(Card, title));
        await tester.tap(find.widgetWithText(Card, title));
        await until(find.text('Ariza berish'));
        await capture('vacancy-detail');
        await tester.enterText(
          find.byType(TextField).first,
          'Mobil qurilmadan yuborilgan test ariza',
        );
        await tester.tap(find.text('Ariza berish'));
        await until(find.text('Ariza yuborilgan'));
        expect(find.text('Ariza yuborilgan'), findsOneWidget);
        await tester.tap(find.byType(BackButton));
        await tester.pumpAndSettle();
        expect(find.text(title), findsWidgets);
        await tester.tap(find.text('Arizalarim'));
        await until(find.text('Ariza yuborildi'));
        final Json applications = await tester.runAsync(
          () => api.request('GET', '/candidate/applications'),
        );
        final a = (applications['items'] as List).firstWhere(
          (a) => a['vacancy']['id'] == vid,
        );
        await tester.tap(
          find.descendant(
            of: find.widgetWithText(Card, title),
            matching: find.text('Chatni ochish'),
          ),
        );
        await until(find.byType(ChatScreen));
        await until(find.text('Mobil qurilmadan yuborilgan test ariza'));
        await until(find.byType(TextField));
        await tester.pumpAndSettle();
        const candidateMessage = 'Native candidate question';
        await tester.enterText(find.byType(TextField), candidateMessage);
        await tester.pumpAndSettle();
        await tester.runAsync(
          () => Future<void>.delayed(const Duration(milliseconds: 800)),
        );
        await tester.pumpAndSettle();
        final sendButton = find.widgetWithText(FilledButton, 'Yuborish');
        await tester.ensureVisible(sendButton);
        expect(tester.widget<FilledButton>(sendButton).onPressed, isNotNull);
        await tester.tap(sendButton);
        for (var i = 0; i < 100; i++) {
          await tester.pump(const Duration(milliseconds: 100));
          if (tester
              .widget<TextField>(find.byType(TextField))
              .controller!
              .text
              .isEmpty) {
            break;
          }
        }
        expect(
          tester.widget<TextField>(find.byType(TextField)).controller!.text,
          isEmpty,
        );
        expect(find.text(candidateMessage), findsOneWidget);
        final Json delivered = await tester.runAsync(
          () => hr.request('GET', '/chat/threads/${a['id']}/messages'),
        );
        expect(
          (delivered['items'] as List)
              .where((m) => m['text'] == candidateMessage)
              .length,
          1,
        );
        await tester.runAsync(
          () => hr.request(
            'POST',
            '/chat/threads/${a['id']}/messages',
            data: {'text': 'Native HR response', 'client_id': messageId()},
          ),
        );
        await until(find.text('Native HR response'));
        await capture('chat-native');
        await tester.tap(find.byType(BackButton));
        await tester.pumpAndSettle();
        await tester.runAsync(
          () => hr.request(
            'PATCH',
            '/companies/$cid/applications/${a['id']}',
            data: {'status': 'shortlisted'},
          ),
        );
        await tester.tap(find.byTooltip('Yangilash'));
        await until(find.text('Saralandi'));
        await capture('applications');
        await tester.tap(find.text('Natijalar va izohlar').first);
        await until(find.text('Natija hali tayyor emas'));
        expect(find.text('100 / 100'), findsNothing);
        await tester.tap(find.byType(BackButton));
        await tester.pumpAndSettle();
        await tester.tap(find.text('Vakansiyalar'));
        await until(find.widgetWithText(Card, title));
        expect(tester.takeException(), isNull);
        await capture('candidate-vacancies');
        tester.platformDispatcher.textScaleFactorTestValue = 1.8;
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        await capture('large-text');
        tester.platformDispatcher.clearTextScaleFactorTestValue();
        await tester.pumpAndSettle();
        api.dio.options.baseUrl = 'http://127.0.0.1:9';
        await tester.tap(find.byTooltip('Yangilash'));
        await until(
          find.text('Ulanib bo‘lmadi. Internetni tekshirib qayta urining.'),
        );
        api.dio.options.baseUrl = base;
        await tester.tap(find.text('Qayta urinish'));
        await until(find.widgetWithText(Card, title));

        // Native secure storage restoration, using the same platform store.
        final restored = Api(
          client: Dio(
            BaseOptions(
              baseUrl: base,
              connectTimeout: const Duration(seconds: 10),
              receiveTimeout: const Duration(seconds: 20),
            ),
          ),
        );
        await tester.runAsync(() => restored.restore());
        expect(restored.me!['id'], api.me!['id']);
        await tester.runAsync(() => api.logout());
        await until(find.byType(LoginScreen));
        await tester.enterText(
          find.byType(TextFormField).first,
          const String.fromEnvironment(
            'TEST_HR',
            defaultValue: 'demo.hr@example.com',
          ),
        );
        await tester.enterText(find.byType(TextFormField).last, password);
        await tester.ensureVisible(find.text('Tizimga kirish'));
        await tester.tap(find.text('Tizimga kirish'));
        await until(find.text('Nomzodlar'));
        await until(find.byType(Card));
        for (var page = 0; page < 150; page++) {
          if (find.widgetWithText(Card, title).evaluate().isNotEmpty) break;
          final more = find.byWidgetPredicate(
            (w) => w is Text && (w.data?.startsWith('Yana yuklash (') ?? false),
          );
          if (more.evaluate().isNotEmpty) {
            await tester.ensureVisible(more);
            await tester.tap(more);
            await tester.pumpAndSettle();
          } else {
            await tester.drag(
              find.byType(ListView).first,
              const Offset(0, -550),
            );
            await tester.pumpAndSettle();
          }
        }
        await tester.ensureVisible(find.widgetWithText(Card, title));
        await tester.tap(
          find.descendant(
            of: find.widgetWithText(Card, title),
            matching: find.text('Nomzod va dalillar'),
          ),
        );
        await until(find.text('Nomzod tafsiloti'));
        await until(find.widgetWithText(OutlinedButton, 'Ariza yuborildi'));
        await tester.pumpAndSettle();
        await tester.tap(
          find.widgetWithText(OutlinedButton, 'Ariza yuborildi'),
        );
        await until(find.widgetWithText(Chip, 'Ariza yuborildi'));
        final Json tracked = await tester.runAsync(
          () => restored.request('GET', '/candidate/applications'),
        );
        expect(
          (tracked['items'] as List).firstWhere(
            (x) => x['id'] == a['id'],
          )['status'],
          'applied',
        );
        await capture('hr-candidate');
        await tester.scrollUntilVisible(
          find.text('HR eslatmalari'),
          250,
          scrollable: find.byType(Scrollable).first,
        );
        await tester.tap(find.text('HR eslatmalari'));
        await until(find.text('Ichki eslatmalar'));
        await until(find.byType(TextField));
        const note = 'Mobil HR tekshiruvi';
        await tester.enterText(find.byType(TextField), note);
        await tester.tap(find.text('Saqlash'));
        await until(find.widgetWithText(Card, note));
        expect(tester.takeException(), isNull);
        await tester.runAsync(
          () => restored.request(
            'POST',
            '/candidate/applications/${a['id']}/withdraw',
          ),
        );
        await tester.runAsync(() => api.logout());
      } finally {
        await tester.runAsync(
          () => hr.request(
            'PATCH',
            '/companies/$cid/vacancies/$vid',
            data: {'status': 'archived'},
          ),
        );
        await tester.runAsync(() => hr.logout());
      }
    },
  );
}
