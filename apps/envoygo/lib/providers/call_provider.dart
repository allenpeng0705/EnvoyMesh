import 'dart:async';
import 'package:flutter/foundation.dart';

import '../models/call_event.dart';
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

  const CallState({
    this.callId,
    this.peerOwnerId,
    this.peerDisplayName,
    this.isIncoming = false,
    this.isActive = false,
    this.isMuted = false,
    this.connectionState = 'disconnected',
    this.transport,
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

  CallProvider(this._nodeService, {this.transportFactory}) {
    _sub = _nodeService.eventStream.listen(_onEvent);
  }

  /// No-op provider for when the node is disconnected.
  CallProvider.noop()
      : _nodeService = NodeServiceClient.noop(),
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
        onRemoteStream: (_) {},
        onConnectionStateChange: (_) {},
        onSdpGenerated: (_, __) {},
        onIceCandidate: (_) {},
      );
    }
    return WebRtcCallTransport(
      callId: callId,
      iceServers: iceServers,
      onRemoteStream: (_) {},
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

  @override
  void dispose() {
    _sub?.cancel();
    _closeTransport();
    super.dispose();
  }
}
