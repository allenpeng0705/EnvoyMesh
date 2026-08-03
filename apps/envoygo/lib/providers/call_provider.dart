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
  NodeServiceClient _nodeService;
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
  /// The `iceServers` the home embedded in the most recent `call:incoming`
  /// event. Preferred over a fresh `_loadIceServers()` lookup on the callee
  /// side, because it reflects exactly what the caller used (so both ends
  /// build their `RTCPeerConnection` from the same ICE config).
  List<IceServer> _incomingIceServers = const [];
  /// `audio` | `video` from the most recent incoming invite.
  String _incomingCallType = 'audio';
  /// Media type for the in-flight outbound / active call.
  String _activeCallType = 'audio';

  /// Transport built mid-flight (between `_buildTransport()` and the
  /// `sendCallInvite`/`acceptCallInvite` RPC reply). Held separately so
  /// `_closeTransport()` (called from dispose() or a remote `call:ended`
  /// event arriving during the RPC window) can close it instead of
  /// leaking the `RTCPeerConnection` + `MediaStream`.
  WebRtcCallTransport? _pendingTransport;
  String _iceCallId = '';

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

  /// No-op / unbound provider for when the node is unpaired or the home
  /// client is not ready yet. Use [bind] to attach a live client without
  /// disposing mid-call across reconnects.
  CallProvider.noop()
      : _nodeService = NodeServiceClient.noop(),
        _audioSession = AudioSessionHelper(),
        transportFactory = null {
    // Don't subscribe — no connection.
  }

  /// Rebind event stream to a live home client. Does **not** tear down an
  /// active WebRTC transport — media can continue while signaling reconnects.
  void bind(NodeServiceClient nodeService) {
    _sub?.cancel();
    _nodeService = nodeService;
    _sub = _nodeService.eventStream.listen(_onEvent);
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

  void _forwardIceCandidate(CallIceCandidate candidate) {
    final callId = _iceCallId.isNotEmpty ? _iceCallId : (_state.callId ?? '');
    if (callId.isEmpty) return;
    unawaited(
      _nodeService.sendIceCandidate(callId, candidate.toJson()).then(
        (_) {},
        onError: (Object _, StackTrace __) {
          // ignore: avoid_print
          print('[CallProvider] sendIceCandidate failed');
        },
      ),
    );
  }

  WebRtcCallTransport _buildTransport({
    required String callId,
    required List<IceServer> iceServers,
    bool enableVideo = false,
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
        onIceCandidate: _forwardIceCandidate,
      );
    }
    return WebRtcCallTransport(
      callId: callId,
      iceServers: iceServers,
      enableVideo: enableVideo,
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
      onIceCandidate: _forwardIceCandidate,
    );
  }

  void _onEvent(Map<String, dynamic> event) {
    final type = event['type'] as String?;
    if (type == null || !type.startsWith('call:')) return;

    switch (type) {
      case 'call:incoming':
        _incomingRemoteSdp = event['sdpOffer'] as String?;
        _incomingIceServers = _parseIceServers(event['iceServers']);
        _incomingCallType =
            (event['callType'] as String?) == 'video' ? 'video' : 'audio';
        _activeCallType = _incomingCallType;
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
        final sdpAnswer = event['sdpAnswer'] as String?;
        final transport = _state.transport ?? _pendingTransport;
        if (sdpAnswer != null && transport is WebRtcCallTransport) {
          transport.applyRemoteAnswer(sdpAnswer).catchError((err) {
            // ignore: avoid_print
            print('[CallProvider] applyRemoteAnswer failed: $err');
          });
        }
        _state = _state.copyWith(
          isIncoming: false,
          isActive: true,
          connectionState: 'connected',
        );
        break;
      case 'call:ice-candidate':
        final eventCallId = event['callId'] as String?;
        final activeCallId = _state.callId ?? _iceCallId;
        if (eventCallId != null &&
            activeCallId.isNotEmpty &&
            eventCallId == activeCallId) {
          final candidateRaw = event['candidate'];
          final iceTransport = _state.transport ?? _pendingTransport;
          if (iceTransport is WebRtcCallTransport && candidateRaw is Map) {
            iceTransport
                .addIceCandidate(
                  CallIceCandidate.fromJson(
                    Map<String, dynamic>.from(candidateRaw),
                  ),
                )
                .catchError((_) {});
          }
        }
        break;
      case 'call:ended':
      case 'call:rejected':
      case 'call:error':
        _iceCallId = '';
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

  /// Phase 42I — surface an incoming call that was delivered via a
  /// VoIP push (iOS PushKit) when the app was backgrounded.
  ///
  /// The push payload only carries `callId` and `callerOwnerId` (no
  /// SDP yet — the call envelope arrives over the WebSocket after the
  /// app wakes). We update local state so the CallKit screen can show
  /// a "ringing" entry; the WebSocket `call:incoming` event then
  /// re-fills the state with the SDP and full peer info.
  ///
  /// `callerName` is optional — the eventual `call:incoming` event
  /// typically replaces it with a contact-resolved display name.
  void onIncomingCallFromVoipPush({
    required String callId,
    required String callerOwnerId,
    String? callerName,
  }) {
    if (!_hasMeaningfulCallUpdate(callId, callerOwnerId)) return;
    _state = _state.copyWith(
      callId: callId,
      peerOwnerId: callerOwnerId,
      peerDisplayName: callerName ?? callerOwnerId,
      isIncoming: true,
      isActive: false,
      connectionState: 'connecting',
    );
    notifyListeners();
  }

  /// Avoid re-stomping the state if a `call:incoming` from the
  /// WebSocket has already arrived for the same call (the typical
  /// race when the app is foregrounded at push time).
  bool _hasMeaningfulCallUpdate(String callId, String callerOwnerId) {
    final s = _state;
    if (s.callId == callId) return false;
    if (s.callId != null && s.callId != callId) return true;
    return s.peerOwnerId != callerOwnerId;
  }

  /// Parse a raw `iceServers` list (from a `call:incoming` event payload or
  /// the node config RPC) into typed [IceServer]s. Tolerates missing/malformed
  /// entries by skipping them.
  List<IceServer> _parseIceServers(dynamic raw) {
    if (raw is! List) return const [];
    final out = <IceServer>[];
    for (final entry in raw) {
      if (entry is! Map) continue;
      final urls = entry['urls'];
      if (urls is! String || urls.isEmpty) continue;
      out.add(IceServer(
        urls: urls,
        username: entry['username'] as String?,
        credential: entry['credential'] as String?,
      ));
    }
    return out;
  }

  /// Build a list of [IceServer]s for the caller side.
  ///
  /// Order of preference:
  /// 1. The home's `nodeConfig.iceServers` (user-configured STUN/TURN).
  /// 2. The hard-coded 3-server STUN default (Google / Cloudflare / Twilio),
  ///    matching the home's `DEFAULT_ICE_SERVERS` so both ends build their
  ///    `RTCPeerConnection` from the same ICE config when the user hasn't
  ///    configured anything.
  ///
  /// Previously this returned `const []` — a stub that meant every non-LAN
  /// call could only gather host candidates and never connected. The
  /// callee side additionally prefers [_incomingIceServers] (from the
  /// `call:incoming` envelope) in [acceptCall].
  static const _defaultIceServers = [
    IceServer(urls: 'stun:stun.l.google.com:19302'),
    IceServer(urls: 'stun:stun.cloudflare.com:3478'),
    IceServer(urls: 'stun:global.stun.twilio.com:3478'),
  ];

  Future<List<IceServer>> _loadIceServers() async {
    try {
      // Bounded timeout: a slow / unreachable home must not block call setup.
      // 4s is generous for a LAN home and short enough that the caller falls
      // back to the 3-STUN default promptly if the RPC stalls.
      final config = await _nodeService
          .getNodeConfig()
          .timeout(const Duration(seconds: 4), onTimeout: () => const {});
      final parsed = _parseIceServers(config['iceServers']);
      if (parsed.isNotEmpty) return parsed;
      return _defaultIceServers;
    } catch (_) {
      // Node config RPC unavailable / failed — fall back to the STUN default
      // so the call still has a reasonable chance of connecting on LAN / most
      // non-symmetric-NAT setups. The home would inject the same default if
      // the envelope's list were empty, but the phone needs it locally too
      // (the home's envelope default doesn't reach the caller's offer path
      // before the offer is generated).
      return _defaultIceServers;
    }
  }

  /// Active call media type (`audio` or `video`).
  String get activeCallType => _activeCallType;

  bool get isVideoCall => _activeCallType == 'video';

  /// Start an outbound call. Builds the transport, generates an SDP
  /// offer, and posts it to the home via `sendCallInvite`.
  /// [callType] is `audio` (default) or `video`.
  /// [peerDisplayName] is the callee label for the call UI (chat already
  /// resolved it); falls back to [targetOwnerId] when omitted/empty.
  Future<String?> startCall(
    String targetOwnerId, {
    String callType = 'audio',
    String? peerDisplayName,
  }) async {
    final iceServers = await _loadIceServers();
    final enableVideo = callType == 'video';
    _activeCallType = enableVideo ? 'video' : 'audio';

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
    _iceCallId = '';
    final transport = _buildTransport(
      callId: tempCallId,
      iceServers: iceServers,
      enableVideo: enableVideo,
    );
    // Stash on `_pendingTransport` so `_closeTransport()` (called from
    // dispose() or a remote `call:ended` event during the RPC window)
    // can close it instead of leaking the RTCPeerConnection + MediaStream.
    _pendingTransport = transport;

    String sdpOffer;
    try {
      sdpOffer = await transport.startOffer();
    } catch (err) {
      _pendingTransport = null;
      await transport.close();
      await _safeResetAudioSession();
      return null;
    }

    final callId = await _nodeService.sendCallInvite(
      targetOwnerId,
      sdpOffer,
      callType: _activeCallType,
      iceServers: iceServers
          .map((s) => {
                'urls': s.urls,
                if (s.username != null) 'username': s.username,
                if (s.credential != null) 'credential': s.credential,
              })
          .toList(),
    );
    if (callId == null) {
      _pendingTransport = null;
      _iceCallId = '';
      await transport.close();
      await _safeResetAudioSession();
      return null;
    }

    _iceCallId = callId;
    final label = peerDisplayName?.trim();
    _state = _state.copyWith(
      callId: callId,
      peerOwnerId: targetOwnerId,
      peerDisplayName: (label != null && label.isNotEmpty) ? label : targetOwnerId,
      isIncoming: false,
      isActive: false,
      connectionState: 'connecting',
      transport: transport,
    );
    // Promoted to `_state.transport` — clear the in-flight handle.
    _pendingTransport = null;
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

    // Prefer the iceServers the home embedded in the `call:incoming` envelope
    // — they reflect exactly what the caller used, so both ends agree on ICE
    // config. Fall back to a fresh lookup (which itself falls back to the
    // 3-STUN default) only if the envelope didn't carry any.
    final iceServers = _incomingIceServers.isNotEmpty
        ? _incomingIceServers
        : await _loadIceServers();
    _iceCallId = callId;
    final transport = _buildTransport(
      callId: callId,
      iceServers: iceServers,
      enableVideo: _incomingCallType == 'video',
    );
    _pendingTransport = transport;

    String sdpAnswer;
    try {
      sdpAnswer = await transport.startAnswer(remoteSdp);
    } catch (err) {
      _pendingTransport = null;
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
      _pendingTransport = null;
      _iceCallId = '';
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
    _pendingTransport = null;
    _incomingRemoteSdp = null;
    _incomingIceServers = const [];
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

  /// Flip between front and back cameras on a video call (mobile).
  Future<bool> switchCamera() async {
    if (!isVideoCall) return false;
    final transport = _state.transport;
    if (transport is! WebRtcCallTransport) return false;
    return transport.switchCamera();
  }

  /// Toggle mute on the local audio track and notify the peer via
  /// `setCallMuted`. Rolls back the local track + state if the home
  /// refuses the mute (e.g. the call ended concurrently), so the UI
  /// never claims a mute succeeded when the peer wasn't told.
  Future<void> toggleMute() async {
    final callId = _state.callId;
    if (callId == null) return;
    final newMuted = !_state.isMuted;
    final transport = _state.transport;
    if (transport is WebRtcCallTransport) {
      transport.setMute(newMuted);
    }
    try {
      final ok = await _nodeService.setCallMuted(callId, newMuted);
      if (!ok) {
        // Home refused the mute — roll back the local track and state.
        if (transport is WebRtcCallTransport) {
          transport.setMute(!newMuted);
        }
        return;
      }
    } catch (_) {
      // RPC failed — roll back so UI state stays consistent with reality.
      if (transport is WebRtcCallTransport) {
        transport.setMute(!newMuted);
      }
      return;
    }
    _state = _state.copyWith(isMuted: newMuted);
    notifyListeners();
  }

  /// Dismiss incoming call notification (timeout). No transport to close
  /// at this point because we haven't built one yet.
  void dismissIncoming() {
    _incomingRemoteSdp = null;
    _incomingIceServers = const [];
    _state = CallState.idle();
    notifyListeners();
  }

  /// Tear down the active transport (best-effort).
  void _closeTransport() {
    _iceCallId = '';
    // Close the in-flight transport first (the one that's still being
    // built during sendCallInvite/acceptCallInvite RPC round-trips);
    // otherwise dispose() / a remote-end event during that window
    // would leak the RTCPeerConnection + MediaStream.
    final pending = _pendingTransport;
    if (pending != null) {
      _pendingTransport = null;
      // ignore: unawaited_futures
      pending.close();
    }
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
