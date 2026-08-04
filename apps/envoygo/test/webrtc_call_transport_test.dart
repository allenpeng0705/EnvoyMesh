// Phase 42D — tests for the native WebRtcCallTransport.
//
// The transport wraps flutter_webrtc (which talks to platform channels
// only available on a real device). To exercise it in unit tests we
// inject two factory hooks:
//   - peerConnectionFactory: returns a `FakePeerConnection`
//   - getUserMedia: returns a `FakeMediaStream`
//
// The fakes are minimal — they record calls into lists and let the
// tests assert on them. Anything the transport doesn't actually
// exercise (e.g. RTCDataChannel) is left as noSuchMethod.

import 'dart:async';
import 'dart:typed_data';

import 'package:envoygo/models/call_event.dart';
import 'package:envoygo/webrtc_call_transport.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';

// ---------------------------------------------------------------------------
// Fake RTCPeerConnection
// ---------------------------------------------------------------------------

class FakePeerConnection implements RTCPeerConnection {
  final List<Map<String, dynamic>> createOfferCalls = [];
  final List<Map<String, dynamic>> createAnswerCalls = [];
  final List<RTCSessionDescription> setLocalDescriptionCalls = [];
  final List<RTCSessionDescription> setRemoteDescriptionCalls = [];
  final List<RTCIceCandidate> addCandidateCalls = [];
  final List<MediaStreamTrack> addTrackCalls = [];
  final List<RTCRtpMediaType?> addTransceiverKinds = [];
  bool closeCalled = false;

  String offerSdp;
  String answerSdp;

  @override
  Function(RTCIceCandidate candidate)? onIceCandidate;
  @override
  Function(RTCPeerConnectionState state)? onConnectionState;
  @override
  Function(MediaStream stream)? onAddStream;
  @override
  Function(MediaStream stream)? onRemoveStream;
  @override
  Function(MediaStream stream, MediaStreamTrack track)? onAddTrack;
  @override
  Function(MediaStream stream, MediaStreamTrack track)? onRemoveTrack;
  @override
  Function(RTCDataChannel channel)? onDataChannel;
  @override
  Function()? onRenegotiationNeeded;
  @override
  Function(RTCTrackEvent event)? onTrack;
  @override
  Function(RTCSignalingState state)? onSignalingState;
  @override
  Function(RTCIceGatheringState state)? onIceGatheringState;
  @override
  Function(RTCIceConnectionState state)? onIceConnectionState;

  FakePeerConnection({
    this.offerSdp = 'v=0\r\no=- fake-offer 0 IN IP4 127.0.0.1\r\n',
    this.answerSdp = 'v=0\r\no=- fake-answer 0 IN IP4 127.0.0.1\r\n',
  });

  @override
  Future<RTCSessionDescription> createOffer(
      [Map<String, dynamic>? constraints]) async {
    createOfferCalls.add(constraints ?? {});
    return RTCSessionDescription(offerSdp, 'offer');
  }

  @override
  Future<RTCSessionDescription> createAnswer(
      [Map<String, dynamic>? constraints]) async {
    createAnswerCalls.add(constraints ?? {});
    return RTCSessionDescription(answerSdp, 'answer');
  }

  @override
  Future<void> setLocalDescription(RTCSessionDescription description) async {
    setLocalDescriptionCalls.add(description);
  }

  @override
  Future<void> setRemoteDescription(RTCSessionDescription description) async {
    setRemoteDescriptionCalls.add(description);
  }

  @override
  Future<void> addCandidate(RTCIceCandidate candidate) async {
    addCandidateCalls.add(candidate);
  }

  @override
  Future<RTCRtpSender> addTrack(MediaStreamTrack track,
      [MediaStream? stream]) async {
    addTrackCalls.add(track);
    return _FakeRtpSender(track);
  }

  @override
  Future<bool> removeTrack(RTCRtpSender sender) async => true;

  @override
  Future<void> close() async {
    closeCalled = true;
  }

