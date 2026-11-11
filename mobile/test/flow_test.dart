import 'package:flutter_test/flutter_test.dart';
import 'package:skillproof_mobile/core/flow.dart';

void main() {
  test('all backend application statuses have a next action', () {
    for (final s in statusLabels.keys) {
      expect(nextAction(s), isNot('Holat yangilanishini kuting.'));
    }
  });
  test('withdraw and HR actions match repo status rules', () {
    expect(canWithdraw('stage1_in_progress'), false);
    expect(canWithdraw('interview_pending'), true);
    expect(hrActions('withdrawn'), isEmpty);
    expect(hrActions('hired'), isEmpty);
    expect(hrActions('evaluated'), contains('hired'));
    expect(hrActions('rejected'), isNot(contains('hired')));
  });
  test('missing salary does not invent an amount', () {
    expect(
      salary({'salary_min': null, 'salary_max': null}),
      'Maosh kelishiladi',
    );
    expect(
      salary({'salary_min': 100, 'salary_max': null, 'currency': 'UZS'}),
      '100 – … UZS',
    );
  });
}
