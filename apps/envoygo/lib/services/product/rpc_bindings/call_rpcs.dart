import '../../home_rpc_session.dart';

/// Call bindings: voice/video call RPCs (`call.*`).
mixin CallRpcs on HomeRpcSession {
  // -- Voice / video calls (Phase 42C) --
  //
  // Real JSON-RPC implementations for the five call.* RPCs. The home
  // node (apps/node) accepts the call.* schemas defined in
  // packages/protocol. The SDP/ICE fields are opaque to this layer —
  // they are produced by WebRtcCallTransport (Phase 42D) and passed
  // through unchanged.
  //
  // Push events (`call:*`) are bridged into [eventStream] by the
  // constructor above; `noop()` is unchanged from Phase 38.

  /// Send a call invite to [targetOwnerId]. Returns the call id on
  /// success, or null if the home node refused.
  Future<String?> sendCallInvite(
    String targetOwnerId,
    String sdpOffer, {
    List<Map<String, dynamic>>? iceServers,
    String callType = 'audio',
  }) async {
    final result = await homeClient.call('sendCallInvite', {
      'targetOwnerId': targetOwnerId,
      'sdpOffer': sdpOffer,
      'callType': callType,
      if (iceServers != null && iceServers.isNotEmpty) 'iceServers': iceServers,
    });
    // The home returns the callId as a JSON string (or null on refusal).
    if (result == null) return null;
    return result as String?;
  }

  /// Accept an incoming call invite. Returns true if accepted cleanly.
  Future<bool> acceptCallInvite(
    String callId,
    String sdpAnswer, {
    List<Map<String, dynamic>>? iceServers,
  }) async {
    final result = await homeClient.call('acceptCallInvite', {
      'callId': callId,
      'sdpAnswer': sdpAnswer,
      if (iceServers != null && iceServers.isNotEmpty) 'iceServers': iceServers,
    });
    return result == true;
  }

  /// Decline an incoming call invite.
  Future<bool> declineCallInvite(String callId, String reason) async {
    final result = await homeClient.call('declineCallInvite', {
      'callId': callId,
      'reason': reason,
    });
    return result == true;
  }

  /// End the active call.
  Future<bool> endCall(String callId) async {
    final result = await homeClient.call('endCall', {'callId': callId});
    return result == true;
  }

  /// Toggle the local mic muted state. Returns true if the home accepted
  /// the mute transition, false if the call was unknown or already ended
  /// (matching the API contract in packages/api/src/node-service.ts).
  Future<bool> setCallMuted(String callId, bool muted) async {
    final result = await homeClient.call('setCallMuted', {
      'callId': callId,
      'muted': muted,
    });
    return result == true;
  }

  /// Send a trickle ICE candidate to the remote peer for an active call.
  Future<bool> sendIceCandidate(
    String callId,
    Map<String, dynamic> candidate,
  ) async {
    final result = await homeClient.call('sendIceCandidate', {
      'callId': callId,
      'candidate': candidate,
    });
    return result == true;
  }
}
