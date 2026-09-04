// Phase 40 mobile mirror — widget tests for RecentChainsScreen.
//
// Drives the screen through a real HomeRemoteClient (backed by
// MockWebSocket) so the JSON-RPC envelope path is exercised end-to-end.
// The fake NodeNotifier just exposes a controllable `client` getter;
// the screen itself is real production code.
//
// `tester.runAsync` is used during setup so `Future.delayed(Duration.zero)`
// inside `HomeRemoteClient.ensureConnected` resolves against the real
// clock, not Flutter test's fake clock. Once the screen is mounted we
// drive it with targeted `pump(Duration)` steps instead of `pumpAndSettle`
// (the underlying HomeRemoteClient runs periodic timers — reconnect +
// upgrade-sweep — that prevent `pumpAndSettle` from ever settling).

/// @vitest-environment jsdom
library;

import 'dart:convert';

import 'package:envoygo/providers/node_provider.dart';
import 'package:envoygo/screens/chains/recent_chains_screen.dart';
import 'package:envoygo/services/home_remote_client.dart';
import 'package:envoygo/services/web_socket_like.dart';
import 'package:envoygo/storage/local_database.dart';
import 'package:envoygo/storage/secure_storage.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

/// Controllable mock WebSocket — same pattern as
/// `node_service_client_test.dart`, kept local to this file.
class MockWebSocket implements WebSocketLike {
  @override
  int readyState = wsConnecting;

  @override
  void Function()? onOpen;

  @override
  void Function(WsMessageEvent event)? onMessage;

  @override
  void Function()? onClose;

  @override
  void Function()? onError;

  final List<String> sentMessages = [];

  void simulateOpen() {
    readyState = wsOpen;
    onOpen?.call();
  }

  void simulateMessage(Map<String, dynamic> msg) {
    onMessage?.call(WsMessageEvent(jsonEncode(msg)));
  }

  @override
  void send(String data) {
    sentMessages.add(data);
  }

  @override
  void close() {
    readyState = wsClosed;
  }
}

/// Subclass of [NodeNotifier] that exposes a controllable
/// [HomeRemoteClient] via the `client` getter and skips real storage
/// initialization (so the test can run without platform channels).
class _StubNodeNotifier extends NodeNotifier {
  _StubNodeNotifier({required super.ref})
      : super(
          // Use the test factories on SecureStorage / LocalDatabase —
          // they return in-memory implementations that don't require
          // platform channels. The FakeSecureStorage / FakeLocalDatabase
          // classes in test/fakes/ are separate classes (not subclasses
          // of the production types) so we can't cast them.
          secureStorage: SecureStorage.test(),
          localDb: LocalDatabase.test(),
        );

  HomeRemoteClient? _stubClient;

  void setClient(HomeRemoteClient c) {
    _stubClient = c;
  }

  @override
  HomeRemoteClient? get client => _stubClient;
}

/// Test handle — the mock WebSocket, the connected HomeRemoteClient,
/// and the ProviderContainer the test should dispose at teardown.
class ScreenHandle {
  final MockWebSocket mock;
  final HomeRemoteClient client;
  final ProviderContainer container;

  ScreenHandle({
    required this.mock,
    required this.client,
    required this.container,
  });
}

/// Build a connected `HomeRemoteClient` driven by [mock]. The screen
/// will see `client.isConnected == true` and can issue `call()`s.
///
/// Must be invoked inside `tester.runAsync` because the connection
/// path relies on `Future.delayed(Duration.zero)` and microtasks that
/// don't advance under Flutter test's fake clock.
Future<ScreenHandle> mountScreen(WidgetTester tester) async {
  final handle = await tester.runAsync(() async {
    final mock = MockWebSocket();
    final client = HomeRemoteClient(
      HomeRemoteClientOptions(
        resolveCandidates: () async => const [
          HomeRemoteCandidate(name: 'relay', url: 'wss://relay.example.com'),
        ],
        createTransport: (_) => mock,
        onHomeOnlineChange: (_) {},
        onActiveTransportChange: (_) {},
        perCandidateTimeoutMs: 1000,
        initialReconnectDelayMs: 1000,
      ),
    );
    final future = client.ensureConnected();
    await Future<void>.delayed(Duration.zero);
    mock.simulateOpen();
    mock.simulateMessage({'event': 'connected'});
    await future;

    late _StubNodeNotifier stub;
    final container = ProviderContainer(
      overrides: [
        nodeProvider.overrideWith((ref) {
          stub = _StubNodeNotifier(ref: ref)..setClient(client);
          return stub;
        }),
      ],
    );

    return ScreenHandle(
      mock: mock,
      client: client,
      container: container,
    );
  });

  // If `runAsync` returned null (which it does on some test bindings
  // when the callback throws), surface a clear error rather than NPE
  // deep in the test body.
  if (handle == null) {
    throw StateError('tester.runAsync returned null');
  }

  // Pump the widget tree on the test clock.
  await tester.pumpWidget(
    UncontrolledProviderScope(
      container: handle.container,
      child: const MaterialApp(home: RecentChainsScreen()),
    ),
  );
  // The screen's post-frame callback fires `_refresh`, which issues
  // `chainListReports`. Pump enough frames for the future chain.
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 100));

  return handle;
}