  // Members we don't exercise in tests — stub minimally.
  @override
  RTCSignalingState? get signalingState =>
      RTCSignalingState.RTCSignalingStateStable;
  @override
  Future<RTCSignalingState?> getSignalingState() async => signalingState;
  @override
  RTCIceGatheringState? get iceGatheringState =>
      RTCIceGatheringState.RTCIceGatheringStateComplete;
  @override
  Future<RTCIceGatheringState?> getIceGatheringState() async =>
      iceGatheringState;
  @override
  RTCIceConnectionState? get iceConnectionState =>
      RTCIceConnectionState.RTCIceConnectionStateConnected;
  @override
  Future<RTCIceConnectionState?> getIceConnectionState() async =>
      iceConnectionState;
  @override
  RTCPeerConnectionState? get connectionState =>
      RTCPeerConnectionState.RTCPeerConnectionStateConnected;
  @override
  Future<RTCPeerConnectionState?> getConnectionState() async =>
      connectionState;
  @override
  Map<String, dynamic> get getConfiguration => {};
  @override
  Future<void> setConfiguration(Map<String, dynamic> configuration) async {}
  @override
  Future<RTCSessionDescription?> getLocalDescription() async => null;
  @override
  Future<RTCSessionDescription?> getRemoteDescription() async => null;
  @override
  Future<List<StatsReport>> getStats([MediaStreamTrack? track]) async => [];
  @override
  List<MediaStream?> getLocalStreams() => [];
  @override
  List<MediaStream?> getRemoteStreams() => [];
  @override
  Future<RTCDataChannel> createDataChannel(
          String label, RTCDataChannelInit init) async =>
      throw UnimplementedError();
  @override
  Future<void> restartIce() async {}
  @override
  Future<List<RTCRtpSender>> getSenders() async => [];
  @override
  Future<List<RTCRtpSender>> get senders => getSenders();
  @override
  Future<List<RTCRtpReceiver>> getReceivers() async => [];
  @override
  Future<List<RTCRtpReceiver>> get receivers => getReceivers();
  @override
  Future<List<RTCRtpTransceiver>> getTransceivers() async => [];
  @override
  Future<List<RTCRtpTransceiver>> get transceivers => getTransceivers();
  @override
  Future<void> addStream(MediaStream stream) async {}
  @override
  Future<void> removeStream(MediaStream stream) async {}
  @override
  RTCDTMFSender createDtmfSender(MediaStreamTrack track) =>
      throw UnimplementedError();
  @override
  Future<RTCRtpTransceiver> addTransceiver({
    MediaStreamTrack? track,
    RTCRtpMediaType? kind,
    RTCRtpTransceiverInit? init,
  }) async {
    addTransceiverKinds.add(kind);
    return _FakeRtpTransceiver();
  }
  @override
  Future<void> dispose() async {}
}

class _FakeRtpSender implements RTCRtpSender {
  _FakeRtpSender(this.track);
  @override
  final MediaStreamTrack track;
  @override
  Future<void> dispose() async {}
  @override
  RTCRtpParameters get parameters => throw UnimplementedError();
  @override
  Future<void> replaceTrack(MediaStreamTrack? track) async {}
  @override
  Future<void> setTrack(MediaStreamTrack? track, {bool takeOwnership = true}) async {}
  @override
  Future<List<StatsReport>> getStats() async => [];
  @override
  Future<void> setStreams(List<MediaStream> streams) async {}
  @override
  Future<bool> setParameters(RTCRtpParameters parameters) async => true;
  @override
  String get senderId => 'fake-sender';
  @override
  bool get ownsTrack => true;
  @override
  RTCDTMFSender get dtmfSender => throw UnimplementedError();
}

class _FakeRtpTransceiver implements RTCRtpTransceiver {
  @override
  Future<void> setDirection(TransceiverDirection direction) async {}
  @override
  Future<TransceiverDirection> getDirection() async =>
      TransceiverDirection.RecvOnly;
  @override
  Future<TransceiverDirection?> getCurrentDirection() async =>
      TransceiverDirection.RecvOnly;
  @override
  TransceiverDirection get currentDirection => TransceiverDirection.RecvOnly;
  @override
  Future<void> setCodecPreferences(List<RTCRtpCodecCapability> codecs) async {}
  @override
  String get mid => '0';
  @override
  RTCRtpSender get sender => throw UnimplementedError();
  @override
  RTCRtpReceiver get receiver => throw UnimplementedError();
  @override
  bool get stoped => false;
  @override
  String get transceiverId => 'fake-transceiver';
  @override
  Future<void> stop() async {}
}

