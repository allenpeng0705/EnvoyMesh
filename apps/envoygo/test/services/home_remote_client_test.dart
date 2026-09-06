import 'dart:async';
import 'dart:convert';
import 'package:envoy_thin_client/services/exceptions.dart';
import 'package:envoy_thin_client/services/home_remote_client.dart';
import 'package:envoy_thin_client/services/web_socket_like.dart';
import 'package:flutter_test/flutter_test.dart';

/// A controllable mock WebSocket for testing HomeRemoteClient.
class MockWebSocket implements WebSocketLike {
  @override
  int readyState;

  @override
  void Function()? onOpen;

  @override
  void Function(WsMessageEvent event)? onMessage;

  @override
  void Function()? onClose;

  @override
  void Function()? onError;

  final List<String> sentMessages = [];
  bool closed = false;

  MockWebSocket({this.readyState = wsConnecting});

  void simulateOpen() {
    readyState = wsOpen;
    onOpen?.call();
  }

  void simulateError() {
    onError?.call();
  }

  void simulateClose() {
    readyState = wsClosed;
    onClose?.call();
  }

  /// Simulate receiving a JSON-RPC message. Uses proper JSON encoding.
  void simulateMessage(Map<String, dynamic> msg) {
    onMessage?.call(WsMessageEvent(jsonEncode(msg)));
  }

  @override
  void send(String data) {
    sentMessages.add(data);
  }

  @override
  void close() {
    closed = true;
    readyState = wsClosed;
  }
}

