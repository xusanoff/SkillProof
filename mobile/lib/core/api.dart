import 'dart:convert';
import 'dart:io';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

typedef Json = Map<String, dynamic>;

abstract interface class SessionStore {
  Future<String?> read();
  Future<void> write(String value);
  Future<void> clear();
}

class SecureSessionStore implements SessionStore {
  final FlutterSecureStorage storage = const FlutterSecureStorage();
  @override
  Future<String?> read() => storage.read(key: 'skillproof.session');
  @override
  Future<void> write(String value) =>
      storage.write(key: 'skillproof.session', value: value);
  @override
  Future<void> clear() => storage.delete(key: 'skillproof.session');
}

class ApiFailure implements Exception {
  final String code;
  final int? status;
  const ApiFailure(this.code, [this.status]);
  @override
  String toString() => code;
}

class Api extends ChangeNotifier {
  Api({Dio? client, SessionStore? store})
    : dio =
          client ??
          Dio(
            BaseOptions(
              baseUrl: const String.fromEnvironment(
                'API_BASE_URL',
                defaultValue: 'http://10.0.2.2:8000',
              ),
              connectTimeout: const Duration(seconds: 15),
              receiveTimeout: const Duration(seconds: 30),
            ),
          ),
      store = store ?? SecureSessionStore();
  final Dio dio;
  final SessionStore store;
  final Map<String, String> cookies = {};
  Json? me;
  bool expired = false;
  Future<void>? _refresh;
  Future<void> restore() async {
    final raw = await store.read();
    if (raw != null) {
      try {
        cookies.addAll(Map<String, String>.from(jsonDecode(raw)));
      } on FormatException {
        await clear();
        return;
      } on TypeError {
        await clear();
        return;
      }
    }
    if (cookies.isNotEmpty) {
      try {
        me = await request('GET', '/auth/me');
      } on ApiFailure catch (e) {
        if (e.status != 401) rethrow;
      }
    }
  }

  Future<void> _capture(Response<dynamic> response) async {
    for (final value in response.headers['set-cookie'] ?? <String>[]) {
      final c = Cookie.fromSetCookieValue(value);
      if (!{'sp_access', 'sp_refresh'}.contains(c.name)) continue;
      if (c.value.isEmpty || c.maxAge == 0) {
        cookies.remove(c.name);
      } else {
        cookies[c.name] = c.value;
      }
    }
    if (cookies.isEmpty) {
      await store.clear();
    } else {
      await store.write(jsonEncode(cookies));
    }
  }

  Future<dynamic> request(
    String method,
    String path, {
    dynamic data,
    Map<String, dynamic>? query,
    bool retry = true,
    ResponseType? responseType,
  }) async {
    try {
      final response = await dio.request<dynamic>(
        '/api/v1$path',
        data: data,
        queryParameters: query,
        options: Options(
          method: method,
          responseType: responseType,
          headers: {
            if (cookies.isNotEmpty)
              'Cookie': cookies.entries
                  .map((e) => '${e.key}=${e.value}')
                  .join('; '),
          },
        ),
      );
      await _capture(response);
      return response.data;
    } on DioException catch (e) {
      if (e.response?.statusCode == 401 &&
          retry &&
          !path.startsWith('/auth/')) {
        await refresh();
        return request(
          method,
          path,
          data: data,
          query: query,
          retry: false,
          responseType: responseType,
        );
      }
      if (e.response?.statusCode == 401 && path == '/auth/me' && retry) {
        await refresh();
        return request(method, path, retry: false);
      }
      final payload = e.response?.data;
      throw ApiFailure(
        payload is Map
            ? (payload['error']?['code']?.toString() ?? 'server_error')
            : 'connection_error',
        e.response?.statusCode,
      );
    }
  }

  Future<void> refresh() async {
    if (_refresh != null) return _refresh;
    _refresh = _doRefresh();
    try {
      await _refresh;
    } finally {
      _refresh = null;
    }
  }

  Future<void> _doRefresh() async {
    try {
      me = await request('POST', '/auth/refresh', retry: false);
    } on ApiFailure catch (e) {
      if (e.status == 401) {
        await clear();
        expired = true;
        notifyListeners();
      }
      rethrow;
    }
  }

  Future<void> login(String email, String password) async {
    me = await request(
      'POST',
      '/auth/login',
      data: {'email': email, 'password': password},
    );
    expired = false;
    notifyListeners();
  }

  Future<void> clear() async {
    cookies.clear();
    me = null;
    await store.clear();
    notifyListeners();
  }

  Future<void> logout() async {
    await request('POST', '/auth/logout', retry: false);
    await clear();
  }

  bool get candidate => me?['role'] == 'candidate';
}
