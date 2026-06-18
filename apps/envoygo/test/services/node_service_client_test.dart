// Phase 40 mobile mirror — NodeServiceClient chain RPC tests.
//
// Real (non-stub) tests for the `listChainReports` and `getChainReport`
// RPC wrappers. Uses the same `MockWebSocket` pattern as
// `home_remote_client_test.dart` to drive the JSON-RPC envelope and
// assert the request shape + response parsing.
//
// Replaces the previous TODO-only stub.

import 'dart:convert';
import 'package:envoygo/services/home_remote_client.dart';
import 'package:envoygo/services/node_service_client.dart';
import 'package:envoygo/services/web_socket_like.dart';
import 'package:flutter_test/flutter_test.dart';

/// Controllable mock WebSocket — same pattern as
/// `home_remote_client_test.dart`, kept local to this file.
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

/// Helper: connect a [HomeRemoteClient] with a [tracked] mock socket and
/// prime it with the `connected` event so subsequent `call()` requests
/// resolve. Returns the client + the mock so tests can inspect sent
/// messages.
Future<HomeRemoteClient> connectWithTrackedMock(MockWebSocket tracked) async {
  final client = HomeRemoteClient(
    HomeRemoteClientOptions(
      resolveCandidates: () async => const [
        HomeRemoteCandidate(name: 'relay', url: 'wss://relay.example.com'),
      ],
      createTransport: (_) => tracked,
      onHomeOnlineChange: (_) {},
      onActiveTransportChange: (_) {},
      perCandidateTimeoutMs: 1000,
      initialReconnectDelayMs: 1000,
    ),
  );
  final future = client.ensureConnected();
  await Future.delayed(Duration.zero);
  tracked.simulateOpen();
  await future;
  tracked.simulateMessage({'event': 'connected'});
  await Future.delayed(Duration.zero);
  return client;
}

Map<String, dynamic> _lastSent(MockWebSocket mock) =>
    jsonDecode(mock.sentMessages.last) as Map<String, dynamic>;

void main() {
  group('NodeServiceClient chain RPCs', () {
    test('listChainReports sends chainListReports with limit', () async {
      final mock = MockWebSocket();
      final homeClient = await connectWithTrackedMock(mock);

      final client = NodeServiceClient(homeClient);
      final callFuture = client.listChainReports(limit: 25);

      await Future.delayed(Duration.zero);
      final sent = _lastSent(mock);
      expect(sent['method'], 'chainListReports');
      expect(sent['params'], {'limit': 25});

      mock.simulateMessage({
        'id': sent['id'],
        'result': {
          'reports': [
            {
              'chainId': 'chain_a',
              'chainMandateId': 'chainmandate_a',
              'orchestratorOwnerId': 'envoy:owner:o',
              'orchestratorPeerId': '12D3KooW-o',
              'pinned': true,
              'createdAt': '2026-06-18T10:00:00.000Z',
              'chainSummary': {
                'subtaskCount': 2,
                'workerCount': 2,
                'synthesisCostUsd': 0.3,
              },
            },
          ],
        },
      });

      final reports = await callFuture;
      expect(reports, hasLength(1));
      expect(reports.first.chainId, 'chain_a');
      expect(reports.first.pinned, isTrue);
      expect(reports.first.chainSummary.workerCount, 2);
      expect(reports.first.chainSummary.synthesisCostUsd, 0.3);
    });

    test('listChainReports omits params when no filter is given', () async {
      final mock = MockWebSocket();
      final homeClient = await connectWithTrackedMock(mock);

      final client = NodeServiceClient(homeClient);
      final callFuture = client.listChainReports();
      await Future.delayed(Duration.zero);
      final sent = _lastSent(mock);
      expect(sent['method'], 'chainListReports');
      // No params → empty map (not null).
      expect(sent['params'], isA<Map>());
      expect(sent['params'], isEmpty);

      mock.simulateMessage({
        'id': sent['id'],
        'result': {'reports': []},
      });

      final reports = await callFuture;
      expect(reports, isEmpty);
    });

    test('listChainReports returns empty list on missing reports key', () async {
      final mock = MockWebSocket();
      final homeClient = await connectWithTrackedMock(mock);

      final client = NodeServiceClient(homeClient);
      final callFuture = client.listChainReports();
      await Future.delayed(Duration.zero);
      final sent = _lastSent(mock);
      mock.simulateMessage({
        'id': sent['id'],
        'result': {}, // no `reports` key
      });

      final reports = await callFuture;
      expect(reports, isEmpty);
    });

    test('getChainReport sends chainId and unwraps a populated report', () async {
      final mock = MockWebSocket();
      final homeClient = await connectWithTrackedMock(mock);

      final client = NodeServiceClient(homeClient);
      final callFuture = client.getChainReport('chain_full');
      await Future.delayed(Duration.zero);
      final sent = _lastSent(mock);
      expect(sent['method'], 'chainGetReport');
      expect(sent['params'], {'chainId': 'chain_full'});

      mock.simulateMessage({
        'id': sent['id'],
        'result': {
          'report': {
            'chainId': 'chain_full',
            'chainMandateId': 'chainmandate_full',
            'orchestratorOwnerId': 'o',
            'orchestratorPeerId': 'p',
            'pinned': false,
            'createdAt': '2026-06-18T10:00:00.000Z',
            'chainSummary': {
              'durationMs': 1000,
              'subtaskCount': 1,
              'workerCount': 1,
              'workerAllocations': [
                {
                  'subtaskId': 'subtask_a',
                  'workerPeerId': 'p',
                  'committedUsd': 1.0,
                },
              ],
              'synthesisCostUsd': 0.0,
            },
            'executiveSummary': 'Hello.',
            'sections': [],
          },
        },
      });

      final report = await callFuture;
      expect(report, isNotNull);
      expect(report!.chainId, 'chain_full');
      expect(report.executiveSummary, 'Hello.');
      expect(report.sections, isEmpty);
    });

    test('getChainReport returns null when report key is null', () async {
      final mock = MockWebSocket();
      final homeClient = await connectWithTrackedMock(mock);

      final client = NodeServiceClient(homeClient);
      final callFuture = client.getChainReport('chain_missing');
      await Future.delayed(Duration.zero);
      final sent = _lastSent(mock);
      mock.simulateMessage({
        'id': sent['id'],
        'result': {'report': null},
      });

      final report = await callFuture;
      expect(report, isNull);
    });

    test('listChainReports propagates JSON-RPC errors', () async {
      final mock = MockWebSocket();
      final homeClient = await connectWithTrackedMock(mock);

      final client = NodeServiceClient(homeClient);
      final callFuture = client.listChainReports();
      await Future.delayed(Duration.zero);
      final sent = _lastSent(mock);
      mock.simulateMessage({
        'id': sent['id'],
        'error': {'message': 'Method not found'},
      });

      await expectLater(callFuture, throwsA(isA<Exception>()));
    });
  });
}
