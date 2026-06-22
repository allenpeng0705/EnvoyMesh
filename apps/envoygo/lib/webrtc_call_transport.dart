import 'dart:async';

import 'package:flutter_webrtc/flutter_webrtc.dart';

import 'models/call_event.dart';

/// Phase 42D — native Flutter WebRTC transport for EnvoyGo voice calls.
///
/// Mirrors `apps/social/src/lib/webrtc-call-transport.ts` using
/// `flutter_webrtc` so the phone can build a real `RTCPeerConnection`,
/// generate an SDP offer/answer, trickle ICE candidates, and stream
/// audio via SRTP. The home remains in the signaling path — media flows
/// peer-to-peer once both sides have set their remote descriptions.
///
/// Path support: Path 2 only (NG4). `flutter_webrtc` cannot bind to a
/// libp2p stream, so the libp2p data channel used by desktop↔desktop
/// Path 1 is not available here. Phone↔phone and phone↔desktop both
/// use standard ICE with the supplied `iceServers`.
class WebRtcCallTransport {
  /// Optional callId used to label this transport in logs.
  final String callId;
  final List<IceServer> iceServers;
  final void Function(MediaStream stream) onRemoteStream;
  final void Function(RTCPeerConnectionState state) onConnectionStateChange;
  final void Function(String sdp, String type) onSdpGenerated;
  final void Function(CallIceCandidate candidate) onIceCandidate;

  /// Pluggable factory for the underlying [RTCPeerConnection]. Production
  /// callers leave this null and use [createPeerConnection]. Tests inject
  /// a fake to exercise the transport without a real WebRTC stack.
  final Future<RTCPeerConnection> Function(Map<String, dynamic> config)?
      peerConnectionFactory;

  /// Pluggable factory for the local audio [MediaStream]. Production
  /// callers leave this null and use `navigator.mediaDevices.getUserMedia`.
  /// Tests inject a fake.
  final Future<MediaStream> Function(Map<String, dynamic> constraints)?
      getUserMedia;

  RTCPeerConnection? _pc;
  MediaStream? _localStream;
  bool _isClosed = false;
  bool _isMuted = false;

  WebRtcCallTransport({
    required this.callId,
    required this.iceServers,
    required this.onRemoteStream,
    required this.onConnectionStateChange,
    required this.onSdpGenerated,
    required this.onIceCandidate,
    this.peerConnectionFactory,
    this.getUserMedia,
  });

  bool get isClosed => _isClosed;
  bool get isMuted => _isMuted;

  Map<String, dynamic> _rtcConfiguration() {
    // flutter_webrtc's RTCConfiguration accepts the standard RTCConfiguration
    // shape. iceServers is required when set; empty list means no STUN/TURN.
    return {
      'iceServers': iceServers
          .map((s) => {
                'urls': s.urls,
                if (s.username != null) 'username': s.username,
                if (s.credential != null) 'credential': s.credential,
              })
          .toList(),
      'sdpSemantics': 'unified-plan',
    };
  }

  Future<RTCPeerConnection> _buildPeerConnection() async {
    final factory = peerConnectionFactory ?? createPeerConnection;
    final pc = await factory(_rtcConfiguration());
    pc.onIceCandidate = (RTCIceCandidate? c) {
      if (c == null) return;
      onIceCandidate(CallIceCandidate(
        candidate: c.candidate ?? '',
        sdpMid: c.sdpMid,
        sdpMLineIndex: c.sdpMLineIndex,
      ));
    };
    pc.onConnectionState = (RTCPeerConnectionState state) {
      onConnectionStateChange(state);
    };
    pc.onAddStream = (MediaStream stream) {
      onRemoteStream(stream);
    };
    pc.onTrack = (RTCTrackEvent event) {
      // Unified-plan: a single MediaStream with the audio track.
      if (event.streams.isNotEmpty) {
        onRemoteStream(event.streams.first);
      }
    };
    return pc;
  }

  /// Acquire the local microphone and add the audio track to the peer
  /// connection. Caller-side (offerer) and callee-side (answerer) both
  /// need this — the phone sends audio in both directions.
  Future<void> _attachLocalAudio(RTCPeerConnection pc) async {
    if (_localStream != null) return;
    try {
      final factory = getUserMedia ??
          ((c) => navigator.mediaDevices.getUserMedia(c));
      _localStream = await factory({'audio': true});
    } catch (err) {
      throw Exception('Microphone access denied: $err');
    }
    final tracks = _localStream!.getAudioTracks();
    for (final track in tracks) {
      await pc.addTrack(track, _localStream!);
    }
  }

  /// Start as the offerer (caller). Builds an SDP offer, sets it as the
  /// local description, and returns the SDP string for the caller to
  /// send via `call.invite`.
  Future<String> startOffer() async {
    if (_isClosed) throw StateError('Transport closed');
    final pc = await _buildPeerConnection();
    _pc = pc;

    await _attachLocalAudio(pc);

    final offer = await pc.createOffer({
      'offerToReceiveAudio': true,
      'offerToReceiveVideo': false,
    });
    await pc.setLocalDescription(offer);
    onSdpGenerated(offer.sdp ?? '', 'offer');
    return offer.sdp ?? '';
  }

  /// Start as the answerer (callee). Sets the remote SDP, builds a
  /// matching answer, and returns the answer SDP for the callee to
  /// send via `call.accept`.
  Future<String> startAnswer(String remoteSdp) async {
    if (_isClosed) throw StateError('Transport closed');
    final pc = await _buildPeerConnection();
    _pc = pc;

    await _attachLocalAudio(pc);

    await pc.setRemoteDescription(
      RTCSessionDescription(remoteSdp, 'offer'),
    );

    final answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    onSdpGenerated(answer.sdp ?? '', 'answer');
    return answer.sdp ?? '';
  }

  /// Apply the remote SDP answer on the caller side after `call:answered`.
  Future<void> applyRemoteAnswer(String remoteSdp) async {
    final pc = _pc;
    if (pc == null || _isClosed) throw StateError('Transport not ready for remote answer');
    await pc.setRemoteDescription(
      RTCSessionDescription(remoteSdp, 'answer'),
    );
  }

  /// Apply a remote ICE candidate trickled in via `call.ice-candidate`.
  /// Silently ignores failures — a stale candidate from a peer that
  /// has already renegotiated is not actionable.
  Future<void> addIceCandidate(CallIceCandidate candidate) async {
    final pc = _pc;
    if (pc == null || _isClosed) return;
    try {
      await pc.addCandidate(RTCIceCandidate(
        candidate.candidate,
        candidate.sdpMid,
        candidate.sdpMLineIndex,
      ));
    } catch (err) {
      // Log and swallow — the home will resync via a fresh SDP if needed.
      // ignore: avoid_print
      print('[WebRtcCallTransport] addIceCandidate failed: $err');
    }
  }

  /// Mute/unmute the local audio track by toggling `enabled`.
  void setMute(bool muted) {
    _isMuted = muted;
    final stream = _localStream;
    if (stream == null) return;
    for (final track in stream.getAudioTracks()) {
      track.enabled = !muted;
    }
  }

  /// Tear down: stop local tracks, close peer connection, mark closed.
  Future<void> close() async {
    if (_isClosed) return;
    _isClosed = true;

    final stream = _localStream;
    if (stream != null) {
      for (final track in stream.getTracks()) {
        await track.stop();
      }
      _localStream = null;
    }

    final pc = _pc;
    if (pc != null) {
      await pc.close();
      _pc = null;
    }
  }
}