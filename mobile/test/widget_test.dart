import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:skillproof_mobile/main.dart';
import 'package:skillproof_mobile/core/api.dart';
import 'package:skillproof_mobile/core/theme.dart';
import 'api_test.dart' show MemoryStore;

void main() {
  testWidgets('login fits small screen with large text and keyboard', (
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
        home: LoginScreen(api: Api(store: MemoryStore())),
      ),
    );
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    await tester.ensureVisible(find.byType(FilledButton));
    await tester.tap(find.byType(FilledButton));
    await tester.pumpAndSettle();
    expect(find.text('Enter your email'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
  testWidgets('cold start restores session without a forced splash delay', (
    tester,
  ) async {
    await tester.pumpWidget(SkillProofApp(api: Api(store: MemoryStore())));
    await tester.pump();
    expect(find.byType(LoginScreen), findsOneWidget);
  });
  testWidgets('reduced motion splash stays static', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: MediaQuery(
          data: MediaQueryData(disableAnimations: true),
          child: Splash(),
        ),
      ),
    );
    expect(
      find.descendant(
        of: find.byType(Splash),
        matching: find.byType(FadeTransition),
      ),
      findsNothing,
    );
    expect(find.text('SkillProof'), findsOneWidget);
  });
}