/// Read the id of the most recent in-flight RPC call from [mock].
String _latestRpcId(MockWebSocket mock) {
  final sentJson = jsonDecode(mock.sentMessages.last) as Map<String, dynamic>;
  return sentJson['id'] as String;
}

/// Tear down the test handle. Container disposal must happen on the
/// test clock; client disposal must happen on the real clock (it
/// cancels timers created during `runAsync`).
Future<void> teardown(
    WidgetTester tester, ScreenHandle handle) async {
  handle.container.dispose();
  await tester.runAsync(() async => handle.client.dispose());
}

void main() {
  group('RecentChainsScreen', () {
    testWidgets('shows empty state when chainListReports returns []',
        (tester) async {
      final handle = await mountScreen(tester);

      // Verify the request shape.
      final sentJson = jsonDecode(handle.mock.sentMessages.last)
          as Map<String, dynamic>;
      expect(sentJson['method'], 'chainListReports');

      // Respond, then pump enough frames for the screen to rebuild.
      handle.mock.simulateMessage({
        'id': _latestRpcId(handle.mock),
        'result': {'reports': []},
      });
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));

      expect(find.text('Recent team jobs'), findsOneWidget);
      expect(find.text('No reports yet'), findsOneWidget);
      await teardown(tester, handle);
    });

    testWidgets('renders one row per chain report with summary copy',
        (tester) async {
      final handle = await mountScreen(tester);

      handle.mock.simulateMessage({
        'id': _latestRpcId(handle.mock),
        'result': {
          'reports': [
            {
              'chainId': 'chain_8d2f4a1b',
              'chainMandateId': 'chainmandate_a',
              'orchestratorOwnerId': 'envoy:owner:o',
              'orchestratorPeerId': '12D3KooW-o',
              'pinned': true,
              'createdAt': '2026-06-18T10:30:00.000Z',
              'chainSummary': {
                'subtaskCount': 4,
                'workerCount': 3,
                'synthesisCostUsd': 0.42,
              },
            },
            {
              'chainId': 'chain_aaaaaaaaaaaaaaaa',
              'chainMandateId': 'chainmandate_b',
              'orchestratorOwnerId': 'envoy:owner:o',
              'orchestratorPeerId': '12D3KooW-o',
              'pinned': false,
              'createdAt': '2026-06-17T08:00:00.000Z',
              'chainSummary': {
                'subtaskCount': 1,
                'workerCount': 1,
                'synthesisCostUsd': 0.05,
              },
            },
          ],
        },
      });
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));

      expect(find.textContaining('3 workers · 4 subtasks'), findsOneWidget);
      expect(find.textContaining('1 workers · 1 subtasks'), findsOneWidget);
      // Pinned star is shown on the first row.
      expect(find.byIcon(Icons.star), findsOneWidget);
      await teardown(tester, handle);
    });

    testWidgets('shows error state when RPC fails and exposes a Retry CTA',
        (tester) async {
      final handle = await mountScreen(tester);

      handle.mock.simulateMessage({
        'id': _latestRpcId(handle.mock),
        'error': {'message': 'boom'},
      });
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));

      expect(find.text('Failed to load chains'), findsOneWidget);
      expect(find.text('Retry'), findsOneWidget);
      await teardown(tester, handle);
    });

    testWidgets('refresh action re-issues chainListReports', (tester) async {
      final handle = await mountScreen(tester);

      // Drain the initial call.
      handle.mock.simulateMessage({
        'id': _latestRpcId(handle.mock),
        'result': {'reports': []},
      });
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));
      expect(handle.mock.sentMessages.length, 1);

      // Tap the refresh IconButton in the AppBar.
      await tester.tap(find.byIcon(Icons.refresh));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));

      // The second RPC should be chainListReports again.
      expect(handle.mock.sentMessages.length, 2);
      final refreshedJson = jsonDecode(handle.mock.sentMessages.last)
          as Map<String, dynamic>;
      expect(refreshedJson['method'], 'chainListReports');

      // Drain the second call to avoid leaving an open Completer
      // (the screen awaits its response).
      handle.mock.simulateMessage({
        'id': _latestRpcId(handle.mock),
        'result': {'reports': []},
      });
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));
      expect(handle.mock.sentMessages.length, 2);

      await teardown(tester, handle);
    });
  });
}