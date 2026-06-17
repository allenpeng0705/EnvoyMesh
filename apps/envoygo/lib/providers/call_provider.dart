import 'dart:async';
import 'package:flutter/foundation.dart';
import '../services/node_service_client.dart';

/// Call state for Phase 38 voice calls in EnvoyGo.
class CallState {
  final String? callId;
  final String? peerOwnerId;
  final String? peerDisplayName;
  final bool isIncoming;
  final bool isActive;
  final bool isMuted;
  final String connectionState; // "disconnected" | "connecting" | "connected"

  const CallState({
    this.callId,
    this.peerOwnerId,
    this.peerDisplayName,
    this.isIncoming = false,
    this.isActive = false,
    this.isMuted = false,
    this.connectionState = "disconnected",
  });

  CallState copyWith({
    String? callId,
    String? peerOwnerId,
    String? peerDisplayName,
    bool? isIncoming,
    bool? isActive,
    bool? isMuted,
    String? connectionState,
  }) {
    return CallState(
      callId: callId ?? this.callId,
      peerOwnerId: peerOwnerId ?? this.peerOwnerId,
      peerDisplayName: peerDisplayName ?? this.peerDisplayName,
      isIncoming: isIncoming ?? this.isIncoming,
      isActive: isActive ?? this.isActive,
      isMuted: isMuted ?? this.isMuted,
      connectionState: connectionState ?? this.connectionState,
    );
  }

  factory CallState.idle() => const CallState();
}

/// Provider for voice call state — listens to CallEvent from NodeService.
class CallProvider extends ChangeNotifier {
  final NodeServiceClient _nodeService;
  StreamSubscription<Map<String, dynamic>>? _sub;
  CallState _state = CallState.idle();

  CallProvider(this._nodeService) {
    _sub = _nodeService.eventStream.listen(_onEvent);
  }

  /// No-op provider for when the node is disconnected.
  CallProvider.noop() : _nodeService = NodeServiceClient.noop() {
    // Don't subscribe — no connection.
  }

  CallState get state => _state;

  void _onEvent(Map<String, dynamic> event) {
    final type = event['type'] as String?;
    if (type == null || !type.startsWith('call:')) return;

    switch (type) {
      case 'call:incoming':
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
        _state = CallState.idle();
        break;
      case 'call:remote-mute':
        _state = _state.copyWith(isMuted: event['muted'] as bool? ?? false);
        break;
    }
    notifyListeners();
  }

  /// Start an outbound call.
  Future<String?> startCall(String targetOwnerId) async {
    final callId = await _nodeService.sendCallInvite(targetOwnerId);
    if (callId != null) {
      _state = _state.copyWith(
        callId: callId,
        peerOwnerId: targetOwnerId,
        peerDisplayName: targetOwnerId, // Will be resolved from contacts
        isIncoming: false,
        isActive: false,
        connectionState: 'connecting',
      );
      notifyListeners();
    }
    return callId;
  }

  /// Accept an incoming call.
  Future<bool> acceptCall() async {
    if (_state.callId == null) return false;
    final ok = await _nodeService.acceptCallInvite(_state.callId!);
    if (ok) {
      _state = _state.copyWith(
        isIncoming: false,
        isActive: true,
        connectionState: 'connecting',
      );
      notifyListeners();
    }
    return ok;
  }

  /// Decline an incoming call.
  Future<bool> declineCall() async {
    if (_state.callId == null) return false;
    final ok = await _nodeService.declineCallInvite(_state.callId!, 'declined');
    if (ok) _state = CallState.idle();
    notifyListeners();
    return ok;
  }

  /// End an active call.
  Future<bool> endCall() async {
    if (_state.callId == null) return false;
    final ok = await _nodeService.endCall(_state.callId!);
    if (ok) _state = CallState.idle();
    notifyListeners();
    return ok;
  }

  /// Toggle mute.
  Future<void> toggleMute() async {
    if (_state.callId == null) return;
    final newMuted = !_state.isMuted;
    await _nodeService.setCallMuted(_state.callId!, newMuted);
    _state = _state.copyWith(isMuted: newMuted);
    notifyListeners();
  }

  /// Dismiss incoming call notification (timeout).
  void dismissIncoming() {
    _state = CallState.idle();
    notifyListeners();
  }

  @override
  void dispose() {
    _sub?.cancel();
    super.dispose();
  }
}
