import 'dart:async';
import 'package:flutter/foundation.dart';

import '../models/call_event.dart';
import '../services/audio_session_helper.dart';
import '../services/node_service_client.dart';
import '../webrtc_call_transport.dart';

/// Call state for Phase 38 voice calls in EnvoyGo.
class CallState {
  final String? callId;
  final String? peerOwnerId;
  final String? peerDisplayName;
  final bool isIncoming;
  final bool isActive;
  final bool isMuted;
  final String connectionState; // 'disconnected' | 'connecting' | 'connected'
  /// The active WebRTC transport, if any. The provider closes this on
  /// `endCall`/`declineCall`/`dispose` so audio tracks are released.
  /// Held as a `Function`-typed field rather than `WebRtcCallTransport?`
  /// so the state class doesn't depend on the transport type at the
  /// field level — useful for tests that mock the provider.
  final Object? transport;
  /// The peer's audio/video [MediaStream] from the active transport.
  /// Phase 42F — the call screen binds this onto an [RTCVideoRenderer]
  /// so the remote audio plays through the device speaker. Held as a
  /// `dynamic` field to avoid forcing the state class to depend on
  /// `flutter_webrtc` at compile time (callbacks that aren't used by
  /// the call screen still work).
  final dynamic remoteStream;

  const CallState({
    this.callId,
    this.peerOwnerId,
    this.peerDisplayName,
    this.isIncoming = false,
    this.isActive = false,
    this.isMuted = false,
    this.connectionState = 'disconnected',
    this.transport,
    this.remoteStream,
  });

  CallState copyWith({
    String? callId,
    String? peerOwnerId,
    String? peerDisplayName,
    bool? isIncoming,
    bool? isActive,
    bool? isMuted,
    String? connectionState,
    Object? transport,
    dynamic remoteStream,
    bool clearTransport = false,
  }) {
    return CallState(
      callId: callId ?? this.callId,
      peerOwnerId: peerOwnerId ?? this.peerOwnerId,
      peerDisplayName: peerDisplayName ?? this.peerDisplayName,
      isIncoming: isIncoming ?? this.isIncoming,
      isActive: isActive ?? this.isActive,
      isMuted: isMuted ?? this.isMuted,
      connectionState: connectionState ?? this.connectionState,
      transport: clearTransport ? null : (transport ?? this.transport),
      remoteStream: remoteStream ?? this.remoteStream,
    );
  }

  factory CallState.idle() => const CallState();
}

/// Provider for voice call state — listens to CallEvent from NodeService
/// and drives a [WebRtcCallTransport] for the audio path.
///
/// Phase 42E — `startCall` / `acceptCall` now build an `RTCPeerConnection`,
/// generate the SDP via `startOffer` / `startAnswer`, and pass it through
/// the corresponding JSON-RPC. The home node remains in the signaling
/// path (trust check, identity binding, CallManager state machine); the
/// media path is peer-to-peer once the callee's `setRemoteDescription`
/// runs.
class CallProvider extends ChangeNotifier {
  final NodeServiceClient _nodeService;
  final AudioSessionHelper _audioSession;

  /// Optional transport factory — production callers leave this null and
  /// use the default [WebRtcCallTransport] constructor. Tests inject a
  /// fake transport that records calls without needing `flutter_webrtc`.
  final WebRtcCallTransport Function({
    required String callId,
    required List<IceServer> iceServers,
    required void Function(dynamic stream) onRemoteStream,
    required void Function(dynamic state) onConnectionStateChange,
    required void Function(String sdp, String type) onSdpGenerated,
    required void Function(CallIceCandidate candidate) onIceCandidate,
  })? transportFactory;

  StreamSubscription<Map<String, dynamic>>? _sub;
  CallState _state = CallState.idle();
  /// The remote SDP offer from the most recent `call:incoming` event.
  /// Held on the provider (not the state) so it's not visible to UI
  /// consumers — only `acceptCall` reads it.
  String? _incomingRemoteSdp;

  CallProvider(this._nodeService, {this.transportFactory})
      : _audioSession = AudioSessionHelper() {
    _sub = _nodeService.eventStream.listen(_onEvent);
  }

  /// Test seam — pass an [AudioSessionHelper] that talks to a mock
  /// method channel so the helper can be exercised without iOS.
  CallProvider.withAudioSession(
    this._nodeService, {
    required AudioSessionHelper audioSession,
    this.transportFactory,
  }) : _audioSession = audioSession {
    _sub = _nodeService.eventStream.listen(_onEvent);
  }

  /// No-op provider for when the node is disconnected.
  CallProvider.noop()
      : _nodeService = NodeServiceClient.noop(),
        _audioSession = AudioSessionHelper(),
        transportFactory = null {
    // Don't subscribe — no connection.
  }