// ---------------------------------------------------------------------------
// Fake MediaStream + MediaStreamTrack
// ---------------------------------------------------------------------------

class FakeMediaStream implements MediaStream {
  final List<FakeMediaStreamTrack> _tracks;
  @override
  String id;
  @override
  String ownerTag;

  @override
  Function(MediaStreamTrack track)? onAddTrack;
  @override
  Function(MediaStreamTrack track)? onRemoveTrack;

  FakeMediaStream(this._tracks,
      {this.id = 'local', this.ownerTag = 'fake-stream'});

  @override
  List<MediaStreamTrack> getAudioTracks() =>
      _tracks.where((t) => t.kind == 'audio').toList();

  @override
  List<MediaStreamTrack> getVideoTracks() =>
      _tracks.where((t) => t.kind == 'video').toList();

  @override
  List<MediaStreamTrack> getTracks() => List.from(_tracks);

  @override
  bool? get active => true;

  @override
  Future<void> getMediaTracks() async {}

  @override
  Future<void> addTrack(MediaStreamTrack track, {bool addToNative = true}) async {
    if (track is FakeMediaStreamTrack) {
      if (!_tracks.any((t) => t.id == track.id)) {
        _tracks.add(track);
      }
    }
  }

  @override
  Future<void> removeTrack(MediaStreamTrack track,
      {bool removeFromNative = true}) async {}

  @override
  MediaStreamTrack? getTrackById(String trackId) {
    for (final t in _tracks) {
      if (t.id == trackId) return t;
    }
    return null;
  }

  @override
  Future<MediaStream> clone() async =>
      FakeMediaStream(_tracks, id: id, ownerTag: ownerTag);

  @override
  Future<void> dispose() async {}

  void setMediaTracks(List<MediaStreamTrack> tracks) {}

  String toMap() => '{}';
}

class FakeMediaStreamTrack implements MediaStreamTrack {
  bool _enabled;
  @override
  String? id;
  @override
  String? label;
  @override
  String? kind;
  bool stopCalled = false;

  FakeMediaStreamTrack({
    bool enabled = true,
    this.id = 'fake-track',
    this.label = 'fake-track-label',
    this.kind = 'audio',
  }) : _enabled = enabled;

  @override
  bool get enabled => _enabled;

  @override
  set enabled(bool b) => _enabled = b;

  @override
  Future<void> stop() async {
    stopCalled = true;
  }

  @override
  Future<void> dispose() async {}

  void setKind(String kind) {
    this.kind = kind;
  }

  String toMap() => '{}';

  @override
  Map<String, dynamic> getConstraints() => {};

  @override
  Future<void> applyConstraints([Map<String, dynamic>? constraints]) async {}

  @override
  Future<MediaStreamTrack> clone() async =>
      FakeMediaStreamTrack(enabled: enabled, id: id, label: label, kind: kind);

  @override
  Map<String, dynamic> getSettings() => {};

  @override
  void enableSpeakerphone(bool enable) {}

  @override
  Future<ByteBuffer> captureFrame() async => Uint8List(0).buffer;

  @override
  Future<bool> hasTorch() async => false;

  @override
  Future<void> setTorch(bool torch) async {}

  @override
  bool? get muted => !_enabled;

  @override
  String toString() => 'Track(id: $id, kind: $kind, enabled: $_enabled)';

  @override
  void Function()? onMute;
  @override
  void Function()? onUnMute;
  @override
  void Function()? onEnded;

  @override
  Future<bool> switchCamera() async => true;

