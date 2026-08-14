// Widget tests for ActiveChainDetailScreen step cancel/reassign residual risks.
//
// Same MockWebSocket + HomeRemoteClient pattern as recent_chains_screen_test.dart.
// Avoid pumpAndSettle — HomeRemoteClient timers never settle.

import 'dart:convert';

import 'package:envoygo/l10n/app_localizations.dart';
import 'package:envoygo/providers/node_provider.dart';
import 'package:envoygo/screens/chains/active_chain_detail_screen.dart';
import 'package:envoygo/services/home_remote_client.dart';
import 'package:envoygo/services/web_socket_like.dart';
import 'package:envoygo/storage/local_database.dart';
import 'package:envoygo/storage/secure_storage.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

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

class _StubNodeNotifier extends NodeNotifier {
  _StubNodeNotifier({required super.ref})
      : super(
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

Map<String, dynamic> _liveState({
  String stepState = 'running',
  List<Map<String, dynamic>>? deliveries,
}) {
  return {
    'chainId': 'chain_live',
    'chainMandateId': 'cm_live',
    'subtaskCount': 1,
    'bidCount': 0,
    'awardedCount': 1,
    'partialCount': 0,
    'chainCancelled': false,
    'published': false,
    'budgetSpentUsd': 0,
    'budgetMaxUsd': 10,
    'goal': 'Do the thing',
    'awardMode': 'direct',
    'steps': [
      {
        'subtaskId': 'sub_1',
        'objective': 'Write the summary',
        'state': stepState,
        'dependsOn': <String>[],
      },
    ],
    if (deliveries != null) 'inputDeliveries': deliveries,
  };
}

/// Reply to the newest RPC whose method matches [method].
void _replyLatestMethod(
  MockWebSocket mock,
  String method,
  Object? result,
) {
  for (var i = mock.sentMessages.length - 1; i >= 0; i--) {
    final msg = jsonDecode(mock.sentMessages[i]) as Map<String, dynamic>;
    if (msg['method'] == method) {
      mock.simulateMessage({'id': msg['id'], 'result': result});
      return;
    }
  }
  throw StateError('No RPC with method $method in ${mock.sentMessages}');
}

Future<ScreenHandle> mountDetail(WidgetTester tester) async {
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
    await future;
    mock.simulateMessage({'event': 'connected'});
    await Future<void>.delayed(Duration.zero);

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

  if (handle == null) {
    throw StateError('tester.runAsync returned null');
  }

  await tester.pumpWidget(
    UncontrolledProviderScope(
      container: handle.container,
      child: MaterialApp(
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        locale: const Locale('en'),
        home: const ActiveChainDetailScreen(chainId: 'chain_live'),
      ),
    ),
  );
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 50));

  return handle;
}

Future<void> teardown(WidgetTester tester, ScreenHandle handle) async {
  handle.container.dispose();
  await tester.runAsync(() async => handle.client.dispose());
}

Future<void> _loadLiveState(
  WidgetTester tester,
  ScreenHandle handle, {
  Map<String, dynamic>? state,
}) async {
  _replyLatestMethod(handle.mock, 'chainGetState', state ?? _liveState());
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 100));
}

void main() {
  group('ActiveChainDetailScreen step control residual risks', () {
    testWidgets('cancel step with empty cancelled shows failure, not success',
        (tester) async {
      final handle = await mountDetail(tester);
      await _loadLiveState(tester, handle);

      expect(find.text('Write the summary'), findsOneWidget);
      expect(find.text('Cancel step'), findsOneWidget);

      await tester.tap(find.text('Cancel step'));
      await tester.pump();
      expect(find.text('Cancel this step?'), findsOneWidget);

      await tester.tap(find.widgetWithText(FilledButton, 'Cancel step'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));

      _replyLatestMethod(handle.mock, 'chainCancel', {
        'chainId': 'chain_live',
        'cancelled': <String>[],
      });
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));

      expect(find.text('Could not cancel this step'), findsOneWidget);
      expect(find.text('Step cancelled'), findsNothing);

      await teardown(tester, handle);
    });

    testWidgets('cancel step success when cancelled includes subtaskId',
        (tester) async {
      final handle = await mountDetail(tester);
      await _loadLiveState(tester, handle);

      await tester.tap(find.text('Cancel step'));
      await tester.pump();
      await tester.tap(find.widgetWithText(FilledButton, 'Cancel step'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));

      _replyLatestMethod(handle.mock, 'chainCancel', {
        'chainId': 'chain_live',
        'cancelled': <String>['sub_1'],
      });
      await tester.pump();
      // Post-cancel refresh.
      _replyLatestMethod(
        handle.mock,
        'chainGetState',
        _liveState(stepState: 'cancelled'),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));

      expect(find.text('Step cancelled'), findsOneWidget);
      expect(find.text('Could not cancel this step'), findsNothing);

      await teardown(tester, handle);
    });

    testWidgets('reassign step surfaces error when ok is false', (tester) async {
      final handle = await mountDetail(tester);
      await _loadLiveState(tester, handle);

      expect(find.text('Reassign'), findsOneWidget);
      await tester.tap(find.text('Reassign'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));

      _replyLatestMethod(handle.mock, 'chainReassignSubtask', {
        'ok': false,
        'error': 'no_candidate',
      });
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));

      expect(find.text('no_candidate'), findsOneWidget);
      expect(find.text('Step reassigned'), findsNothing);

      await teardown(tester, handle);
    });

    testWidgets('hides Retry for fresh pending delivery', (tester) async {
      final handle = await mountDetail(tester);
      await _loadLiveState(
        tester,
        handle,
        state: _liveState(
          deliveries: [
            {
              'chainId': 'chain_live',
              'workerPeerId': 'worker_peer_1',
              'sourceRelativePath': 'imports/a/brief.pdf',
              'phase': 'pending',
              'updatedAt': DateTime.now().toUtc().toIso8601String(),
            },
          ],
        ),
      );

      expect(find.textContaining('brief.pdf'), findsOneWidget);
      expect(find.text('Retry'), findsNothing);

      await teardown(tester, handle);
    });

    testWidgets('shows Retry for stale pending delivery', (tester) async {
      final handle = await mountDetail(tester);
      await _loadLiveState(
        tester,
        handle,
        state: _liveState(
          deliveries: [
            {
              'chainId': 'chain_live',
              'workerPeerId': 'worker_peer_1',
              'sourceRelativePath': 'imports/a/brief.pdf',
              'phase': 'pending',
              'updatedAt': '2020-01-01T00:00:00.000Z',
            },
          ],
        ),
      );

      expect(find.text('Retry'), findsOneWidget);

      await teardown(tester, handle);
    });
  });
}
