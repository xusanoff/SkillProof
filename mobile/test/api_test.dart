import 'dart:convert';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
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

class HandlerAdapter implements HttpClientAdapter {
  HandlerAdapter(this.handle);
  final Future<ResponseBody> Function(RequestOptions) handle;
  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<List<int>>? stream,
    Future<void>? cancel,
  ) => handle(options);
  @override
  void close({bool force = false}) {}
}

ResponseBody jsonBody(
  dynamic value, {
  int status = 200,
  Map<String, List<String>> headers = const {},
}) => ResponseBody.fromString(
  jsonEncode(value),
  status,
  headers: {
    Headers.contentTypeHeader: ['application/json'],
    ...headers,
  },
);
void main() {
  test(
    'cookie session persists, refresh rotates once for concurrent requests',
    () async {
      var refreshes = 0;
      final store = MemoryStore();
      final dio = Dio(BaseOptions(baseUrl: 'http://localhost'));
      dio.httpClientAdapter = HandlerAdapter((r) async {
        if (r.path.endsWith('/login')) {
          return jsonBody(
            {'id': '1', 'role': 'candidate'},
            headers: {
              'set-cookie': [
                'sp_access=old; Path=/; HttpOnly',
                'sp_refresh=r1; Path=/api; HttpOnly',
              ],
            },
          );
        }
        if (r.path.endsWith('/refresh')) {
          refreshes++;
          await Future<void>.delayed(const Duration(milliseconds: 15));
          expect(r.headers['Cookie'], contains('sp_refresh=r1'));
          return jsonBody(
            {'id': '1', 'role': 'candidate'},
            headers: {
              'set-cookie': [
                'sp_access=new; Path=/',
                'sp_refresh=r2; Path=/api',
              ],
            },
          );
        }
        if (r.headers['Cookie'].toString().contains('sp_access=old')) {
          return jsonBody({
            'error': {'code': 'unauthorized'},
          }, status: 401);
        }
        return jsonBody({'items': []});
      });
      final api = Api(client: dio, store: store);
      await api.login('a@b.uz', 'password');
      expect(store.value, contains('r1'));
      await Future.wait([
        api.request('GET', '/candidate/applications'),
        api.request('GET', '/candidate/profile'),
      ]);
      expect(refreshes, 1);
      expect(store.value, contains('r2'));
      expect(api.cookies['sp_access'], 'new');
    },
  );
  test(
    'expired refresh clears secure storage and notifies session boundary',
    () async {
      final store = MemoryStore()
        ..value = '{"sp_access":"old","sp_refresh":"expired"}';
      final dio = Dio(BaseOptions(baseUrl: 'http://localhost'));
      dio.httpClientAdapter = HandlerAdapter(
        (r) async => jsonBody({
          'error': {'code': 'invalid_refresh_token'},
        }, status: 401),
      );
      final api = Api(client: dio, store: store);
      await api.restore();
      expect(api.me, isNull);
      expect(api.expired, isTrue);
      expect(store.value, isNull);
    },
  );
  test('network failure preserves cached credentials', () async {
    final store = MemoryStore()..value = '{"sp_access":"old"}';
    final dio = Dio(BaseOptions(baseUrl: 'http://localhost'));
    dio.httpClientAdapter = HandlerAdapter(
      (r) async => throw DioException(
        requestOptions: r,
        type: DioExceptionType.connectionError,
      ),
    );
    final api = Api(client: dio, store: store);
    await expectLater(api.restore(), throwsA(isA<ApiFailure>()));
    expect(store.value, isNotNull);
  });
}
