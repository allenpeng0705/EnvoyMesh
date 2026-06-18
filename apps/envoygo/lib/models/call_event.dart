// Typed mirror of the `call.*` envelopes and push events used by the
// EnvoyGo voice-call pipeline.
//
// Phase 42D — these types are intentionally minimal: they cover the
// payload shapes that flow between the home node and the phone. The
// home owns the canonical Zod schemas (`packages/protocol/src/index.ts`).
// The phone treats them as opaque carriers — schema validation happens
// on the home side; this layer just types the Dart call sites.

import 'dart:async';

/// ICE candidate wire shape (Phase 38 §call.ice-candidate).
class CallIceCandidate {
  final String candidate;
  final String? sdpMid;
  final int? sdpMLineIndex;
  final String? usernameFragment;

  const CallIceCandidate({
    required this.candidate,
    this.sdpMid,
    this.sdpMLineIndex,
    this.usernameFragment,
  });

  factory CallIceCandidate.fromJson(Map<String, dynamic> j) => CallIceCandidate(
        candidate: j['candidate'] as String,
        sdpMid: j['sdpMid'] as String?,
        sdpMLineIndex: (j['sdpMLineIndex'] as num?)?.toInt(),
        usernameFragment: j['usernameFragment'] as String?,
      );

  Map<String, dynamic> toJson() => {
        'candidate': candidate,
        if (sdpMid != null) 'sdpMid': sdpMid,
        if (sdpMLineIndex != null) 'sdpMLineIndex': sdpMLineIndex,
        if (usernameFragment != null) 'usernameFragment': usernameFragment,
      };
}

/// Mute payload wire shape (Phase 38 §call.mute).
class CallMutePayload {
  final String callId;
  final bool muted;

  const CallMutePayload({required this.callId, required this.muted});

  factory CallMutePayload.fromJson(Map<String, dynamic> j) => CallMutePayload(
        callId: j['callId'] as String,
        muted: j['muted'] as bool,
      );

  Map<String, dynamic> toJson() => {'callId': callId, 'muted': muted};
}

/// One entry in a node config's `iceServers` list. Mirrors the home's
/// `PersistedNodeConfig.iceServers` schema (`apps/node/src/node-config-store.ts`).
class IceServer {
  final String urls;
  final String? username;
  final String? credential;

  const IceServer({required this.urls, this.username, this.credential});

  factory IceServer.fromJson(Map<String, dynamic> j) => IceServer(
        urls: j['urls'] as String,
        username: j['username'] as String?,
        credential: j['credential'] as String?,
      );

  Map<String, dynamic> toJson() => {
        'urls': urls,
        if (username != null) 'username': username,
        if (credential != null) 'credential': credential,
      };
}

/// Subscription handle for push events from the home node.
class CallEventSubscription {
  final StreamSubscription<dynamic> _inner;
  CallEventSubscription(this._inner);

  Future<void> cancel() => _inner.cancel();
}