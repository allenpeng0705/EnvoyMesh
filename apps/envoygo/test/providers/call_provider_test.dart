// Phase 42E — CallProvider drives WebRtcCallTransport.
//
// Tests cover the provider lifecycle:
//   startCall builds a transport, generates SDP, posts sendCallInvite,
//     attaches the transport to state, and updates connectionState.
//   acceptCall reads the cached remote SDP, builds a transport, posts
//     acceptCallInvite, marks the call active.
//   endCall / declineCall close the transport and reset state.
//   toggleMute flips setMute on the transport and posts setCallMuted.
//   onEvent('call:ended') / ('call:rejected') close the transport
//     and reset state, even when the user didn't drive the transition.
//
// The transport is injected via the `transportFactory` hook so the
// tests don't need flutter_webrtc (which requires real platform
// channels). The NodeServiceClient is exercised through the
// `MockWebSocket` + `HomeRemoteClient` pattern from
// `node_service_client_test.dart`.

import 'dart:convert';

import 'package:envoygo/providers/call_provider.dart';
import 'package:envoygo/services/home_remote_client.dart';
import 'package:envoygo/services/node_service_client.dart';
import 'package:envoygo/services/web_socket_like.dart';
import 'package:envoygo/models/call_event.dart';
import 'package:envoygo/webrtc_call_transport.dart';
import 'package:flutter_test/flutter_test.dart';

/// Mock WebSocket — same pattern as `node_service_client_test.dart`.
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
  await Future<void>.delayed(Duration.zero);
  tracked.simulateOpen();
  await future;
  tracked.simulateMessage({'event': 'connected'});
  await Future<void>.delayed(Duration.zero);
  return client;
}

Map<String, dynamic> _lastSent(MockWebSocket mock) =>
    jsonDecode(mock.sentMessages.last) as Map<String, dynamic>;

/// Records calls into the FakeTransport — mimics WebRtcCallTransport's
/// public surface without depending on flutter_webrtc.
class FakeTransport {
  final String callId;
  final List<IceServer> iceServers;
  bool startOfferCalled = false;
  bool startAnswerCalled = false;
  String remoteSdpArg = '';
  bool closeCalled = false;
  bool? lastMuted;

  String offerSdp;
  String answerSdp;

  FakeTransport({
    required this.callId,
    required this.iceServers,
    this.offerSdp = 'v=0\r\no=- fake-offer\r\n',
    this.answerSdp = 'v=0\r\no=- fake-answer\r\n',
  });

  Future<String> startOffer() async {
    startOfferCalled = true;
    return offerSdp;
  }

  Future<String> startAnswer(String remoteSdp) async {
    startAnswerCalled = true;
    remoteSdpArg = remoteSdp;
    return answerSdp;
  }

  void setMute(bool muted) {
    lastMuted = muted;
  }

  Future<void> close() async {
    closeCalled = true;
  }
}

Future<CallProvider> buildProvider({
  required MockWebSocket mock,
  required List<FakeTransport> transports,
}) async {
  final homeClient = await connectWithTrackedMock(mock);
  final provider = CallProvider(
    NodeServiceClient(homeClient),
    transportFactory: ({
      required String callId,
      required List<IceServer> iceServers,
      required void Function(dynamic) onRemoteStream,
      required void Function(dynamic) onConnectionStateChange,
      required void Function(String, String) onSdpGenerated,
      required void Function(CallIceCandidate) onIceCandidate,
    }) {
      final t = FakeTransport(callId: callId, iceServers: iceServers);
      transports.add(t);
      // Return a stub that implements only the surface the provider uses.
      return _StubTransport(t);
    },
  );
  return provider;
}

/// Thin shim that exposes the FakeTransport through the
/// WebRtcCallTransport surface the provider actually touches.
class _StubTransport extends WebRtcCallTransport {
  final FakeTransport _inner;
  _StubTransport(this._inner)
      : super(
          callId: _inner.callId,
          iceServers: _inner.iceServers,
          onRemoteStream: (_) {},
          onConnectionStateChange: (_) {},
          onSdpGenerated: (_, __) {},
          onIceCandidate: (_) {},
          peerConnectionFactory: null,
          getUserMedia: null,
        );

  @override
  Future<String> startOffer() => _inner.startOffer();

  @override
  Future<String> startAnswer(String remoteSdp) =>
      _inner.startAnswer(remoteSdp);

  @override
  void setMute(bool muted) => _inner.setMute(muted);

  @override
  Future<void> close() => _inner.close();
}