void main() {
  late List<HomeRemoteCandidate> candidates;
  late List<MockWebSocket> createdSockets;
  late List<bool> onlineChanges;
  late List<HomeRemoteCandidate?> transportChanges;

  HomeRemoteClientOptions createOptions({
    int perCandidateTimeoutMs = 200,
    int upgradeSweepMs = 0,
    int initialReconnectDelayMs = 1000,
  }) {
    createdSockets = [];
    onlineChanges = [];
    transportChanges = [];
    return HomeRemoteClientOptions(
      resolveCandidates: () async => candidates,
      createTransport: (candidate) {
        final mock = MockWebSocket();
        createdSockets.add(mock);
        return mock;
      },
      onHomeOnlineChange: (online) => onlineChanges.add(online),
      onActiveTransportChange: (c) => transportChanges.add(c),
      perCandidateTimeoutMs: perCandidateTimeoutMs,
      upgradeSweepMs: upgradeSweepMs,
      initialReconnectDelayMs: initialReconnectDelayMs,
    );
  }

  /// Helper: connect and prime with 'connected' event.
  Future<HomeRemoteClient> connectClient(
      {int perCandidateTimeoutMs = 200, int initialReconnectDelayMs = 1000}) async {
    final client = HomeRemoteClient(createOptions(
      perCandidateTimeoutMs: perCandidateTimeoutMs,
      initialReconnectDelayMs: initialReconnectDelayMs,
    ));
    final future = client.ensureConnected();
    await Future.delayed(Duration.zero);
    createdSockets[0].simulateOpen();
    // Home-ready signal is required before ensureConnected completes.
    createdSockets[0].simulateMessage({
      'event': 'connected',
    });
    await future;
    return client;
  }

  group('HomeRemoteClient', () {
    group('connect', () {
      test('waits for connected event before finishing ensureConnected', () async {
        candidates = [
          const HomeRemoteCandidate(name: 'lan', url: 'ws://10.0.0.1:3030/ws'),
        ];
        final client = HomeRemoteClient(createOptions(perCandidateTimeoutMs: 500));
        final future = client.ensureConnected();
        var completed = false;
        future.then((_) => completed = true);
        await Future.delayed(Duration.zero);
        createdSockets[0].simulateOpen();
        await Future.delayed(const Duration(milliseconds: 20));
        expect(completed, isFalse);
        expect(client.homeOnline, isFalse);
        createdSockets[0].simulateMessage({'event': 'connected'});
        await future;
        expect(completed, isTrue);
        expect(client.homeOnline, isTrue);
        expect(client.isConnected, isTrue);
      });

      test('connects to first available candidate', () async {
        candidates = [
          const HomeRemoteCandidate(name: 'lan', url: 'ws://10.0.0.1:3030/ws'),
          const HomeRemoteCandidate(
              name: 'relay', url: 'wss://relay.example.com'),
        ];
        final client = await connectClient();
        expect(client.isConnected, isTrue);
        expect(client.activeCandidate?.name, 'lan');
        expect(onlineChanges, contains(true));
      });

      test('falls back to next candidate on first failure', () async {
        candidates = [
          const HomeRemoteCandidate(name: 'lan', url: 'ws://10.0.0.1:3030/ws'),
          const HomeRemoteCandidate(
              name: 'relay', url: 'wss://relay.example.com'),
        ];
        final client = HomeRemoteClient(createOptions());

        final future = client.ensureConnected();
        await Future.delayed(Duration.zero);
        // LAN fails.
        createdSockets[0].simulateError();
        await Future.delayed(Duration.zero);
        // Relay opens and home signals ready.
        createdSockets[1].simulateOpen();
        createdSockets[1].simulateMessage({'event': 'connected'});
        await future;

        expect(client.isConnected, isTrue);
        expect(client.activeCandidate?.name, 'relay');
      });

      test('throws when all candidates fail', () async {
        candidates = [
          const HomeRemoteCandidate(name: 'lan', url: 'ws://10.0.0.1:3030/ws'),
        ];
        final client = HomeRemoteClient(
            createOptions(perCandidateTimeoutMs: 100));

        final future = client.ensureConnected();
        await Future.delayed(Duration.zero);
        createdSockets[0].simulateError();

        try {
          await future;
          fail('Expected exception');
        } catch (e) {
          expect(e, isA<Exception>());
        }
      });

      test('bounds a transport whose connect hangs (unreachable LAN from cellular)', () async {
        candidates = [
          const HomeRemoteCandidate(name: 'lan', url: 'ws://10.0.0.1:3030/ws'),
          const HomeRemoteCandidate(
              name: 'relay', url: 'wss://relay.example.com'),
        ];
        final client = HomeRemoteClient(HomeRemoteClientOptions(
          resolveCandidates: () async => candidates,
          createTransport: (candidate) {
            if (candidate.name == 'lan') {
              // Never completes — simulates a TCP SYN dropped on cellular.
              return Completer<WebSocketLike>().future;
            }
            return MockWebSocket();
          },
          perCandidateTimeoutMs: 100,
          upgradeSweepMs: 0,
        ));

        final sw = Stopwatch()..start();
        Object? error;
        await client.ensureConnected().catchError((Object e) {
          error = e;
        });
        sw.stop();

        // The hung transport must not stall the walk for the OS connect
        // timeout — both candidates fail within their per-candidate budget.
        expect(error, isNotNull);
        expect(sw.elapsedMilliseconds, lessThan(2000));
      });

      test('throws when no candidates configured', () async {
        candidates = [];
        final client = HomeRemoteClient(createOptions());

        try {
          await client.ensureConnected();
          fail('Expected exception');
        } catch (e) {
          expect(e, isA<Exception>());
        }
      });
    });

    group('RPC', () {
      test('sends JSON-RPC request and resolves with response', () async {
        candidates = [
          const HomeRemoteCandidate(
              name: 'relay', url: 'wss://relay.example.com'),
        ];
        final client = await connectClient();

        final callFuture = client.call('getNodeStatus');
        await Future.delayed(Duration.zero);

        final sent = createdSockets[0].sentMessages.last;
        expect(sent, contains('getNodeStatus'));

        final sentJson = jsonDecode(sent) as Map<String, dynamic>;
        createdSockets[0].simulateMessage({
          'id': sentJson['id'],
          'result': {'ok': true},
        });

        final result = await callFuture;
        expect(result, {'ok': true});
      });

      test('rejects on JSON-RPC error', () async {
        candidates = [
          const HomeRemoteCandidate(
              name: 'relay', url: 'wss://relay.example.com'),
        ];
        final client = await connectClient();

        final callFuture = client.call('badMethod');
        await Future.delayed(Duration.zero);

        final sentJson =
            jsonDecode(createdSockets[0].sentMessages.last) as Map<String, dynamic>;
        createdSockets[0].simulateMessage({
          'id': sentJson['id'],
          'error': {'message': 'Method not found'},
        });

        await expectLater(callFuture, throwsA(isA<Exception>()));
      });
    });

    group('auth error mapping', () {
      // Helper: open the client, send an RPC, and reply with the
      // supplied error. Returns `(callFuture, error)`: the RPC's
      // future (already completed with error) and the thrown error.
      // The callFuture is eagerly `.catchError`'d to an internal
      // completer so the test zone never sees an unhandled error
      // during `simulateMessage` (which is synchronous).
      Future<(Future<dynamic>, Object)> callAndReplyWithError(
        Map<String, dynamic> rpcError,
      ) async {
        candidates = [
          const HomeRemoteCandidate(
              name: 'relay', url: 'wss://relay.example.com'),
        ];
        final client = await connectClient();

        final callFuture = client.call('getBonds');
        // Attach a handler immediately so the future has a
        // listener when its completer is completed with error.
        final errorCompleter = Completer<Object>();
        callFuture.catchError((Object e) {
          if (!errorCompleter.isCompleted) errorCompleter.complete(e);
          return null;
        });
        await Future.delayed(Duration.zero);

        final sentJson = jsonDecode(createdSockets[0].sentMessages.last)
            as Map<String, dynamic>;
        final reply = {'id': sentJson['id'], 'error': rpcError};
        createdSockets[0].simulateMessage(reply);

        // The errorCompleter is filled by the catchError handler.
        // Return both the (now-completed-with-error) callFuture
        // and the captured error.
        final captured = await errorCompleter.future;
        return (callFuture, captured);
      }

      test('throws UnauthorizedException on code UNAUTHORIZED', () async {
        final (_, error) = await callAndReplyWithError({
          'code': 'UNAUTHORIZED',
          'message': 'Authentication required',
        });
        expect(error, isA<UnauthorizedException>());
        expect((error as UnauthorizedException).reason,
            'Authentication required');
      });

      test('throws UnauthorizedException on legacy ERROR + Authentication required',
          () async {
        final (_, error) = await callAndReplyWithError({
          'code': 'ERROR',
          'message': 'Authentication required',
        });
        expect(error, isA<UnauthorizedException>());
      });

      test('throws generic Exception on non-auth errors', () async {
        final (_, error) = await callAndReplyWithError({
          'code': 'ERROR',
          'message': 'Method not found',
        });
        // Must be a generic Exception — explicitly NOT
        // UnauthorizedException, otherwise the notifier would
        // delete the session token.
        expect(error, isA<Exception>());
        expect(error, isNot(isA<UnauthorizedException>()));
        expect(error.toString(), contains('Method not found'));
      });

      test('falls back to generic Exception when error.code is missing',
          () async {
        final (_, error) = await callAndReplyWithError({
          'message': 'something broke',
        });
        expect(error, isA<Exception>());
        expect(error, isNot(isA<UnauthorizedException>()));
        expect(error.toString(), contains('something broke'));
      });
    });

    group('push events', () {
      test('dispatches subscribed events', () async {
        candidates = [
          const HomeRemoteCandidate(
              name: 'relay', url: 'wss://relay.example.com'),
        ];
        final client = await connectClient();

        final events = <dynamic>[];
        client.on('chat:message', (data) {
          events.add(data);
        });

        createdSockets[0].simulateMessage({
          'event': 'chat:message',
          'data': {'text': 'hello'},
        });

        await Future.delayed(Duration.zero);
        expect(events.length, 1);
        expect(events[0], {'text': 'hello'});
      });

      test('unsubscribe stops dispatching', () async {
        candidates = [
          const HomeRemoteCandidate(
              name: 'relay', url: 'wss://relay.example.com'),
        ];
        final client = await connectClient();

        final events = <dynamic>[];
        final unsub = client.on('chat:message', (data) {
          events.add(data);
        });
        unsub();

        createdSockets[0].simulateMessage({
          'event': 'chat:message',
          'data': {'text': 'hello'},
        });

        await Future.delayed(Duration.zero);
        expect(events, isEmpty);
      });
    });

    group('reconnection', () {
      test('reconnects after socket close', () async {
        candidates = [
          const HomeRemoteCandidate(
              name: 'relay', url: 'wss://relay.example.com'),
        ];
        await connectClient(
            perCandidateTimeoutMs: 200,
            initialReconnectDelayMs: 20); // Fast reconnect for test.

        final socket1 = createdSockets[0];

        // Socket closes.
        socket1.simulateClose();
        await Future.delayed(Duration.zero);
        expect(onlineChanges.any((o) => !o), isTrue);

        // Reconnect timer fires after 20ms.
        await Future.delayed(const Duration(milliseconds: 50));
        final newCount = createdSockets.length;
        expect(newCount, greaterThanOrEqualTo(2));
      });
    });

    group('dispose', () {
      test('cleans up resources', () async {
        candidates = [
          const HomeRemoteCandidate(
              name: 'relay', url: 'wss://relay.example.com'),
        ];
        final client = await connectClient();

        client.dispose();
        expect(client.homeOnline, isFalse);
        expect(client.isConnected, isFalse);

        await expectLater(
            client.ensureConnected(), throwsA(isA<Exception>()));
      });
    });
  });
}
