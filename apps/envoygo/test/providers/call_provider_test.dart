// Phase 42E — CallProvider drives WebRtcCallTransport.
// Phase 42F — CallProvider drives AudioSessionHelper for AVAudioSession.
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
//   42F — startCall / acceptCall configure AVAudioSession via the
//     injected AudioSessionHelper; endCall / declineCall / dispose
//     reset it; remote `call:ended`/`call:rejected`/`call:error` events
//     also reset it.
//
// The transport is injected via the `transportFactory` hook so the
// tests don't need flutter_webrtc (which requires real platform
// channels). The NodeServiceClient is exercised through the
// `MockWebSocket` + `HomeRemoteClient` pattern from
// `node_service_client_test.dart`. The AudioSessionHelper is exercised
// via the `CallProvider.withAudioSession` constructor + a mock
// MethodChannel.

import 'dart:convert';

import 'package:envoygo/providers/call_provider.dart';
import 'package:envoygo/services/audio_session_helper.dart';
import 'package:envoygo/services/home_remote_client.dart';
import 'package:envoygo/services/node_service_client.dart';
import 'package:envoygo/services/web_socket_like.dart';
import 'package:envoygo/models/call_event.dart';
import 'package:envoygo/webrtc_call_transport.dart';
import 'package:flutter/services.dart';
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
    // Auto-reply to getNodeConfig so _loadIceServers resolves promptly
    // without the test having to simulate it. Returns an empty iceServers
    // list, which the provider falls back from to the 3-STUN default.
    // (Sent on the next microtask so onMessage is set, mirroring a real server.)
    try {
      final msg = jsonDecode(data) as Map<String, dynamic>;
      if (msg['method'] == 'getNodeConfig' && msg['id'] != null) {
        Future<void>.microtask(() {
          onMessage?.call(WsMessageEvent(jsonEncode({
            'id': msg['id'],
            'result': <String, dynamic>{},
          })));
        });
      }
    } catch (_) {
      // Not a JSON-RPC message — ignore.
    }
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
  bool applyRemoteAnswerCalled = false;
  String remoteAnswerArg = '';
  bool addIceCandidateCalled = false;
  CallIceCandidate? lastIceCandidate;
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

  Future<void> applyRemoteAnswer(String remoteSdp) async {
    applyRemoteAnswerCalled = true;
    remoteAnswerArg = remoteSdp;
  }

  Future<void> addIceCandidate(CallIceCandidate candidate) async {
    addIceCandidateCalled = true;
    lastIceCandidate = candidate;
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
  Future<void> applyRemoteAnswer(String remoteSdp) =>
      _inner.applyRemoteAnswer(remoteSdp);

  @override
  Future<void> addIceCandidate(CallIceCandidate candidate) =>
      _inner.addIceCandidate(candidate);

  @override
  void setMute(bool muted) => _inner.setMute(muted);

  @override
  Future<void> close() => _inner.close();
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

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

    test('startCall uses peerDisplayName when provided', () async {
      final mock = MockWebSocket();
      final transports = <FakeTransport>[];
      final provider = await buildProvider(mock: mock, transports: transports);

      final callFuture = provider.startCall(
        'envoy:owner:bob',
        peerDisplayName: 'Bob Smith',
      );
      await Future<void>.delayed(Duration.zero);
      final sent = _lastSent(mock);
      mock.simulateMessage({
        'id': sent['id'],
        'result': '11111111-1111-4111-8111-111111111111',
      });
      await callFuture;
      expect(provider.state.peerDisplayName, 'Bob Smith');
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

    test(
        'acceptCall builds the transport with iceServers from the call:incoming envelope',
        () async {
      final mock = MockWebSocket();
      final transports = <FakeTransport>[];
      final provider = await buildProvider(mock: mock, transports: transports);

      // The home embeds iceServers (e.g. a TURN entry) in the call:incoming
      // event. The callee must build its RTCPeerConnection from THAT list,
      // not a fresh lookup — so both ends agree on ICE config.
      provider.handleTestEvent({
        'type': 'call:incoming',
        'callId': '55556666-5555-4666-8666-555566665555',
        'peerOwnerId': 'envoy:owner:eve',
        'peerDisplayName': 'Eve',
        'sdpOffer': 'v=0\r\no=- remote-offer\r\n',
        'iceServers': [
          {'urls': 'turn:turn.example.com:3478', 'username': 'u', 'credential': 'c'},
          {'urls': 'stun:stun.example.com:3478'},
        ],
      });

      final acceptFuture = provider.acceptCall();
      await Future<void>.delayed(Duration.zero);

      expect(transports, hasLength(1));
      expect(transports.first.iceServers, hasLength(2));
      expect(transports.first.iceServers.first.urls,
          'turn:turn.example.com:3478');
      expect(transports.first.iceServers.first.username, 'u');
      expect(transports.first.iceServers.first.credential, 'c');

      // Reply so acceptCallInvite resolves and the provider exits cleanly.
      _replyToLast(mock, true);
      expect(await acceptFuture, isTrue);
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

    test('endCall clears local state even when home RPC returns false',
        () async {
      final mock = MockWebSocket();
      final transports = <FakeTransport>[];
      final provider = await buildProvider(mock: mock, transports: transports);

      final startFuture = provider.startCall('envoy:owner:bob');
      await Future<void>.delayed(Duration.zero);
      var sent = _lastSent(mock);
      mock.simulateMessage({
        'id': sent['id'],
        'result': '44444444-4444-4444-8444-444444444444',
      });
      await startFuture;

      final endFuture = provider.endCall();
      await Future<void>.delayed(Duration.zero);
      sent = _lastSent(mock);
      mock.simulateMessage({'id': sent['id'], 'result': false});
      final ok = await endFuture;

      expect(ok, isFalse);
      expect(transports.first.closeCalled, isTrue);
      expect(provider.state.callId, isNull);
      expect(provider.state.transport, isNull);
    });

    test('startCall recovers after a stuck previous call', () async {
      final mock = MockWebSocket();
      final transports = <FakeTransport>[];
      final provider = await buildProvider(mock: mock, transports: transports);

      final first = provider.startCall('envoy:owner:bob');
      await Future<void>.delayed(Duration.zero);
      var sent = _lastSent(mock);
      mock.simulateMessage({
        'id': sent['id'],
        'result': 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      });
      await first;
      expect(provider.state.callId, isNotNull);

      // Simulate a half-failed hangup that used to leave zombie state:
      // transport closed but callId still set. Force that shape, then
      // start again — should clear and succeed.
      provider.handleTestEvent({
        'type': 'call:ended',
        'callId': 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      });
      expect(provider.state.callId, isNull);

      final second = provider.startCall('envoy:owner:carol');
      await Future<void>.delayed(const Duration(milliseconds: 250));
      sent = _lastSent(mock);
      // May be endCall for stale + sendCallInvite; find invite.
      final invite = mock.sentMessages
          .map((m) => jsonDecode(m) as Map<String, dynamic>)
          .lastWhere((m) => m['method'] == 'sendCallInvite');
      mock.simulateMessage({
        'id': invite['id'],
        'result': 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      });
      final callId = await second;
      expect(callId, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
      expect(provider.state.peerOwnerId, 'envoy:owner:carol');
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

  group('CallProvider audio session (Phase 42F)', () {
    /// Records audio-session method calls. Tests assert on this list
    /// to verify the provider drives the AVAudioSession correctly.
    final audioCalls = <MethodCall>[];
    late MethodChannel audioChannel;
    late AudioSessionHelper audioHelper;
    late List<FakeTransport> transports;
    late MockWebSocket mock;
    late CallProvider provider;

    setUp(() async {
      audioCalls.clear();
      audioChannel = const MethodChannel('envoygo/audio_session_provider_test');
      TestDefaultBinaryMessengerBinding
          .instance.defaultBinaryMessenger
          .setMockMethodCallHandler(audioChannel, (call) async {
        audioCalls.add(call);
        return null;
      });
      audioHelper = AudioSessionHelper(
        channelOverride: audioChannel,
        forceEnabled: true,
      );
      mock = MockWebSocket();
      transports = <FakeTransport>[];
      provider = CallProvider.withAudioSession(
        NodeServiceClient(await connectWithTrackedMock(mock)),
        audioSession: audioHelper,
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
          return _StubTransport(t);
        },
      );
    });

    tearDown(() {
      TestDefaultBinaryMessengerBinding
          .instance.defaultBinaryMessenger
          .setMockMethodCallHandler(audioChannel, null);
      provider.dispose();
    });

    Future<void> _replyToSendCallInvite(String callId) async {
      final sent = _lastSent(mock);
      mock.simulateMessage({'id': sent['id'], 'result': callId});
    }

    test('startCall configures the audio session before posting sendCallInvite',
        () async {
      final future = provider.startCall('envoy:owner:bob');
      // The provider calls configureForVoiceCall synchronously after
      // the iceServers load; no transport work happens until the
      // sendCallInvite reply, so by the time the provider awaits the
      // JSON-RPC the audio session call is already on the channel.
      await Future<void>.delayed(Duration.zero);
      expect(
        audioCalls.map((c) => c.method).toList(),
        contains('configureForVoiceCall'),
      );
      await _replyToSendCallInvite(
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      );
      await future;
    });

    test('endCall resets the audio session', () async {
      final startFuture = provider.startCall('envoy:owner:bob');
      await Future<void>.delayed(Duration.zero);
      await _replyToSendCallInvite(
        'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      );
      await startFuture;
      audioCalls.clear();

      final endFuture = provider.endCall();
      await Future<void>.delayed(Duration.zero);
      _replyToLast(mock, true);
      await endFuture;

      expect(
        audioCalls.map((c) => c.method).toList(),
        contains('reset'),
      );
    });

    test('declineCall resets the audio session', () async {
      provider.handleTestEvent({
        'type': 'call:incoming',
        'callId': 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        'peerOwnerId': 'envoy:owner:carol',
        'peerDisplayName': 'Carol',
        'sdpOffer': 'v=0\r\n',
      });
      audioCalls.clear();

      final declineFuture = provider.declineCall();
      await Future<void>.delayed(Duration.zero);
      _replyToLast(mock, true);
      await declineFuture;

      expect(
        audioCalls.map((c) => c.method).toList(),
        contains('reset'),
      );
    });

    test('call:ended event from the home resets the audio session',
        () async {
      final startFuture = provider.startCall('envoy:owner:bob');
      await Future<void>.delayed(Duration.zero);
      await _replyToSendCallInvite(
        'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      );
      await startFuture;
      audioCalls.clear();

      provider.handleTestEvent({
        'type': 'call:ended',
        'callId': 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        'reason': 'normal',
      });

      expect(
        audioCalls.map((c) => c.method).toList(),
        contains('reset'),
      );
    });

    test('startCall failure during transport setup resets the audio session',
        () async {
      // Inject a transport factory that fails startOffer so the
      // provider runs its audio-session reset path on the failure.
      final failingProvider = CallProvider.withAudioSession(
        NodeServiceClient(await connectWithTrackedMock(MockWebSocket())),
        audioSession: audioHelper,
        transportFactory: ({
          required String callId,
          required List<IceServer> iceServers,
          required void Function(dynamic) onRemoteStream,
          required void Function(dynamic) onConnectionStateChange,
          required void Function(String, String) onSdpGenerated,
          required void Function(CallIceCandidate) onIceCandidate,
        }) {
          final t = _FailingOfferTransport();
          return _StubFailingTransport(t);
        },
      );

      final callId =
          await failingProvider.startCall('envoy:owner:bob');
      expect(callId, isNull);
      expect(
        audioCalls.map((c) => c.method).toList(),
        containsAll(['configureForVoiceCall', 'reset']),
      );
      failingProvider.dispose();
    });
  });

  // -----------------------------------------------------------------
  // Phase 31I (post-CallKit-removal) — alert push → CallProvider handoff.
  //
  // When a standard APNs alert push (type=incomingCall, with
  // aps.content-available: 1) wakes the app from background, the iOS
  // AppDelegate forwards the call metadata to Dart via the
  // `envoygo/alert_push` MethodChannel. The CallProvider exposes
  // `onIncomingCallFromPush` for `PushNotificationService.onIncomingCall`
  // to call, so the in-app call screen can render a "ringing" state
  // until the WebSocket delivers the full `call:incoming` event with
  // the SDP.
  // -----------------------------------------------------------------
  group('onIncomingCallFromPush (Phase 31I)', () {
    late CallProvider alertPushProvider;

    setUp(() async {
      // No audio-session mock needed — these tests only exercise
      // the provider's state transitions, not its audio plumbing.
      alertPushProvider = CallProvider(
        NodeServiceClient(await connectWithTrackedMock(MockWebSocket())),
      );
    });

    tearDown(() => alertPushProvider.dispose());

    test('first push puts the provider in ringing state', () {
      alertPushProvider.onIncomingCallFromPush(
        callId: 'call-push-1',
        callerOwnerId: 'envoy:owner:bob',
        callerName: 'Bob',
      );
      final s = alertPushProvider.state;
      expect(s.callId, 'call-push-1');
      expect(s.peerOwnerId, 'envoy:owner:bob');
      expect(s.peerDisplayName, 'Bob');
      expect(s.isIncoming, isTrue);
      expect(s.isActive, isFalse);
      expect(s.connectionState, 'connecting');
    });

    test('callerName falls back to callerOwnerId when not provided', () {
      alertPushProvider.onIncomingCallFromPush(
        callId: 'call-push-2',
        callerOwnerId: 'envoy:owner:carol',
      );
      expect(alertPushProvider.state.peerDisplayName, 'envoy:owner:carol');
    });

    test('a second push for a different call overwrites the first', () {
      alertPushProvider.onIncomingCallFromPush(
        callId: 'call-push-1',
        callerOwnerId: 'envoy:owner:bob',
      );
      alertPushProvider.onIncomingCallFromPush(
        callId: 'call-push-2',
        callerOwnerId: 'envoy:owner:carol',
      );
      final s = alertPushProvider.state;
      expect(s.callId, 'call-push-2');
      expect(s.peerOwnerId, 'envoy:owner:carol');
    });

    test('a duplicate push for the same call does not stomp WebSocket state',
        () async {
      // Simulate the WebSocket delivering the canonical `call:incoming`
      // event after the push has already set the ringing state. The
      // push handler must not overwrite the SDP that the WebSocket is
      // about to attach.
      alertPushProvider.onIncomingCallFromPush(
        callId: 'call-push-3',
        callerOwnerId: 'envoy:owner:bob',
        callerName: 'Bob (from push)',
      );
      alertPushProvider.handleTestEvent({
        'type': 'call:incoming',
        'callId': 'call-push-3',
        'peerOwnerId': 'envoy:owner:bob',
        'peerDisplayName': 'Bob (from ws)',
        'sdpOffer': 'v=0\r\n...',
      });
      // Then a duplicate push arrives (e.g. APNs delivered it twice).
      alertPushProvider.onIncomingCallFromPush(
        callId: 'call-push-3',
        callerOwnerId: 'envoy:owner:bob',
        callerName: 'Bob (duplicate)',
      );
      // The WebSocket-resolved name wins.
      expect(alertPushProvider.state.peerDisplayName, 'Bob (from ws)');
    });
  });

  // Phase 42 — eventStream is a real stream (it used to be
  // `const Stream.empty()`, which silently dropped every call:* event in
  // production; tests hid the gap via handleTestEvent). This group drives
  // the real HomeRemoteClient → NodeServiceClient.eventStream → CallProvider
  // path.
  group('eventStream (Phase 42 wiring)', () {
    test('a call:incoming push over the WS reaches CallProvider via eventStream',
        () async {
      final mock = MockWebSocket();
      final transports = <FakeTransport>[];
      final provider = await buildProvider(mock: mock, transports: transports);

      // Simulate the home pushing a call:incoming event over the WebSocket.
      mock.simulateMessage({
        'event': 'call:incoming',
        'data': {
          'type': 'call:incoming',
          'callId': '77778888-7777-4888-8888-777788887777',
          'peerOwnerId': 'envoy:owner:frank',
          'peerDisplayName': 'Frank',
          'sdpOffer': 'v=0\r\no=- frank-offer\r\n',
        },
      });
      await Future<void>.delayed(Duration.zero);

      expect(provider.state.callId, '77778888-7777-4888-8888-777788887777');
      expect(provider.state.peerDisplayName, 'Frank');
      expect(provider.state.isIncoming, isTrue);
    });

    test('call:answered with sdpAnswer applies remote answer on caller transport',
        () async {
      final mock = MockWebSocket();
      final transports = <FakeTransport>[];
      final provider = await buildProvider(mock: mock, transports: transports);

      final startFuture = provider.startCall('envoy:owner:bob');
      await Future<void>.delayed(Duration.zero);
      final sent = _lastSent(mock);
      mock.simulateMessage({
        'id': sent['id'],
        'result': 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      });
      await startFuture;

      provider.handleTestEvent({
        'type': 'call:answered',
        'callId': 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        'sdpAnswer': 'v=0\r\no=- remote-answer\r\n',
      });
      await Future<void>.delayed(Duration.zero);

      expect(transports.first.applyRemoteAnswerCalled, isTrue);
      expect(transports.first.remoteAnswerArg, 'v=0\r\no=- remote-answer\r\n');
      expect(provider.state.isActive, isTrue);
    });

    test('call:ice-candidate adds candidate to active transport', () async {
      final mock = MockWebSocket();
      final transports = <FakeTransport>[];
      final provider = await buildProvider(mock: mock, transports: transports);

      final startFuture = provider.startCall('envoy:owner:bob');
      await Future<void>.delayed(Duration.zero);
      final sent = _lastSent(mock);
      mock.simulateMessage({
        'id': sent['id'],
        'result': 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      });
      await startFuture;

      provider.handleTestEvent({
        'type': 'call:ice-candidate',
        'callId': 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        'candidate': {
          'candidate': 'candidate:1 1 UDP 2113937159 192.0.2.1 54321 typ host',
          'sdpMid': '0',
          'sdpMLineIndex': 0,
        },
      });
      await Future<void>.delayed(Duration.zero);

      expect(transports.first.addIceCandidateCalled, isTrue);
      expect(transports.first.lastIceCandidate?.candidate,
          contains('candidate:1'));
    });
  });
}

void _replyToLast(MockWebSocket mock, dynamic result) {
  final sent = _lastSent(mock);
  mock.simulateMessage({'id': sent['id'], 'result': result});
}

class _FailingOfferTransport {
  bool closeCalled = false;
  Future<String> startOffer() async {
    throw Exception('mic denied');
  }

  Future<String> startAnswer(String remoteSdp) async => 'v=0\r\n';
  void setMute(bool muted) {}
  Future<void> close() async {
    closeCalled = true;
  }
}

class _StubFailingTransport extends WebRtcCallTransport {
  final _FailingOfferTransport _inner;
  _StubFailingTransport(this._inner)
      : super(
          callId: 'failing',
          iceServers: const [],
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