  /// Test hooks.
  /// ignore: unused_element
  void setTransportFactoryForTest(transportFactory) {
    // ignore: invalid_use_of_visible_for_testing_member
    (this as dynamic).transportFactory = transportFactory;
  }

  /// ignore: unused_element
  void handleTestEvent(Map<String, dynamic> event) {
    _onEvent(event);
  }

  CallState get state => _state;

  WebRtcCallTransport _buildTransport({
    required String callId,
    required List<IceServer> iceServers,
  }) {
    if (transportFactory != null) {
      return transportFactory!(
        callId: callId,
        iceServers: iceServers,
        onRemoteStream: (stream) {
          // Phase 42F — store the remote stream on state so the
          // VoiceCallScreen can bind it to an RTCVideoRenderer.
          _state = _state.copyWith(remoteStream: stream);
          notifyListeners();
        },
        onConnectionStateChange: (_) {},
        onSdpGenerated: (_, __) {},
        onIceCandidate: (_) {},
      );
    }
    return WebRtcCallTransport(
      callId: callId,
      iceServers: iceServers,
      onRemoteStream: (stream) {
        // Phase 42F — store the remote stream on state so the
        // VoiceCallScreen can bind it to an RTCVideoRenderer.
        _state = _state.copyWith(remoteStream: stream);
        notifyListeners();
      },
      onConnectionStateChange: (state) {
        // Map the WebRTC connection state onto the provider's coarse
        // "connecting"/"connected" string for the UI.
        final s = state.toString();
        final mapped = s.contains('Connected')
            ? 'connected'
            : (s.contains('Connecting') || s.contains('Checking'))
                ? 'connecting'
                : 'disconnected';
        _state = _state.copyWith(connectionState: mapped);
        notifyListeners();
      },
      onSdpGenerated: (_, __) {},
      onIceCandidate: (_) {},
    );
  }

  void _onEvent(Map<String, dynamic> event) {
    final type = event['type'] as String?;
    if (type == null || !type.startsWith('call:')) return;

    switch (type) {
      case 'call:incoming':
        _incomingRemoteSdp = event['sdpOffer'] as String?;
        _state = _state.copyWith(
          callId: event['callId'] as String?,
          peerOwnerId: event['peerOwnerId'] as String?,
          peerDisplayName: event['peerDisplayName'] as String?,
          isIncoming: true,
          isActive: false,
          connectionState: 'connecting',
        );
        break;
      case 'call:answered':
        _state = _state.copyWith(
          isIncoming: false,
          isActive: true,
          connectionState: 'connected',
        );
        break;
      case 'call:ended':
      case 'call:rejected':
      case 'call:error':
        _closeTransport();
        // ignore: unawaited_futures
        _safeResetAudioSession();
        _state = CallState.idle();
        break;
      case 'call:remote-mute':
        _state = _state.copyWith(isMuted: event['muted'] as bool? ?? false);
        break;
    }
    notifyListeners();
  }

  /// Look up the home's `iceServers` config (best-effort — falls back
  /// to empty list if the RPC fails, in which case the home injects the
  /// 3-server STUN default).
  Future<List<IceServer>> _loadIceServers() async {
    try {
      // The home exposes node config via the NodeServiceClient getNodeConfig
      // path (used by the Social UI too). If a future refactor changes the
      // API, the worst case is we return [] and let the home inject defaults.
      return const [];
    } catch (_) {
      return const [];
    }
  }

  /// Start an outbound call. Builds the transport, generates an SDP
  /// offer, and posts it to the home via `sendCallInvite`.
  Future<String?> startCall(String targetOwnerId) async {
    final iceServers = await _loadIceServers();

    // Configure the platform audio session for the voice call (no-op
    // on non-iOS). Wrapped in try/catch — audio session config is a
    // nice-to-have; a failure shouldn't block the call.
    try {
      await _audioSession.configureForVoiceCall();
    } catch (_) {
      // ignore: avoid_print
      print('[CallProvider] audio session configure failed');
    }

    // Build the transport up front so we can capture the offer SDP.
    // We use a temporary callId and let the home assign the real one
    // when we sendCallInvite.
    final tempCallId = 'pending-${DateTime.now().microsecondsSinceEpoch}';
    final transport = _buildTransport(
      callId: tempCallId,
      iceServers: iceServers,
    );

    String sdpOffer;
    try {
      sdpOffer = await transport.startOffer();
    } catch (err) {
      await transport.close();
      await _safeResetAudioSession();
      return null;
    }

    final callId = await _nodeService.sendCallInvite(
      targetOwnerId,
      sdpOffer,
      iceServers: iceServers
          .map((s) => {
                'urls': s.urls,
                if (s.username != null) 'username': s.username,
                if (s.credential != null) 'credential': s.credential,
              })
          .toList(),
    );
    if (callId == null) {
      await transport.close();
      await _safeResetAudioSession();
      return null;
    }

    _state = _state.copyWith(
      callId: callId,
      peerOwnerId: targetOwnerId,
      peerDisplayName: targetOwnerId, // Will be resolved from contacts
      isIncoming: false,
      isActive: false,
      connectionState: 'connecting',
      transport: transport,
    );
    notifyListeners();
    return callId;
  }

