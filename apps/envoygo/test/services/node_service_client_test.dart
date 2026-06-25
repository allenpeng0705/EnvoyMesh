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

  group('NodeServiceClient config RPCs', () {
    test('updateNodeConfig sends modelProviders patch', () async {
      final mock = MockWebSocket();
      final homeClient = await connectWithTrackedMock(mock);
      final client = NodeServiceClient(homeClient);

      final callFuture = client.updateNodeConfig({
        'modelProviders': {
          'mode': 'openai-compatible',
          'endpoint': 'https://api.openai.com/v1',
          'modelName': 'gpt-4o-mini',
        },
      });

      await Future.delayed(Duration.zero);
      final sent = _lastSent(mock);
      expect(sent['method'], 'updateNodeConfig');
      expect(sent['params']['modelProviders']['mode'], 'openai-compatible');

      mock.simulateMessage({'id': sent['id'], 'result': null});
      await callFuture;
    });

    test('getBridgeConfig calls home RPC', () async {
      final mock = MockWebSocket();
      final homeClient = await connectWithTrackedMock(mock);
      final client = NodeServiceClient(homeClient);

      final callFuture = client.getBridgeConfig();
      await Future.delayed(Duration.zero);
      final sent = _lastSent(mock);
      expect(sent['method'], 'getBridgeConfig');

      mock.simulateMessage({
        'id': sent['id'],
        'result': {
          'enabled': true,
          'listenPort': 3031,
          'extAgents': [],
          'agentUrl': 'http://127.0.0.1:8010/message',
          'agentName': 'HomeClaw',
        },
      });
      final result = await callFuture;
      expect(result['agentName'], 'HomeClaw');
    });

    test('updateBridgeConfig sends activeExtAgent', () async {
      final mock = MockWebSocket();
      final homeClient = await connectWithTrackedMock(mock);
      final client = NodeServiceClient(homeClient);

      final callFuture = client.updateBridgeConfig({'activeExtAgent': 'hermes'});
      await Future.delayed(Duration.zero);
      final sent = _lastSent(mock);
      expect(sent['method'], 'updateBridgeConfig');
      expect(sent['params']['activeExtAgent'], 'hermes');

      mock.simulateMessage({
        'id': sent['id'],
        'result': {'ok': true},
      });
      await callFuture;
    });
  });

  group('NodeServiceClient terminal RPCs', () {
    test('listTerminalSessions parses home summaries', () async {
      final mock = MockWebSocket();
      final homeClient = await connectWithTrackedMock(mock);
      final client = NodeServiceClient(homeClient);

      final callFuture = client.listTerminalSessions();
      await Future.delayed(Duration.zero);
      final sent = _lastSent(mock);
      expect(sent['method'], 'listTerminalSessions');

      mock.simulateMessage({
        'id': sent['id'],
        'result': [
          {
            'sessionId': 'sess-1',
            'title': 'dev',
            'cwd': '/tmp',
            'shell': '/bin/zsh',
            'state': 'running',
            'createdAt': '2026-06-24T12:00:00.000Z',
            'lastActivityAt': '2026-06-24T12:00:00.000Z',
          },
        ],
      });

      final sessions = await callFuture;
      expect(sessions, hasLength(1));
      expect(sessions.single.id, 'sess-1');
      expect(sessions.single.runningProcess, '/bin/zsh');
      expect(sessions.single.isRunning, isTrue);
    });

    test('createTerminalSession sends title and cwd', () async {
      final mock = MockWebSocket();
      final homeClient = await connectWithTrackedMock(mock);
      final client = NodeServiceClient(homeClient);

      final callFuture = client.createTerminalSession(
        title: 'deploy',
        cwd: '/Users/me/work',
      );
      await Future.delayed(Duration.zero);
      final sent = _lastSent(mock);
      expect(sent['method'], 'createTerminalSession');
      expect(sent['params'], {
        'title': 'deploy',
        'cwd': '/Users/me/work',
      });

      mock.simulateMessage({
        'id': sent['id'],
        'result': {
          'sessionId': 'sess-new',
          'title': 'deploy',
          'cwd': '/Users/me/work',
          'shell': '/bin/zsh',
          'state': 'running',
          'createdAt': '2026-06-24T12:00:00.000Z',
          'lastActivityAt': '2026-06-24T12:00:00.000Z',
        },
      });

      final summary = await callFuture;
      expect(summary['sessionId'], 'sess-new');
    });

    test('homeTerminalWsOpen strips wsUrl to pathWithQuery', () async {
      final mock = MockWebSocket();
      final homeClient = await connectWithTrackedMock(mock);
      final client = NodeServiceClient(homeClient);

      final openFuture = client.homeTerminalWsOpen('sess-open');
      await Future.delayed(Duration.zero);
      final attachSent = _lastSent(mock);
      expect(attachSent['method'], 'terminalAttach');
      mock.simulateMessage({
        'id': attachSent['id'],
        'result': {
          'sessionId': 'sess-open',
          'token': 'tok',
          'wsUrl': 'ws://127.0.0.1:3032/ws/terminal/sess-open?token=tok',
          'cols': 80,
          'rows': 24,
        },
      });

      await Future.delayed(Duration.zero);
      final openSent = _lastSent(mock);
      expect(openSent['method'], 'homeTerminalWsOpen');
      expect(openSent['params']['pathWithQuery'],
          '/ws/terminal/sess-open?token=tok');

      mock.simulateMessage({
        'id': openSent['id'],
        'result': {'ok': true},
      });
      expect(await openFuture, {'ok': true});
    });

    test('homeTerminalWsClose forwards sessionId', () async {
      final mock = MockWebSocket();
      final homeClient = await connectWithTrackedMock(mock);
      final client = NodeServiceClient(homeClient);

      final callFuture = client.homeTerminalWsClose(sessionId: 'sess-x');
      await Future.delayed(Duration.zero);
      final sent = _lastSent(mock);
      expect(sent['method'], 'homeTerminalWsClose');
      expect(sent['params'], {'sessionId': 'sess-x'});

      mock.simulateMessage({'id': sent['id'], 'result': null});
      await callFuture;
    });
  });

  group('NodeServiceClient group chat RPCs', () {
    test('createChatRoom sends title and memberOwnerIds', () async {
      final mock = MockWebSocket();
      final homeClient = await connectWithTrackedMock(mock);
      final client = NodeServiceClient(homeClient);

      final callFuture = client.createChatRoom(
        'Weekend',
        memberOwnerIds: ['envoy:owner:bob'],
      );
      await Future.delayed(Duration.zero);
      final sent = _lastSent(mock);
      expect(sent['method'], 'createChatRoom');
      expect(sent['params'], {
        'title': 'Weekend',
        'memberOwnerIds': ['envoy:owner:bob'],
      });

      mock.simulateMessage({
        'id': sent['id'],
        'result': {
          'roomId': 'room-1',
          'title': 'Weekend',
          'memberOwnerIds': ['envoy:owner:abc', 'envoy:owner:bob'],
          'revision': 1,
          'updatedAt': '2026-06-24T12:00:00.000Z',
        },
      });
      final room = await callFuture;
      expect(room['roomId'], 'room-1');
    });

    test('inviteToChatRoom sends memberOwnerIds array', () async {
      final mock = MockWebSocket();
      final homeClient = await connectWithTrackedMock(mock);
      final client = NodeServiceClient(homeClient);

      final callFuture =
          client.inviteToChatRoom('room-1', 'envoy:owner:carol');
      await Future.delayed(Duration.zero);
      final sent = _lastSent(mock);
      expect(sent['method'], 'inviteToChatRoom');
      expect(sent['params'], {
        'roomId': 'room-1',
        'memberOwnerIds': ['envoy:owner:carol'],
      });

      mock.simulateMessage({'id': sent['id'], 'result': {'roomId': 'room-1'}});
      await callFuture;
    });

    test('listChatHistoryForThread uses peerOwnerId param', () async {
      final mock = MockWebSocket();
      final homeClient = await connectWithTrackedMock(mock);
      final client = NodeServiceClient(homeClient);

      final callFuture = client.listChatHistoryForThread(
        'node1:room:room-1',
        'room:room-1',
        selfOwnerId: 'envoy:owner:abc',
      );
      await Future.delayed(Duration.zero);
      final sent = _lastSent(mock);
      expect(sent['method'], 'listChatHistory');
      expect(sent['params']['peerOwnerId'], 'room:room-1');

      mock.simulateMessage({
        'id': sent['id'],
        'result': [
          {
            'messageId': 'm1',
            'sender': {'ownerId': 'envoy:owner:abc'},
            'content': {'text': 'hello'},
            'metadata': {'timestamp': '2026-06-24T12:00:00.000Z'},
          },
        ],
      });
      final messages = await callFuture;
      expect(messages, hasLength(1));
      expect(messages.single.isOutbound, isTrue);
    });
  });
}
