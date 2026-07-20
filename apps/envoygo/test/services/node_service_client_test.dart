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

    test('listActiveChains sends chainListActive and parses chains', () async {
      final mock = MockWebSocket();
      final homeClient = await connectWithTrackedMock(mock);

      final client = NodeServiceClient(homeClient);
      final callFuture = client.listActiveChains();
      await Future.delayed(Duration.zero);
      final sent = _lastSent(mock);
      expect(sent['method'], 'chainListActive');
      mock.simulateMessage({
        'id': sent['id'],
        'result': {
          'chains': [
            {
              'chainId': 'chain_active_1',
              'chainMandateId': 'cm_1',
              'subtaskCount': 2,
              'bidCount': 1,
              'awardedCount': 1,
              'partialCount': 0,
              'chainCancelled': false,
              'published': false,
              'budgetSpentUsd': 1.5,
              'budgetMaxUsd': 10,
              'goal': 'Summarize Q3',
            },
          ],
        },
      });

      final chains = await callFuture;
      expect(chains, hasLength(1));
      expect(chains.first.chainId, 'chain_active_1');
      expect(chains.first.goal, 'Summarize Q3');
    });

    test('getChainState sends chainId and unwraps state', () async {
      final mock = MockWebSocket();
      final homeClient = await connectWithTrackedMock(mock);

      final client = NodeServiceClient(homeClient);
      final callFuture = client.getChainState('chain_live');
      await Future.delayed(Duration.zero);
      final sent = _lastSent(mock);
      expect(sent['method'], 'chainGetState');
      expect(sent['params'], {'chainId': 'chain_live'});
      mock.simulateMessage({
        'id': sent['id'],
        'result': {
          'chainId': 'chain_live',
          'chainMandateId': 'cm_live',
          'subtaskCount': 1,
          'bidCount': 0,
          'awardedCount': 0,
          'partialCount': 0,
          'chainCancelled': false,
          'published': false,
          'budgetSpentUsd': 0,
          'budgetMaxUsd': 5,
        },
      });

      final state = await callFuture;
      expect(state, isNotNull);
      expect(state!.chainId, 'chain_live');
    });
  });

  // ----------------------------------------------------------------------
  // Phase 42C — Voice / video call RPCs.
  //
  // These tests replace the Phase 38 stubs. The home node expects
  // (targetOwnerId, sdpOffer, iceServers?) for sendCallInvite and
  // (callId, sdpAnswer, iceServers?) for acceptCallInvite. The five
  // methods here exercise both happy paths and edge cases (null callId,
  // omitted iceServers, JSON-RPC error propagation).
  // ----------------------------------------------------------------------

  group('NodeServiceClient call RPCs (Phase 42C)', () {
    test('sendCallInvite sends targetOwnerId, sdpOffer, and iceServers', () async {
      final mock = MockWebSocket();
      final homeClient = await connectWithTrackedMock(mock);
      final client = NodeServiceClient(homeClient);

      final iceServers = [
        {'urls': 'stun:stun.example.com:3478'},
        {'urls': 'turn:turn.example.com:3478', 'username': 'u', 'credential': 'c'},
      ];
      final callFuture = client.sendCallInvite(
        'envoy:owner:bob',
        'v=0\r\no=- 1 1 IN IP4 0.0.0.0\r\n',
        iceServers: iceServers,
      );

      await Future.delayed(Duration.zero);
      final sent = _lastSent(mock);
      expect(sent['method'], 'sendCallInvite');
      expect(sent['params']['targetOwnerId'], 'envoy:owner:bob');
      expect(sent['params']['sdpOffer'], startsWith('v=0'));
      expect(sent['params']['iceServers'], iceServers);

      mock.simulateMessage({
        'id': sent['id'],
        'result': '11111111-1111-4111-8111-111111111111',
      });

      final callId = await callFuture;
      expect(callId, '11111111-1111-4111-8111-111111111111');
    });

    test('sendCallInvite omits iceServers when not provided', () async {
      final mock = MockWebSocket();
      final homeClient = await connectWithTrackedMock(mock);
      final client = NodeServiceClient(homeClient);

      final callFuture = client.sendCallInvite(
        'envoy:owner:bob',
        'v=0\r\n',
      );

      await Future.delayed(Duration.zero);
      final sent = _lastSent(mock);
      expect(sent['params'].containsKey('iceServers'), isFalse,
          reason: 'iceServers must be omitted from the wire when not given — '
              'the home injects its 3-server STUN default (Phase 42 §5.1).');
      expect(sent['params'], {'targetOwnerId': 'envoy:owner:bob', 'sdpOffer': 'v=0\r\n'});

      mock.simulateMessage({'id': sent['id'], 'result': 'call-id'});
      expect(await callFuture, 'call-id');
    });

    test('sendCallInvite returns null when the home refuses', () async {
      final mock = MockWebSocket();
      final homeClient = await connectWithTrackedMock(mock);
      final client = NodeServiceClient(homeClient);

      final callFuture = client.sendCallInvite('envoy:owner:bob', 'v=0\r\n');
      await Future.delayed(Duration.zero);
      final sent = _lastSent(mock);
      mock.simulateMessage({'id': sent['id'], 'result': null});

      expect(await callFuture, isNull);
    });

    test('acceptCallInvite sends callId, sdpAnswer, and iceServers', () async {
      final mock = MockWebSocket();
      final homeClient = await connectWithTrackedMock(mock);
      final client = NodeServiceClient(homeClient);

      final iceServers = [
        {'urls': 'stun:stun.example.com:3478'},
      ];
      final callFuture = client.acceptCallInvite(
        '22222222-2222-4222-8222-222222222222',
        'v=0\r\no=- 2 2 IN IP4 0.0.0.0\r\n',
        iceServers: iceServers,
      );

      await Future.delayed(Duration.zero);
      final sent = _lastSent(mock);
      expect(sent['method'], 'acceptCallInvite');
      expect(sent['params']['callId'], '22222222-2222-4222-8222-222222222222');
      expect(sent['params']['sdpAnswer'], startsWith('v=0'));
      expect(sent['params']['iceServers'], iceServers);

      mock.simulateMessage({'id': sent['id'], 'result': true});
      expect(await callFuture, isTrue);
    });

    test('acceptCallInvite returns false when the home refuses', () async {
      final mock = MockWebSocket();
      final homeClient = await connectWithTrackedMock(mock);
      final client = NodeServiceClient(homeClient);

      final callFuture = client.acceptCallInvite('call-id', 'v=0\r\n');
      await Future.delayed(Duration.zero);
      final sent = _lastSent(mock);
      mock.simulateMessage({'id': sent['id'], 'result': false});

      expect(await callFuture, isFalse);
    });

    test('declineCallInvite sends callId and reason', () async {
      final mock = MockWebSocket();
      final homeClient = await connectWithTrackedMock(mock);
      final client = NodeServiceClient(homeClient);

      final callFuture = client.declineCallInvite(
        '33333333-3333-4333-8333-333333333333',
        'busy',
      );

      await Future.delayed(Duration.zero);
      final sent = _lastSent(mock);
      expect(sent['method'], 'declineCallInvite');
      expect(sent['params'], {
        'callId': '33333333-3333-4333-8333-333333333333',
        'reason': 'busy',
      });

      mock.simulateMessage({'id': sent['id'], 'result': true});
      expect(await callFuture, isTrue);
    });

    test('endCall sends callId only', () async {
      final mock = MockWebSocket();
      final homeClient = await connectWithTrackedMock(mock);
      final client = NodeServiceClient(homeClient);

      final callFuture = client.endCall('44444444-4444-4444-8444-444444444444');
      await Future.delayed(Duration.zero);
      final sent = _lastSent(mock);
      expect(sent['method'], 'endCall');
      expect(sent['params'], {'callId': '44444444-4444-4444-8444-444444444444'});

      mock.simulateMessage({'id': sent['id'], 'result': true});
      expect(await callFuture, isTrue);
    });

    test('setCallMuted sends callId and muted', () async {
      final mock = MockWebSocket();
      final homeClient = await connectWithTrackedMock(mock);
      final client = NodeServiceClient(homeClient);

      final callFuture = client.setCallMuted(
        '55555555-5555-4555-8555-555555555555',
        true,
      );

      await Future.delayed(Duration.zero);
      final sent = _lastSent(mock);
      expect(sent['method'], 'setCallMuted');
      expect(sent['params'], {
        'callId': '55555555-5555-4555-8555-555555555555',
        'muted': true,
      });

      mock.simulateMessage({'id': sent['id'], 'result': true});
      await callFuture; // void return
    });

    test('setCallMuted sends muted=false to unmute', () async {
      final mock = MockWebSocket();
      final homeClient = await connectWithTrackedMock(mock);
      final client = NodeServiceClient(homeClient);

      final callFuture = client.setCallMuted('call-id', false);
      await Future.delayed(Duration.zero);
      final sent = _lastSent(mock);
      expect(sent['params']['muted'], isFalse);

      mock.simulateMessage({'id': sent['id'], 'result': true});
      await callFuture;
    });

    test('call RPCs propagate JSON-RPC errors', () async {
      final mock = MockWebSocket();
      final homeClient = await connectWithTrackedMock(mock);
      final client = NodeServiceClient(homeClient);

      final callFuture = client.sendCallInvite('envoy:owner:bob', 'v=0\r\n');
      await Future.delayed(Duration.zero);
      final sent = _lastSent(mock);
      mock.simulateMessage({
        'id': sent['id'],
        'error': {'message': 'peer not bonded'},
      });

      await expectLater(callFuture, throwsA(isA<Exception>()));
    });

    test('sendCallInvite sends sdpOffer verbatim (no client-side SDP mutation)',
        () async {
      final mock = MockWebSocket();
      final homeClient = await connectWithTrackedMock(mock);
      final client = NodeServiceClient(homeClient);

      const rawSdp = 'v=0\r\n'
          'o=- 1234567890 1234567890 IN IP4 192.168.1.42\r\n'
          's=-\r\n'
          't=0 0\r\n'
          'm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n'
          'c=IN IP4 192.168.1.42\r\n'
          'a=rtpmap:111 opus/48000/2\r\n';
      final callFuture = client.sendCallInvite('envoy:owner:bob', rawSdp);
      await Future.delayed(Duration.zero);
      final sent = _lastSent(mock);
      expect(sent['params']['sdpOffer'], rawSdp);

      mock.simulateMessage({'id': sent['id'], 'result': 'call-id'});
      await callFuture;
    });
  });

  group('NodeServiceClient libraryRead (45C)', () {
    test('sends libraryRead with targetOwnerId + path', () async {
      final mock = MockWebSocket();
      final homeClient = await connectWithTrackedMock(mock);
      final client = NodeServiceClient(homeClient);

      final callFuture = client.libraryRead(
        targetOwnerId: 'envoy:owner:alice',
        path: 'hello.md',
      );
      await Future.delayed(Duration.zero);
      final sent = _lastSent(mock);
      expect(sent['method'], 'libraryRead');
      expect(sent['params'], {
        'targetOwnerId': 'envoy:owner:alice',
        'path': 'hello.md',
      });

      mock.simulateMessage({
        'id': sent['id'],
        'result': {
          'peerOwnerId': 'envoy:owner:alice',
          'libp2pPeerId': '12D3KooAlice',
          'status': 'ok',
          'body': '# Hello',
          'contentType': 'text/markdown',
          'contentHash': 'abc',
          'byteLength': 7,
          'etag': 'abcdef0123456789',
          'latencyMs': 42,
        },
      });

      final result = await callFuture;
      expect(result.status, 'ok');
      expect(result.body, '# Hello');
      expect(result.contentType, 'text/markdown');
      expect(result.etag, 'abcdef0123456789');
    });

    test('forwards range and ifNoneMatch', () async {
      final mock = MockWebSocket();
      final homeClient = await connectWithTrackedMock(mock);
      final client = NodeServiceClient(homeClient);

      final callFuture = client.libraryRead(
        targetOwnerId: 'envoy:owner:alice',
        path: 'big.bin',
        range: {'start': 0, 'end': 9},
        ifNoneMatch: 'etag99',
      );
      await Future.delayed(Duration.zero);
      final sent = _lastSent(mock);
      expect(sent['params']['range'], {'start': 0, 'end': 9});
      expect(sent['params']['ifNoneMatch'], 'etag99');

      mock.simulateMessage({
        'id': sent['id'],
        'result': {
          'peerOwnerId': 'envoy:owner:alice',
          'libp2pPeerId': '12D3',
          'status': 'ok',
          'body': '',
          'contentType': 'application/octet-stream',
          'latencyMs': 1,
        },
      });
      await callFuture;
    });
  });
}