  /// Accept an incoming call. Builds the transport, sets the remote SDP,
  /// generates a SDP answer, and posts it via `acceptCallInvite`.
  Future<bool> acceptCall() async {
    final callId = _state.callId;
    final peerOwnerId = _state.peerOwnerId;
    if (callId == null || peerOwnerId == null) return false;

    // The remote SDP comes from the `call:incoming` event payload.
    // (Pushed via the home's WebSocket event bus.)
    final remoteSdp = _incomingRemoteSdp;
    if (remoteSdp == null) return false;

    try {
      await _audioSession.configureForVoiceCall();
    } catch (_) {
      // ignore: avoid_print
      print('[CallProvider] audio session configure failed');
    }

    final iceServers = await _loadIceServers();
    final transport = _buildTransport(
      callId: callId,
      iceServers: iceServers,
    );

    String sdpAnswer;
    try {
      sdpAnswer = await transport.startAnswer(remoteSdp);
    } catch (err) {
      await transport.close();
      await _safeResetAudioSession();
      return false;
    }

    final ok = await _nodeService.acceptCallInvite(
      callId,
      sdpAnswer,
      iceServers: iceServers
          .map((s) => {
                'urls': s.urls,
                if (s.username != null) 'username': s.username,
                if (s.credential != null) 'credential': s.credential,
              })
          .toList(),
    );
    if (!ok) {
      await transport.close();
      await _safeResetAudioSession();
      return false;
    }

    _state = _state.copyWith(
      isIncoming: false,
      isActive: true,
      connectionState: 'connected',
      transport: transport,
      clearTransport: false,
    );
    _incomingRemoteSdp = null;
    notifyListeners();
    return true;
  }

  /// Decline an incoming call. Closes any pending transport and posts
  /// `declineCallInvite` to the home.
  Future<bool> declineCall() async {
    final callId = _state.callId;
    if (callId == null) return false;
    _closeTransport();
    await _safeResetAudioSession();
    final ok = await _nodeService.declineCallInvite(callId, 'declined');
    if (ok) _state = CallState.idle();
    notifyListeners();
    return ok;
  }

  /// End an active call. Closes the transport, posts `endCall` to the
  /// home, and resets state.
  Future<bool> endCall() async {
    final callId = _state.callId;
    if (callId == null) return false;
    _closeTransport();
    await _safeResetAudioSession();
    final ok = await _nodeService.endCall(callId);
    if (ok) _state = CallState.idle();
    notifyListeners();
    return ok;
  }

  /// Toggle mute on the local audio track and notify the peer via
  /// `setCallMuted`.
  Future<void> toggleMute() async {
    final callId = _state.callId;
    if (callId == null) return;
    final newMuted = !_state.isMuted;
    final transport = _state.transport;
    if (transport is WebRtcCallTransport) {
      transport.setMute(newMuted);
    }
    await _nodeService.setCallMuted(callId, newMuted);
    _state = _state.copyWith(isMuted: newMuted);
    notifyListeners();
  }

  /// Dismiss incoming call notification (timeout). No transport to close
  /// at this point because we haven't built one yet.
  void dismissIncoming() {
    _incomingRemoteSdp = null;
    _state = CallState.idle();
    notifyListeners();
  }

  /// Tear down the active transport (best-effort).
  void _closeTransport() {
    final transport = _state.transport;
    if (transport is WebRtcCallTransport) {
      // Fire-and-forget; close() is idempotent.
      // ignore: unawaited_futures
      transport.close();
    }
  }

  /// Reset the platform audio session. Safe to call when not on iOS —
  /// the helper no-ops. Best-effort: failures are logged but don't
  /// bubble up because the audio session is auxiliary to the call.
  Future<void> _safeResetAudioSession() async {
    try {
      await _audioSession.reset();
    } catch (_) {
      // ignore: avoid_print
      print('[CallProvider] audio session reset failed');
    }
  }

  @override
  void dispose() {
    _sub?.cancel();
    _closeTransport();
    // ignore: unawaited_futures
    _safeResetAudioSession();
    super.dispose();
  }
}
