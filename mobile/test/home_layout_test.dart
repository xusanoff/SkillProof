import 'package:skillproof_mobile/screens/vacancy_wizard.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:skillproof_mobile/main.dart';
import 'package:skillproof_mobile/core/api.dart';
import 'package:skillproof_mobile/core/theme.dart';
import 'api_test.dart' show MemoryStore;

class HomeApi extends Api {
  HomeApi() : super(store: MemoryStore()) {
    me = {
      'id': '1',
      'role': 'candidate',
      'full_name': 'Test Candidate',
      'email': 'test@example.com',
    };
  }
  @override
  Future<dynamic> request(
    String method,
    String path, {
    dynamic data,
    Map<String, dynamic>? query,
    bool retry = true,
    ResponseType? responseType,
  }) async {
    if (path == '/candidate/profile') {
      return {
        'headline': 'Engineer',
        'city': 'Tashkent',
        'about': 'About',
        'resume': null,
      };
    }
    return {'items': <Json>[], 'total': 0, 'page': 1, 'page_size': 20};
  }
}

void main() {
  testWidgets(
    'candidate navigation and profile fit 320dp at 180 percent text',
    (tester) async {
      tester.view.physicalSize = const Size(320, 640);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await tester.pumpWidget(
        MaterialApp(
          theme: Brand.theme,
          builder: (c, child) => MediaQuery(
            data: MediaQuery.of(
              c,
            ).copyWith(textScaler: const TextScaler.linear(1.8)),
            child: child!,
          ),
          home: HomeShell(api: HomeApi()),
        ),
      );
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      await tester.tap(find.byIcon(Icons.person_outline));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets('vacancy wizard stays usable with keyboard and large text', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(320, 568);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(
      MaterialApp(
        theme: Brand.theme,
        builder: (c, child) => MediaQuery(
          data: MediaQuery.of(c).copyWith(
            textScaler: const TextScaler.linear(1.8),
            viewInsets: const EdgeInsets.only(bottom: 240),
          ),
          child: child!,
        ),
        home: VacancyWizardScreen(api: HomeApi(), companyId: 'company'),
      ),
    );
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    expect(
      tester.getRect(find.byType(FilledButton)).bottom,
      lessThanOrEqualTo(328),
    );
  });
}