  @override
  Future<void> adaptRes(int width, int height) async {}
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

WebRtcCallTransport buildTransport({
  required List<CallIceCandidate> iceCandidates,
  required List<RTCPeerConnectionState> connectionStates,
  required List<MediaStream> remoteStreams,
  required List<(String, String)> sdps,
  FakePeerConnection? pc,
  FakeMediaStream? localStream,
  List<IceServer> iceServers = const [],
  bool enableVideo = false,
}) {
  pc ??= FakePeerConnection();
  localStream ??= FakeMediaStream([FakeMediaStreamTrack()]);
  return WebRtcCallTransport(
    callId: 'call-test-123',
    iceServers: iceServers,
    enableVideo: enableVideo,
    onRemoteStream: remoteStreams.add,
    onConnectionStateChange: connectionStates.add,
    onSdpGenerated: (sdp, type) => sdps.add((sdp, type)),
    onIceCandidate: iceCandidates.add,
    peerConnectionFactory: (_) async => pc!,
    getUserMedia: (_) async => localStream!,
    createRemoteMediaStream: (label) async =>
        FakeMediaStream([], id: label, ownerTag: 'remote'),
  );
}

void main() {
  group('WebRtcCallTransport (Phase 42D)', () {
    test('startOffer builds an RTCPeerConnection, generates SDP, returns it',
        () async {
      final iceCandidates = <CallIceCandidate>[];
      final connectionStates = <RTCPeerConnectionState>[];
      final remoteStreams = <MediaStream>[];
      final sdps = <(String, String)>[];
      final pc = FakePeerConnection(offerSdp: 'v=0\r\nSDP-OFFER\r\n');
      final transport = buildTransport(
        iceServers: const [
          IceServer(urls: 'stun:stun.example.com:3478'),
        ],
        iceCandidates: iceCandidates,
        connectionStates: connectionStates,
        remoteStreams: remoteStreams,
        sdps: sdps,
        pc: pc,
      );

      final sdp = await transport.startOffer();

      expect(sdp, 'v=0\r\nSDP-OFFER\r\n');
      expect(sdps, [(sdp, 'offer')]);
      expect(pc.createOfferCalls, hasLength(1));
      expect(pc.createOfferCalls.first,
          containsPair('offerToReceiveAudio', true));
      expect(pc.setLocalDescriptionCalls, hasLength(1));
      expect(pc.addTrackCalls, hasLength(1));
    });

    test('startAnswer sets the remote SDP, builds an answer, returns it',
        () async {
      final iceCandidates = <CallIceCandidate>[];
      final connectionStates = <RTCPeerConnectionState>[];
      final remoteStreams = <MediaStream>[];
      final sdps = <(String, String)>[];
      final pc = FakePeerConnection(answerSdp: 'v=0\r\nSDP-ANSWER\r\n');
      final transport = buildTransport(
        iceCandidates: iceCandidates,
        connectionStates: connectionStates,
        remoteStreams: remoteStreams,
        sdps: sdps,
        pc: pc,
      );

      const remoteOffer = 'v=0\r\no=- remote 1 1 IN IP4 0.0.0.0\r\n';
      final sdp = await transport.startAnswer(remoteOffer);

      expect(sdp, 'v=0\r\nSDP-ANSWER\r\n');
      expect(sdps, [(sdp, 'answer')]);
      expect(pc.setRemoteDescriptionCalls, hasLength(1));
      expect(pc.setRemoteDescriptionCalls.first.sdp, remoteOffer);
      expect(pc.setRemoteDescriptionCalls.first.type, 'offer');
      expect(pc.setLocalDescriptionCalls, hasLength(1));
      expect(pc.setLocalDescriptionCalls.first.sdp, sdp);
    });

    test('addIceCandidate forwards to the underlying RTCPeerConnection',
        () async {
      final iceCandidates = <CallIceCandidate>[];
      final pc = FakePeerConnection();
      final transport = buildTransport(
        iceCandidates: iceCandidates,
        connectionStates: [],
        remoteStreams: [],
        sdps: [],
        pc: pc,
      );

      await transport.startOffer();

      await transport.addIceCandidate(const CallIceCandidate(
        candidate: 'candidate:1 1 UDP 2113929471 192.0.2.1 12345 typ host',
        sdpMid: '0',
        sdpMLineIndex: 0,
      ));

      expect(pc.addCandidateCalls, hasLength(1));
      expect(pc.addCandidateCalls.first.candidate,
          'candidate:1 1 UDP 2113929471 192.0.2.1 12345 typ host');
      expect(pc.addCandidateCalls.first.sdpMid, '0');
      expect(pc.addCandidateCalls.first.sdpMLineIndex, 0);
    });

    test('addIceCandidate is a no-op when the transport has been closed',
        () async {
      final pc = FakePeerConnection();
      final transport = buildTransport(
        iceCandidates: [],
        connectionStates: [],
        remoteStreams: [],
        sdps: [],
        pc: pc,
      );

      await transport.startOffer();
      // Send one candidate while open — confirms the path works.
      await transport.addIceCandidate(const CallIceCandidate(
        candidate: 'candidate:open 1 1 UDP 0 0.0.0.0 0 typ host',
      ));
      expect(pc.addCandidateCalls, hasLength(1));
      await transport.close();

      // After close, addIceCandidate is a no-op.
      await transport.addIceCandidate(const CallIceCandidate(
        candidate: 'candidate:after-close 1 1 UDP 0 0.0.0.0 0 typ host',
      ));
      expect(pc.addCandidateCalls, hasLength(1),
          reason: 'no further candidates should reach the PC after close()');
    });

    test('setMute toggles enabled on local audio tracks', () async {
      final track = FakeMediaStreamTrack(enabled: true);
      final localStream = FakeMediaStream([track]);
      final transport = buildTransport(
        iceCandidates: [],
        connectionStates: [],
        remoteStreams: [],
        sdps: [],
        localStream: localStream,
      );

      await transport.startOffer();

      expect(track.enabled, isTrue);
      transport.setMute(true);
      expect(track.enabled, isFalse);
      expect(transport.isMuted, isTrue);

      transport.setMute(false);
      expect(track.enabled, isTrue);
      expect(transport.isMuted, isFalse);
    });

    test('close stops local tracks and closes the peer connection',
        () async {
      final track = FakeMediaStreamTrack();
      final localStream = FakeMediaStream([track]);
      final pc = FakePeerConnection();
      final transport = buildTransport(
        iceCandidates: [],
        connectionStates: [],
        remoteStreams: [],
        sdps: [],
        pc: pc,
        localStream: localStream,
      );

      await transport.startOffer();
      expect(transport.isClosed, isFalse);
      await transport.close();

      expect(track.stopCalled, isTrue);
      expect(pc.closeCalled, isTrue);
      expect(transport.isClosed, isTrue);
    });

    test('close is idempotent (calling twice does not double-stop tracks)',
        () async {
      final track = FakeMediaStreamTrack();
      final localStream = FakeMediaStream([track]);
      final pc = FakePeerConnection();
      final transport = buildTransport(
        iceCandidates: [],
        connectionStates: [],
        remoteStreams: [],
        sdps: [],
        pc: pc,
        localStream: localStream,
      );

      await transport.startOffer();
      await transport.close();
      await transport.close();

      expect(pc.closeCalled, isTrue);
    });

    test('startOffer on a closed transport throws StateError', () async {
      final transport = buildTransport(
        iceCandidates: [],
        connectionStates: [],
        remoteStreams: [],
        sdps: [],
      );
      await transport.close();
      expect(() => transport.startOffer(), throwsStateError);
    });

    test('startAnswer on a closed transport throws StateError', () async {
      final transport = buildTransport(
        iceCandidates: [],
        connectionStates: [],
        remoteStreams: [],
        sdps: [],
      );
      await transport.close();
      expect(() => transport.startAnswer('v=0\r\n'), throwsStateError);
    });

    test('microphone access failure surfaces a clear exception', () async {
      final transport = WebRtcCallTransport(
        callId: 'call-no-mic',
        iceServers: const [],
        onRemoteStream: (_) {},
        onConnectionStateChange: (_) {},
        onSdpGenerated: (_, __) {},
        onIceCandidate: (_) {},
        peerConnectionFactory: (_) async => FakePeerConnection(),
        getUserMedia: (_) async => throw Exception('Permission denied'),
        createRemoteMediaStream: (label) async =>
            FakeMediaStream([], id: label),
      );

      expect(
        () => transport.startOffer(),
        throwsA(isA<Exception>().having(
          (e) => e.toString(),
          'message',
          contains('Microphone access denied'),
        )),
      );
    });

    test('ICE candidate events from the PC are forwarded as CallIceCandidate',
        () async {
      final iceCandidates = <CallIceCandidate>[];
      final pc = FakePeerConnection();
      final transport = buildTransport(
        iceCandidates: iceCandidates,
        connectionStates: [],
        remoteStreams: [],
        sdps: [],
        pc: pc,
      );

      await transport.startOffer();
      pc.onIceCandidate?.call(RTCIceCandidate(
        'candidate:1 1 UDP 2113929471 192.0.2.1 12345 typ host',
        '0',
        0,
      ));

      expect(iceCandidates, hasLength(1));
      expect(iceCandidates.first.candidate,
          'candidate:1 1 UDP 2113929471 192.0.2.1 12345 typ host');
      expect(iceCandidates.first.sdpMid, '0');
      expect(iceCandidates.first.sdpMLineIndex, 0);
    });

    test('connection state changes from the PC are forwarded', () async {
      final connectionStates = <RTCPeerConnectionState>[];
      final pc = FakePeerConnection();
      final transport = buildTransport(
        iceCandidates: [],
        connectionStates: connectionStates,
        remoteStreams: [],
        sdps: [],
        pc: pc,
      );

      await transport.startOffer();
      pc.onConnectionState
          ?.call(RTCPeerConnectionState.RTCPeerConnectionStateConnecting);
      pc.onConnectionState
          ?.call(RTCPeerConnectionState.RTCPeerConnectionStateConnected);

      expect(connectionStates, [
        RTCPeerConnectionState.RTCPeerConnectionStateConnecting,
        RTCPeerConnectionState.RTCPeerConnectionStateConnected,
      ]);
    });

    test('applyRemoteAnswer sets remote answer SDP', () async {
      final pc = FakePeerConnection();
      final transport = buildTransport(
        iceCandidates: [],
        connectionStates: [],
        remoteStreams: [],
        sdps: [],
        pc: pc,
      );

      await transport.startOffer();
      await transport.applyRemoteAnswer('v=0\r\no=- remote-answer\r\n');

      expect(pc.setRemoteDescriptionCalls, hasLength(1));
      expect(pc.setRemoteDescriptionCalls.first.type, 'answer');
    });

    test('onTrack with empty streams merges video into composite remote stream',
        () async {
      final remoteStreams = <MediaStream>[];
      final pc = FakePeerConnection();
      final transport = buildTransport(
        iceCandidates: [],
        connectionStates: [],
        remoteStreams: remoteStreams,
        sdps: [],
        pc: pc,
      );

      await transport.startOffer();
      final video = FakeMediaStreamTrack(
        id: 'mac-video',
        kind: 'video',
      );
      await pc.onTrack?.call(RTCTrackEvent(
        track: video,
        streams: const [],
      ));

      expect(remoteStreams, hasLength(1));
      expect(remoteStreams.first.getVideoTracks(), hasLength(1));
      expect(remoteStreams.first.getVideoTracks().first.id, 'mac-video');
    });

    test('onTrack audio then video on empty streams accumulates tracks',
        () async {
      final remoteStreams = <MediaStream>[];
      final pc = FakePeerConnection();
      final transport = buildTransport(
        iceCandidates: [],
        connectionStates: [],
        remoteStreams: remoteStreams,
        sdps: [],
        pc: pc,
      );

      await transport.startOffer();
      await pc.onTrack?.call(RTCTrackEvent(
        track: FakeMediaStreamTrack(id: 'mac-audio', kind: 'audio'),
        streams: const [],
      ));
      await pc.onTrack?.call(RTCTrackEvent(
        track: FakeMediaStreamTrack(id: 'mac-video', kind: 'video'),
        streams: const [],
      ));

      expect(remoteStreams, hasLength(2));
      expect(remoteStreams.last.getAudioTracks(), hasLength(1));
      expect(remoteStreams.last.getVideoTracks(), hasLength(1));
      // Same composite identity across updates (UI rebinds by track count).
      expect(identical(remoteStreams.first, remoteStreams.last), isTrue);
    });

    test('stream video then empty-stream audio keeps video on one composite',
        () async {
      final remoteStreams = <MediaStream>[];
      final pc = FakePeerConnection();
      final transport = buildTransport(
        iceCandidates: [],
        connectionStates: [],
        remoteStreams: remoteStreams,
        sdps: [],
        pc: pc,
      );

      await transport.startOffer();
      final peerStream = FakeMediaStream([
        FakeMediaStreamTrack(id: 'mac-video', kind: 'video'),
      ], id: 'peer-stream');

      await pc.onTrack?.call(RTCTrackEvent(
        track: peerStream.getVideoTracks().first,
        streams: [peerStream],
      ));
      await pc.onTrack?.call(RTCTrackEvent(
        track: FakeMediaStreamTrack(id: 'mac-audio', kind: 'audio'),
        streams: const [],
      ));

      expect(remoteStreams, isNotEmpty);
      final latest = remoteStreams.last;
      expect(latest.getVideoTracks(), hasLength(1));
      expect(latest.getAudioTracks(), hasLength(1));
      expect(identical(remoteStreams.first, latest), isTrue);
    });

    test('in-flight onTrack after close does not publish remote stream',
        () async {
      final remoteStreams = <MediaStream>[];
      final pc = FakePeerConnection();
      final slowRemote = FakeMediaStream([], id: 'slow-remote');
      var gateOpen = false;
      final gate = Completer<void>();

      final delayedRemote = _DelayedAddTrackStream(
        slowRemote,
        beforeAdd: () async {
          gateOpen = true;
          await gate.future;
        },
      );

      final transport = WebRtcCallTransport(
        callId: 'call-close-race',
        iceServers: const [],
        onRemoteStream: remoteStreams.add,
        onConnectionStateChange: (_) {},
        onSdpGenerated: (_, __) {},
        onIceCandidate: (_) {},
        peerConnectionFactory: (_) async => pc,
        getUserMedia: (_) async => FakeMediaStream([FakeMediaStreamTrack()]),
        createRemoteMediaStream: (_) async => delayedRemote,
      );

      await transport.startOffer();
      final pending = pc.onTrack?.call(RTCTrackEvent(
        track: FakeMediaStreamTrack(id: 'late-video', kind: 'video'),
        streams: const [],
      ));
      // Wait until addTrack is blocked inside the handler.
      for (var i = 0; i < 50 && !gateOpen; i++) {
        await Future<void>.delayed(const Duration(milliseconds: 1));
      }
      expect(gateOpen, isTrue);
      await transport.close();
      gate.complete();
      await pending;

      expect(remoteStreams, isEmpty,
          reason: 'closed transport must not publish after hangup');
    });

    test('video call without local camera adds recvonly video transceiver',
        () async {
      final pc = FakePeerConnection();
      final audioOnly = FakeMediaStream([
        FakeMediaStreamTrack(id: 'mic', kind: 'audio'),
      ]);
      final transport = buildTransport(
        iceCandidates: [],
        connectionStates: [],
        remoteStreams: [],
        sdps: [],
        pc: pc,
        localStream: audioOnly,
        enableVideo: true,
      );

      await transport.startOffer();
      expect(
        pc.addTransceiverKinds,
        contains(RTCRtpMediaType.RTCRtpMediaTypeVideo),
      );
    });
  });
}

/// Wraps [inner] and delays [addTrack] so tests can close mid-handler.
class _DelayedAddTrackStream implements MediaStream {
  _DelayedAddTrackStream(this.inner, {required this.beforeAdd});
  final FakeMediaStream inner;
  final Future<void> Function() beforeAdd;

