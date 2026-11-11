import 'dart:async';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:skillproof_mobile/core/api.dart';
import 'package:skillproof_mobile/core/theme.dart';
import 'package:skillproof_mobile/screens/vacancies.dart';
import 'api_test.dart' show MemoryStore;

class ApplyApi extends Api {
  ApplyApi() : super(store: MemoryStore()) {
    me = {'id': 'candidate', 'role': 'candidate'};
  }
  final pending = Completer<dynamic>();
  int submissions = 0;
  @override
  Future<dynamic> request(
    String method,
    String path, {
    dynamic data,
    Map<String, dynamic>? query,
    bool retry = true,
    ResponseType? responseType,
  }) async {
    if (path.endsWith('/apply')) {
      submissions++;
      return pending.future;
    }
    return {
      'id': 'vacancy',
      'title': 'Backend engineer',
      'company': {'name': 'Test company'},
      'description': 'Description\n' * 80,
      'requirements': null,
      'salary_min': null,
      'salary_max': null,
      'skills': [],
      'remote_type': 'remote',
      'has_assessment': true,
      'viewer': {'is_saved': false, 'application_status': null},
    };
  }
}

void main() {
  testWidgets(
    'sticky apply prevents duplicate taps and retains note on connection failure',
    (tester) async {
      tester.view.physicalSize = const Size(360, 640);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final api = ApplyApi();
      await tester.pumpWidget(
        MaterialApp(
          theme: Brand.theme,
          home: VacancyDetail(api: api, id: 'vacancy'),
        ),
      );
      await tester.pumpAndSettle();
      // The button remains visible even before scrolling through the long description.
      final button = find.byType(FilledButton);
      expect(tester.getRect(button).bottom, lessThanOrEqualTo(640));
      await tester.scrollUntilVisible(
        find.byType(TextField),
        500,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.enterText(find.byType(TextField), 'My note must survive');
      await tester.pump();
      await tester.tap(button);
      await tester.pump();
      await tester.tap(button);
      await tester.pump();
      expect(api.submissions, 1);
      api.pending.completeError(const ApiFailure('connection_error'));
      await tester.pumpAndSettle();
      expect(find.text('My note must survive'), findsOneWidget);
      expect(tester.widget<FilledButton>(button).onPressed, isNotNull);
      expect(tester.takeException(), isNull);
    },
  );
}
