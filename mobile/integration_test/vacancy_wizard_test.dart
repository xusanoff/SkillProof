import 'package:skillproof_mobile/screens/question_bank.dart';
import 'package:skillproof_mobile/screens/vacancy_wizard.dart';
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
    'HR creates a vacancy in three steps and adds a question to the shared bank',
    (tester) async {
      const base = String.fromEnvironment(
        'API_BASE_URL',
        defaultValue: 'http://10.0.2.2:8001',
      );
      const password = String.fromEnvironment('TEST_PASSWORD');
      expect(password, isNotEmpty);
      final api = Api(
        client: Dio(
          BaseOptions(
            baseUrl: base,
            connectTimeout: const Duration(seconds: 15),
            receiveTimeout: const Duration(seconds: 30),
          ),
        ),
        store: MemoryStore(),
      );
      await tester.runAsync(() => api.login('demo.hr@example.com', password));
      final cid = api.me!['companies'][0]['id'];
      final Json bankTasks = await tester.runAsync(
        () => api.request(
          'GET',
          '/companies/$cid/tasks',
          query: {'include_global': true, 'page_size': 20},
        ),
      );
      final task = (bankTasks['items'] as List).firstWhere(
        (x) =>
            x['is_approved'] == true &&
            x['verification_status'] == 'passed' &&
            x['language'] == 'uz',
      );
      final title = 'Native wizard ${DateTime.now().millisecondsSinceEpoch}';
      final qText = 'Native question ${DateTime.now().millisecondsSinceEpoch}';
      Future<void> until(Finder f) async {
        for (var i = 0; i < 200; i++) {
          await tester.pump(const Duration(milliseconds: 100));
          if (f.evaluate().isNotEmpty) return;
        }
        throw StateError('Not found: $f');
      }

      Future<void> reveal(Finder f) async {
        await tester.scrollUntilVisible(
          f,
          300,
          scrollable: find.byType(Scrollable).first,
          maxScrolls: 80,
        );
      }

      appLocale.value = const Locale('uz');
      String? vid;
      try {
        await tester.pumpWidget(SkillProofApp(api: api));
        await until(find.text('Vakansiya yaratish'));
        await tester.tap(find.text('Vakansiya yaratish'));
        await tester.pumpAndSettle();
        await tester.enterText(find.byType(TextFormField).first, title);
        await tester.enterText(
          find.byType(TextFormField).at(1),
          'Native hiring workflow check.',
        );
        await tester.pumpAndSettle();
        await tester.tap(find.text('Keyingi bosqich'));
        await until(find.text('AI suhbat savollar soni'));
        final count = find.widgetWithText(
          TextFormField,
          'AI suhbat savollar soni',
        );
        await tester.ensureVisible(count);
        await tester.enterText(count, '1');
        await tester.pumpAndSettle();
        await tester.tap(find.text('Keyingi bosqich'));
        await until(find.text('Amaliy topshiriqlar'));
        await tester.pumpAndSettle();
        final Json vacancies = await tester.runAsync(
          () => api.request(
            'GET',
            '/companies/$cid/vacancies',
            query: {'status': 'draft', 'q': title},
          ),
        );
        vid = (vacancies['items'] as List).single['id'];
        expect((vacancies['items'] as List).single['status'], 'draft');
        final taskTile = find.widgetWithText(CheckboxListTile, task['title']);
        await reveal(taskTile);
        await tester.tap(taskTile);
        await tester.pumpAndSettle();
        await reveal(find.text('Yangi savol qo‘shish'));
        await tester.tap(find.text('Yangi savol qo‘shish'));
        await tester.pumpAndSettle();
        await tester.enterText(find.byType(TextFormField).first, qText);
        await tester.enterText(
          find.byType(TextFormField).at(1),
          'A clear reference answer.',
        );
        await tester.pumpAndSettle();
        await tester.ensureVisible(find.text('Saqlash'));
        await tester.tap(find.text('Saqlash'));
        await until(find.text('Saqlash va nashr qilish'));
        await tester.pumpAndSettle();
        final newCard = find.widgetWithText(Card, qText);
        await reveal(newCard);
        final approve = find.descendant(
          of: newCard,
          matching: find.widgetWithText(OutlinedButton, 'Tasdiqlash'),
        );
        await tester.ensureVisible(approve);
        await tester.pumpAndSettle();
        await tester.tap(approve);
        await until(
          find.descendant(
            of: newCard,
            matching: find.text('uz · Tasdiqlangan'),
          ),
        );
        await tester.pumpAndSettle();
        await tester.tap(find.text('Saqlash va nashr qilish'));
        for (
          var i = 0;
          i < 200 && find.byType(VacancyWizardScreen).evaluate().isNotEmpty;
          i++
        ) {
          await tester.pump(const Duration(milliseconds: 100));
        }
        expect(find.byType(VacancyWizardScreen), findsNothing);
        await tester.pumpAndSettle();
        final Json vacancy = await tester.runAsync(
          () => api.request('GET', '/companies/$cid/vacancies/$vid'),
        );
        expect(vacancy['status'], 'published');
        final Json assessment = await tester.runAsync(
          () => api.request('GET', '/companies/$cid/vacancies/$vid/assessment'),
        );
        expect(assessment['ready'], true);
        expect(
          (assessment['questions'] as List).any((q) => q['text'] == qText),
          true,
        );
        final Json bank = await tester.runAsync(
          () => api.request(
            'GET',
            '/companies/$cid/questions',
            query: {'q': qText},
          ),
        );
        expect((bank['items'] as List).any((q) => q['text'] == qText), true);
        await tester.tap(find.text('Savollar banki'));
        await until(find.byType(QuestionBankScreen));
        await until(find.text(qText));
        await tester.tap(find.text('Yangi savol qo‘shish'));
        await tester.pumpAndSettle();
        final bankQuestion = '$qText bank';
        await tester.enterText(find.byType(TextFormField).first, bankQuestion);
        await tester.enterText(
          find.byType(TextFormField).at(1),
          'Standalone bank answer.',
        );
        await tester.pumpAndSettle();
        await tester.ensureVisible(find.text('Saqlash'));
        await tester.tap(find.text('Saqlash'));
        await until(find.widgetWithText(Card, bankQuestion));
        await tester.pumpAndSettle();
        final Json ownBank = await tester.runAsync(
          () => api.request(
            'GET',
            '/companies/$cid/questions',
            query: {'q': bankQuestion},
          ),
        );
        expect(
          (ownBank['items'] as List).any((q) => q['text'] == bankQuestion),
          true,
        );
        expect(tester.takeException(), isNull);
        await binding.convertFlutterSurfaceToImage();
        await tester.pump();
        await binding.takeScreenshot('native-wizard-completed');
      } finally {
        if (vid != null) {
          await tester.runAsync(
            () => api.request(
              'PATCH',
              '/companies/$cid/vacancies/$vid',
              data: {'status': 'archived'},
            ),
          );
        }
        await tester.runAsync(() => api.logout());
      }
    },
  );
}