  @override
  String get id => inner.id;
  @override
  set id(String v) => inner.id = v;
  @override
  String get ownerTag => inner.ownerTag;
  @override
  set ownerTag(String v) => inner.ownerTag = v;
  @override
  Function(MediaStreamTrack track)? get onAddTrack => inner.onAddTrack;
  @override
  set onAddTrack(Function(MediaStreamTrack track)? v) => inner.onAddTrack = v;
  @override
  Function(MediaStreamTrack track)? get onRemoveTrack => inner.onRemoveTrack;
  @override
  set onRemoveTrack(Function(MediaStreamTrack track)? v) =>
      inner.onRemoveTrack = v;
  @override
  List<MediaStreamTrack> getAudioTracks() => inner.getAudioTracks();
  @override
  List<MediaStreamTrack> getVideoTracks() => inner.getVideoTracks();
  @override
  List<MediaStreamTrack> getTracks() => inner.getTracks();
  @override
  bool? get active => inner.active;
  @override
  Future<void> getMediaTracks() => inner.getMediaTracks();
  @override
  Future<void> addTrack(MediaStreamTrack track, {bool addToNative = true}) async {
    await beforeAdd();
    await inner.addTrack(track, addToNative: addToNative);
  }
  @override
  Future<void> removeTrack(MediaStreamTrack track,
          {bool removeFromNative = true}) =>
      inner.removeTrack(track, removeFromNative: removeFromNative);
  @override
  MediaStreamTrack? getTrackById(String trackId) =>
      inner.getTrackById(trackId);
  @override
  Future<MediaStream> clone() => inner.clone();
  @override
  Future<void> dispose() => inner.dispose();
}