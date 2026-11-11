import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:skillproof_mobile/core/api.dart';
import 'package:skillproof_mobile/screens/applications.dart';

import 'api_test.dart' show MemoryStore;

class ResultsApi extends Api {
  ResultsApi() : super(store: MemoryStore());
  int calls = 0;
  Completer<dynamic>? next;

  @override
  Future<dynamic> request(
    String method,
    String path, {
    dynamic data,
    Map<String, dynamic>? query,
    bool retry = true,
    ResponseType? responseType,
  }) async {
    calls++;
    if (calls > 1 && next != null) return next!.future;
    return result(calls == 1 ? 'pending' : 'done');
  }

  static Json result(String state) => {
    'state': state,
    'vacancy_title': 'Backend engineer',
    if (state == 'done') 'stage2_score': 80,
  };
}

void main() {
  testWidgets('results refresh while pending and stop once ready', (
    tester,
  ) async {
    final api = ResultsApi();
    await tester.pumpWidget(
      MaterialApp(
        home: ResultsScreen(api: api, id: 'application'),
      ),
    );
    await tester.pumpAndSettle();
    expect(api.calls, 1);
    expect(find.text('Evaluation pending'), findsOneWidget);
    await tester.pump(const Duration(seconds: 3));
    await tester.pumpAndSettle();
    expect(api.calls, 2);
    expect(find.text('Results ready'), findsOneWidget);
    await tester.pump(const Duration(seconds: 12));
    expect(api.calls, 2);
    await tester.pumpWidget(const SizedBox());
    expect(tester.takeException(), isNull);
  });

  testWidgets('polling never overlaps a slow request', (tester) async {
    final api = ResultsApi()..next = Completer<dynamic>();
    await tester.pumpWidget(
      MaterialApp(
        home: ResultsScreen(api: api, id: 'application'),
      ),
    );
    await tester.pumpAndSettle();
    await tester.pump(const Duration(seconds: 3));
    expect(api.calls, 2);
    await tester.pump(const Duration(seconds: 12));
    expect(api.calls, 2);
    api.next!.complete(ResultsApi.result('done'));
    await tester.pumpAndSettle();
    expect(find.text('Results ready'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
    expect(tester.takeException(), isNull);
  });

  testWidgets('leaving pending results cancels the refresh timer', (
    tester,
  ) async {
    final api = ResultsApi();
    await tester.pumpWidget(
      MaterialApp(
        home: ResultsScreen(api: api, id: 'application'),
      ),
    );
    await tester.pumpAndSettle();
    expect(api.calls, 1);
    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(seconds: 12));
    expect(api.calls, 1);
    expect(tester.takeException(), isNull);
  });
}
