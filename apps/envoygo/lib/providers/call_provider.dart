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
  final Object? transport;
  /// The peer's audio/video [MediaStream] from the active transport.
  final dynamic remoteStream;
  /// Local capture stream (self-view on video calls).
  final dynamic localStream;

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
    this.localStream,
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
    dynamic localStream,
    bool clearTransport = false,
    bool clearStreams = false,
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
      remoteStream: clearStreams ? null : (remoteStream ?? this.remoteStream),
      localStream: clearStreams ? null : (localStream ?? this.localStream),
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
  /// Prevents double-tap start / overlapping setup.
  bool _setupInFlight = false;

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
    void onRemote(dynamic stream) {
      _state = _state.copyWith(remoteStream: stream);
      notifyListeners();
    }

    void onLocal(dynamic stream) {
      _state = _state.copyWith(localStream: stream);
      notifyListeners();
    }

    void onConn(dynamic state) {
      final s = state.toString();
      final mapped = s.contains('Connected')
          ? 'connected'
          : (s.contains('Connecting') || s.contains('Checking'))
              ? 'connecting'
              : 'disconnected';
      _state = _state.copyWith(connectionState: mapped);
      notifyListeners();
      // Hard failure — tear down so the next call can start cleanly.
      if (s.contains('Failed') || s.contains('Closed')) {
        final callId = _state.callId;
        if (callId != null) {
          unawaited(_hangUpLocalAndNotifyHome(callId));
        }
      }
    }

    if (transportFactory != null) {
      return transportFactory!(
        callId: callId,
        iceServers: iceServers,
        onRemoteStream: onRemote,
        onConnectionStateChange: onConn,
        onSdpGenerated: (_, __) {},
        onIceCandidate: _forwardIceCandidate,
      );
    }
    return WebRtcCallTransport(
      callId: callId,
      iceServers: iceServers,
      enableVideo: enableVideo,
      onRemoteStream: onRemote,
      onLocalStream: onLocal,
      onConnectionStateChange: onConn,
      onSdpGenerated: (_, __) {},
      onIceCandidate: _forwardIceCandidate,
    );
  }

  /// Local teardown + best-effort `endCall` to the home (used on ICE Failed).
  Future<void> _hangUpLocalAndNotifyHome(String callId) async {
    if (_state.callId != callId) return;
    _resetToIdle();
    try {
      await _nodeService.endCall(callId);
    } catch (_) {}
  }

  /// Always release media + clear UI state. Does not wait on home RPCs.
  void _resetToIdle() {
    _iceCallId = '';
    _incomingRemoteSdp = null;
    _incomingIceServers = const [];
    _incomingCallType = 'audio';
    _activeCallType = 'audio';
    _closeTransport();
    _state = CallState.idle();
    notifyListeners();
    unawaited(_safeResetAudioSession());
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
        _resetToIdle();
        // notifyListeners already called inside _resetToIdle; avoid double
        // notify by returning early from the switch via a flag — fall through
        // to the shared notify at the bottom is redundant but harmless.
        return;
      case 'call:remote-mute':
        _state = _state.copyWith(isMuted: event['muted'] as bool? ?? false);
        break;
    }
    notifyListeners();
  }

  /// Phase 31I (post-CallKit-removal) — surface an incoming call that
  /// was delivered via a standard APNs alert push (the home node's
  /// `dispatchCallPush` adds `aps.content-available: 1` to wake the
  /// app in the background, no PushKit/VoIP involved).
  ///
  /// The push payload only carries `callId` and `callerOwnerId` (no
  /// SDP yet — the call envelope arrives over the WebSocket after the
  /// app wakes). We update local state so the in-app call screen can
  /// show a "ringing" entry; the WebSocket `call:incoming` event then
  /// re-fills the state with the SDP and full peer info.
  ///
  /// `callerName` is optional — the eventual `call:incoming` event
  /// typically replaces it with a contact-resolved display name.
  ///
  /// Subscribers are wired in `node_provider.dart` via
  /// `PushNotificationService.onIncomingCall`.
  void onIncomingCallFromPush({
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
    if (_setupInFlight) return null;
    // Stuck leftover state (endCall RPC failed, cancelled mid-setup, etc.)
    // must not block the next invite — release camera/mic first.
    if (_state.callId != null ||
        _pendingTransport != null ||
        _state.transport != null) {
      final staleId = _state.callId;
      _resetToIdle();
      if (staleId != null) {
        unawaited(_nodeService.endCall(staleId).catchError((_) => false));
      }
      // Brief yield so native camera session can release before re-acquire.
      await Future<void>.delayed(const Duration(milliseconds: 200));
    }

    _setupInFlight = true;
    try {
      final iceServers = await _loadIceServers();
      final enableVideo = callType == 'video';
      _activeCallType = enableVideo ? 'video' : 'audio';

      try {
        await _audioSession.configureForVoiceCall();
      } catch (_) {
        // ignore: avoid_print
        print('[CallProvider] audio session configure failed');
      }

      final tempCallId = 'pending-${DateTime.now().microsecondsSinceEpoch}';
      _iceCallId = '';
      final transport = _buildTransport(
        callId: tempCallId,
        iceServers: iceServers,
        enableVideo: enableVideo,
      );
      _pendingTransport = transport;

      String sdpOffer;
      try {
        sdpOffer = await transport.startOffer();
      } catch (err) {
        _pendingTransport = null;
        await transport.close();
        await _safeResetAudioSession();
        // ignore: avoid_print
        print('[CallProvider] startOffer failed: $err');
        return null;
      }

      // Promote local preview as soon as media is up (before home replies).
      if (transport.localStream != null) {
        _state = _state.copyWith(localStream: transport.localStream);
        notifyListeners();
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
        _state = CallState.idle();
        notifyListeners();
        return null;
      }

      // Aborted while waiting for home (remote end / local hangup).
      if (_pendingTransport != transport) {
        await transport.close();
        return null;
      }

      _iceCallId = callId;
      final label = peerDisplayName?.trim();
      _state = _state.copyWith(
        callId: callId,
        peerOwnerId: targetOwnerId,
        peerDisplayName:
            (label != null && label.isNotEmpty) ? label : targetOwnerId,
        isIncoming: false,
        isActive: false,
        connectionState: 'connecting',
        transport: transport,
        localStream: transport.localStream,
      );
      _pendingTransport = null;
      notifyListeners();
      return callId;
    } finally {
      _setupInFlight = false;
    }
  }

  /// Accept an incoming call. Builds the transport, sets the remote SDP,
  /// generates a SDP answer, and posts it via `acceptCallInvite`.
  Future<bool> acceptCall() async {
    final callId = _state.callId;
    final peerOwnerId = _state.peerOwnerId;
    if (callId == null || peerOwnerId == null) return false;
    if (_setupInFlight) return false;

    final remoteSdp = _incomingRemoteSdp;
    if (remoteSdp == null) return false;

    _setupInFlight = true;
    try {
      try {
        await _audioSession.configureForVoiceCall();
      } catch (_) {
        // ignore: avoid_print
        print('[CallProvider] audio session configure failed');
      }

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
        // ignore: avoid_print
        print('[CallProvider] startAnswer failed: $err');
        return false;
      }

      if (transport.localStream != null) {
        _state = _state.copyWith(localStream: transport.localStream);
        notifyListeners();
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

      if (_pendingTransport != transport) {
        await transport.close();
        return false;
      }

      _state = _state.copyWith(
        isIncoming: false,
        isActive: true,
        connectionState: 'connected',
        transport: transport,
        localStream: transport.localStream,
      );
      _pendingTransport = null;
      _incomingRemoteSdp = null;
      _incomingIceServers = const [];
      notifyListeners();
      return true;
    } finally {
      _setupInFlight = false;
    }
  }

  /// Decline an incoming call. Always clears local state so a failed
  /// home RPC cannot leave the UI stuck ringing.
  Future<bool> declineCall() async {
    final callId = _state.callId;
    if (callId == null) {
      _resetToIdle();
      return false;
    }
    _resetToIdle();
    try {
      return await _nodeService.declineCallInvite(callId, 'declined');
    } catch (_) {
      return false;
    }
  }

  /// End an active/outbound call. Always clears local media/state first
  /// so camera/mic are released even when the home RPC fails — otherwise
  /// the next call cannot acquire the camera ("no camera can work").
  Future<bool> endCall() async {
    final callId = _state.callId;
    if (callId == null) {
      _resetToIdle();
      return false;
    }
    _resetToIdle();
    try {
      return await _nodeService.endCall(callId);
    } catch (_) {
      return false;
    }
  }

  /// Flip between front and back cameras on a video call (mobile).
  Future<bool> switchCamera() async {
    if (!isVideoCall) return false;
    final transport = _state.transport ?? _pendingTransport;
    if (transport is! WebRtcCallTransport) return false;
    final ok = await transport.switchCamera();
    if (ok && transport.localStream != null) {
      _state = _state.copyWith(localStream: transport.localStream);
      notifyListeners();
    }
    return ok;
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

  /// Dismiss incoming call notification (timeout).
  void dismissIncoming() {
    _resetToIdle();
  }

  /// Tear down the active transport (best-effort).
  void _closeTransport() {
    _iceCallId = '';
    final pending = _pendingTransport;
    if (pending != null) {
      _pendingTransport = null;
      // ignore: unawaited_futures
      pending.close();
    }
    final transport = _state.transport;
    if (transport is WebRtcCallTransport) {
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
    _iceCallId = '';
    _incomingRemoteSdp = null;
    _incomingIceServers = const [];
    _closeTransport();
    _state = CallState.idle();
    // ignore: unawaited_futures
    _safeResetAudioSession();
    super.dispose();
  }
}