void main() {
  group('CallProvider (Phase 42E)', () {
    test('startCall builds a transport, generates SDP, sends sendCallInvite',
        () async {
      final mock = MockWebSocket();
      final transports = <FakeTransport>[];
      final provider = await buildProvider(mock: mock, transports: transports);

      // Kick off the call and let it reach the JSON-RPC layer.
      final callFuture = provider.startCall('envoy:owner:bob');
      await Future<void>.delayed(Duration.zero);

      // The transport should have been built and asked for an offer.
      expect(transports, hasLength(1));
      expect(transports.first.startOfferCalled, isTrue);

      // The provider should have sent sendCallInvite with the SDP.
      final sent = _lastSent(mock);
      expect(sent['method'], 'sendCallInvite');
      expect(sent['params']['targetOwnerId'], 'envoy:owner:bob');
      expect(sent['params']['sdpOffer'], 'v=0\r\no=- fake-offer\r\n');

      // Reply with a call id.
      mock.simulateMessage({
        'id': sent['id'],
        'result': '11111111-1111-4111-8111-111111111111',
      });

      final callId = await callFuture;
      expect(callId, '11111111-1111-4111-8111-111111111111');

      // Provider state now reflects the active call and holds the transport.
      expect(provider.state.callId, '11111111-1111-4111-8111-111111111111');
      expect(provider.state.peerOwnerId, 'envoy:owner:bob');
      expect(provider.state.connectionState, 'connecting');
      expect(provider.state.transport, isNotNull);
    });

    test('startCall returns null and closes the transport when the home refuses',
        () async {
      final mock = MockWebSocket();
      final transports = <FakeTransport>[];
      final provider = await buildProvider(mock: mock, transports: transports);

      final callFuture = provider.startCall('envoy:owner:bob');
      await Future<void>.delayed(Duration.zero);
      final sent = _lastSent(mock);
      mock.simulateMessage({'id': sent['id'], 'result': null});

      final callId = await callFuture;
      expect(callId, isNull);
      expect(transports, hasLength(1));
      expect(transports.first.closeCalled, isTrue);
      expect(provider.state.callId, isNull);
    });

    test('acceptCall reads cached remote SDP and sends acceptCallInvite',
        () async {
      final mock = MockWebSocket();
      final transports = <FakeTransport>[];
      final provider = await buildProvider(mock: mock, transports: transports);

      // Stage an incoming call event with a remote SDP.
      provider.handleTestEvent({
        'type': 'call:incoming',
        'callId': '22222222-2222-4222-8222-222222222222',
        'peerOwnerId': 'envoy:owner:carol',
        'peerDisplayName': 'Carol',
        'sdpOffer': 'v=0\r\no=- remote-offer\r\n',
      });

      expect(provider.state.callId,
          '22222222-2222-4222-8222-222222222222');
      expect(provider.state.isIncoming, isTrue);

      // Accept the call.
      final acceptFuture = provider.acceptCall();
      await Future<void>.delayed(Duration.zero);

      expect(transports, hasLength(1));
      expect(transports.first.startAnswerCalled, isTrue);
      expect(transports.first.remoteSdpArg, 'v=0\r\no=- remote-offer\r\n');

      final sent = _lastSent(mock);
      expect(sent['method'], 'acceptCallInvite');
      expect(sent['params']['callId'],
          '22222222-2222-4222-8222-222222222222');
      expect(sent['params']['sdpAnswer'], 'v=0\r\no=- fake-answer\r\n');

      mock.simulateMessage({'id': sent['id'], 'result': true});

      final ok = await acceptFuture;
      expect(ok, isTrue);
      expect(provider.state.isIncoming, isFalse);
      expect(provider.state.isActive, isTrue);
      expect(provider.state.connectionState, 'connected');
    });

    test('acceptCall returns false when no remote SDP is cached', () async {
      final mock = MockWebSocket();
      final transports = <FakeTransport>[];
      final provider = await buildProvider(mock: mock, transports: transports);

      // Force-callId but no remote SDP.
      provider.handleTestEvent({
        'type': 'call:incoming',
        'callId': '33333333-3333-4333-8333-333333333333',
        'peerOwnerId': 'envoy:owner:dan',
        'peerDisplayName': 'Dan',
      });

      final ok = await provider.acceptCall();
      expect(ok, isFalse);
      expect(transports, isEmpty);
    });

    test('endCall closes the transport and posts endCall to the home',
        () async {
      final mock = MockWebSocket();
      final transports = <FakeTransport>[];
      final provider = await buildProvider(mock: mock, transports: transports);

      // Start and accept a call to attach a transport.
      final startFuture = provider.startCall('envoy:owner:bob');
      await Future<void>.delayed(Duration.zero);
      var sent = _lastSent(mock);
      mock.simulateMessage({
        'id': sent['id'],
        'result': '44444444-4444-4444-8444-444444444444',
      });
      await startFuture;
      expect(transports, hasLength(1));

      // End the call.
      final endFuture = provider.endCall();
      await Future<void>.delayed(Duration.zero);
      sent = _lastSent(mock);
      expect(sent['method'], 'endCall');
      expect(sent['params']['callId'], '44444444-4444-4444-8444-444444444444');

      mock.simulateMessage({'id': sent['id'], 'result': true});
      final ok = await endFuture;

      expect(ok, isTrue);
      expect(transports.first.closeCalled, isTrue);
      expect(provider.state.callId, isNull);
    });

    test('declineCall closes the transport and posts declineCallInvite',
        () async {
      final mock = MockWebSocket();
      final transports = <FakeTransport>[];
      final provider = await buildProvider(mock: mock, transports: transports);

      provider.handleTestEvent({
        'type': 'call:incoming',
        'callId': '55555555-5555-4555-8555-555555555555',
        'peerOwnerId': 'envoy:owner:eve',
        'peerDisplayName': 'Eve',
        'sdpOffer': 'v=0\r\no=- remote\r\n',
      });

      final declineFuture = provider.declineCall();
      await Future<void>.delayed(Duration.zero);
      final sent = _lastSent(mock);
      expect(sent['method'], 'declineCallInvite');
      expect(sent['params']['callId'], '55555555-5555-4555-8555-555555555555');
      expect(sent['params']['reason'], 'declined');

      mock.simulateMessage({'id': sent['id'], 'result': true});
      final ok = await declineFuture;
      expect(ok, isTrue);
      expect(provider.state.callId, isNull);
    });

    test('toggleMute flips setMute on the transport and posts setCallMuted',
        () async {
      final mock = MockWebSocket();
      final transports = <FakeTransport>[];
      final provider = await buildProvider(mock: mock, transports: transports);

      // Establish an active call.
      final startFuture = provider.startCall('envoy:owner:bob');
      await Future<void>.delayed(Duration.zero);
      var sent = _lastSent(mock);
      mock.simulateMessage({
        'id': sent['id'],
        'result': '66666666-6666-4666-8666-666666666666',
      });
      await startFuture;

      // Toggle mute.
      final toggleFuture = provider.toggleMute();
      await Future<void>.delayed(Duration.zero);
      sent = _lastSent(mock);
      expect(sent['method'], 'setCallMuted');
      expect(sent['params']['callId'], '66666666-6666-4666-8666-666666666666');
      expect(sent['params']['muted'], isTrue);

      mock.simulateMessage({'id': sent['id'], 'result': true});
      await toggleFuture;

      expect(transports.first.lastMuted, isTrue);
      expect(provider.state.isMuted, isTrue);

      // Toggle again to unmute.
      final toggle2Future = provider.toggleMute();
      await Future<void>.delayed(Duration.zero);
      sent = _lastSent(mock);
      expect(sent['params']['muted'], isFalse);
      mock.simulateMessage({'id': sent['id'], 'result': true});
      await toggle2Future;
      expect(transports.first.lastMuted, isFalse);
      expect(provider.state.isMuted, isFalse);
    });

    test('call:ended event from the home closes the active transport', () async {
      final mock = MockWebSocket();
      final transports = <FakeTransport>[];
      final provider = await buildProvider(mock: mock, transports: transports);

      // Establish a call.
      final startFuture = provider.startCall('envoy:owner:bob');
      await Future<void>.delayed(Duration.zero);
      var sent = _lastSent(mock);
      mock.simulateMessage({
        'id': sent['id'],
        'result': '77777777-7777-4777-8777-777777777777',
      });
      await startFuture;
      expect(transports, hasLength(1));

      // Home emits call:ended.
      provider.handleTestEvent({
        'type': 'call:ended',
        'callId': '77777777-7777-4777-8777-777777777777',
        'reason': 'normal',
      });

      expect(transports.first.closeCalled, isTrue);
      expect(provider.state.callId, isNull);
    });

    test('call:rejected event from the home closes the active transport',
        () async {
      final mock = MockWebSocket();
      final transports = <FakeTransport>[];
      final provider = await buildProvider(mock: mock, transports: transports);

      final startFuture = provider.startCall('envoy:owner:bob');
      await Future<void>.delayed(Duration.zero);
      var sent = _lastSent(mock);
      mock.simulateMessage({
        'id': sent['id'],
        'result': '88888888-8888-4888-8888-888888888888',
      });
      await startFuture;
      expect(transports, hasLength(1));

      provider.handleTestEvent({
        'type': 'call:rejected',
        'callId': '88888888-8888-4888-8888-888888888888',
        'reason': 'busy',
      });

      expect(transports.first.closeCalled, isTrue);
      expect(provider.state.callId, isNull);
    });

    test('dismissIncoming clears state but does not touch the transport',
        () async {
      final mock = MockWebSocket();
      final transports = <FakeTransport>[];
      final provider = await buildProvider(mock: mock, transports: transports);

      provider.handleTestEvent({
        'type': 'call:incoming',
        'callId': '99999999-9999-4999-8999-999999999999',
        'peerOwnerId': 'envoy:owner:frank',
        'peerDisplayName': 'Frank',
        'sdpOffer': 'v=0\r\n',
      });

      expect(provider.state.isIncoming, isTrue);
      provider.dismissIncoming();
      expect(provider.state.callId, isNull);
      expect(provider.state.isIncoming, isFalse);
      // No transport was built — nothing to close.
      expect(transports, isEmpty);
    });
  });
}