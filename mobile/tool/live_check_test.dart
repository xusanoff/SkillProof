// Run against a local seeded backend only. Uses no in-app demo credentials.
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:dio/dio.dart';
import 'package:skillproof_mobile/core/api.dart';

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

void check(bool pass, String name) {
  if (!pass) throw StateError(name);
  stdout.writeln('PASS $name');
}

void main() {
  test(
    'real backend candidate and HR flow',
    runCheck,
    timeout: const Timeout(Duration(minutes: 2)),
  );
}

Future<void> runCheck() async {
  final env = Platform.environment;
  final base = env['MOBILE_TEST_API'] ?? 'http://127.0.0.1:8000';
  if (!['localhost', '127.0.0.1', '10.0.2.2'].contains(Uri.parse(base).host)) {
    throw StateError('Local test backend required');
  }
  final password = env['MOBILE_TEST_PASSWORD'];
  if (password == null) throw StateError('Set MOBILE_TEST_PASSWORD');
  Api make() => Api(
    client: Dio(
      BaseOptions(
        baseUrl: base,
        connectTimeout: const Duration(seconds: 10),
        receiveTimeout: const Duration(seconds: 20),
      ),
    ),
    store: MemoryStore(),
  );
  final candidate = make(), hr = make();
  await candidate.login(
    env['MOBILE_TEST_CANDIDATE'] ?? 'demo.candidate@example.com',
    password,
  );
  await hr.login(env['MOBILE_TEST_HR'] ?? 'demo.hr@example.com', password);
  check(
    candidate.candidate && hr.me!['role'] == 'hr',
    'real login and backend roles',
  );
  final cid = hr.me!['companies'][0]['id'];
  final title = 'Mobile flow ${DateTime.now().millisecondsSinceEpoch}';
  final Json vacancy = await hr.request(
    'POST',
    '/companies/$cid/vacancies',
    data: {
      'title': title,
      'description': 'Mobile integration test vacancy',
      'remote_type': 'remote',
      'employment_type': 'full_time',
      'experience_level': 'between_1_3',
    },
  );
  final vid = vacancy['id'];
  try {
    await hr.request(
      'PATCH',
      '/companies/$cid/vacancies/$vid',
      data: {'status': 'published'},
    );
    final Json list = await candidate.request(
      'GET',
      '/vacancies',
      query: {'q': title, 'remote_type': 'remote'},
    );
    check(
      (list['items'] as List).any((v) => v['id'] == vid),
      'search and format filter',
    );
    final Json detail = await candidate.request('GET', '/vacancies/$vid');
    check(detail['title'] == title, 'vacancy detail');
    await candidate.request('PUT', '/candidate/saved-vacancies/$vid');
    final Json saved = await candidate.request(
      'GET',
      '/candidate/saved-vacancies',
    );
    check((saved['items'] as List).any((v) => v['id'] == vid), 'save vacancy');
    final Json a = await candidate.request(
      'POST',
      '/vacancies/$vid/apply',
      data: {'cover_note': 'Flutter real API check'},
    );
    check(a['status'] == 'applied', 'apply confirmed by backend');
    try {
      await candidate.request('POST', '/vacancies/$vid/apply', data: {});
      throw StateError('Duplicate accepted');
    } on ApiFailure catch (e) {
      check(e.code == 'already_applied', 'duplicate rejected');
    }
    final aid = a['id'];
    final Json applications = await candidate.request(
      'GET',
      '/candidate/applications',
    );
    check(
      (applications['items'] as List).any((v) => v['id'] == aid),
      'candidate tracks application',
    );
    await hr.request(
      'PATCH',
      '/companies/$cid/applications/$aid',
      data: {'status': 'shortlisted'},
    );
    final Json changed = await candidate.request(
      'GET',
      '/candidate/applications',
    );
    check(
      (changed['items'] as List).firstWhere((v) => v['id'] == aid)['status'] ==
          'shortlisted',
      'HR change visible to candidate',
    );
    final Json report = await hr.request(
      'GET',
      '/companies/$cid/applications/$aid/report',
    );
    check(report['application_id'] == aid, 'HR report contract');
    final Json result = await candidate.request(
      'GET',
      '/applications/$aid/results',
    );
    check(
      result['state'] == 'not_ready',
      'pending results do not invent scores',
    );
    try {
      await hr.request('GET', '/candidate/profile');
      throw StateError('HR accessed candidate API');
    } on ApiFailure catch (e) {
      check(e.status == 403, 'candidate role enforced');
    }
    await candidate.request('POST', '/candidate/applications/$aid/withdraw');
    await candidate.request('DELETE', '/candidate/saved-vacancies/$vid');
    final store = candidate.store;
    final restored = Api(
      client: Dio(BaseOptions(baseUrl: base)),
      store: store,
    );
    await restored.restore();
    check(restored.me!['id'] == candidate.me!['id'], 'session restored');
    await restored.logout();
    check(await store.read() == null, 'logout clears session');
  } finally {
    await hr.request(
      'PATCH',
      '/companies/$cid/vacancies/$vid',
      data: {'status': 'archived'},
    );
    await hr.logout();
  }
}
