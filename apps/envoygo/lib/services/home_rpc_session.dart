import 'package:envoy_thin_client/services/home_remote_client.dart';

/// Connection/session plumbing shared by every EnvoyGo RPC client.
///
/// This is the **reusable** half of the old `NodeServiceClient` god-class: it
/// holds the transport ([homeClient]), the request/response envelope (the
/// typed `call` wrappers below issue every request through it), push-event
/// subscription and teardown. It names no product concept — no chat, call,
/// contact, persona, bond or family type — so a future product app can pair to
/// a home node and drive it without importing the product surface
/// (`NodeServiceClient`, `lib/services/product/rpc_bindings/*`).
///
/// Error mapping and reconnect live one layer down, in `envoy_thin_client`
/// (`HomeRemoteClient`, `ReconnectSupervisor`, `exceptions.dart`).
class HomeRpcSession {
  HomeRpcSession(this.homeClient);

  /// The transport every request on this session is issued over.
  final HomeRemoteClient homeClient;

  /// Teardown callbacks registered by this session or its subclasses.
  final List<void Function()> _teardowns = [];

  /// Subscribe to a push event from the home node. Returns an
  /// unsubscribe function. Re-exposes the underlying
  /// [HomeRemoteClient.on] so the settings screens can listen for
  /// `home:config-updated`.
  void Function() on(String event, void Function(dynamic) handler) {
    return homeClient.on(event, handler);
  }

  /// Register [unsubscribe] to run when this session is [dispose]d. Used by
  /// subclasses that subscribe to push events.
  void trackTeardown(void Function() unsubscribe) {
    _teardowns.add(unsubscribe);
  }

  /// Release the HomeRemoteClient event subscriptions. Safe to call once
  /// on disposal. Subclasses that own a stream should close it in an
  /// override (after calling `super.dispose()`).
  void dispose() {
    for (final unsubscribe in _teardowns) {
      try {
        unsubscribe();
      } catch (_) {
        // Swallow — best-effort cleanup.
      }
    }
    _teardowns.clear();
  }

  Future<Map<String, dynamic>> getConnectionStatus() async {
    return await homeClient.call('getConnectionStatus') as Map<String, dynamic>;
  }

  /// Re-bind this session to [profileId] when the home node still treats the
  /// device as the owner profile.
  ///
  /// Session-level plumbing: it repairs the *session binding*, and its only
  /// argument is the opaque profile id the caller already holds. It lives here
  /// rather than in the product bindings because the connection layer needs it
  /// and must not depend on a product module (Workstream A5 inversion).
  Future<Map<String, dynamic>> repairSessionProfile({
    required String profileId,
  }) async {
    return await homeClient.call('repairSessionProfile', {'profileId': profileId})
        as Map<String, dynamic>;
  }

  /// Phase 42 — fetch the home's node config. Used to read the
  /// user-configured `iceServers` (STUN/TURN) so the phone can build its
  /// `RTCPeerConnection` with the right ICE config. The home injects the
  /// same list into the `call.invite` envelope for the callee, but the
  /// caller needs it locally before generating its offer.
  Future<Map<String, dynamic>> getNodeConfig() async {
    return await homeClient.call('getNodeConfig') as Map<String, dynamic>;
  }

  /// Patch home `node-config.json` (shallow merge on the server).
  Future<void> updateNodeConfig(Map<String, dynamic> patch) async {
    if (patch.isEmpty) return;
    await homeClient.call('updateNodeConfig', patch);
  }

  /// Fetch the full pairing payload from the home node, including
  /// bootstrap peer addresses for multi-relay fallback.
  Future<Map<String, dynamic>> getPairingPayload() async {
    return await homeClient.call('getPairingPayload') as Map<String, dynamic>;
  }

  /// Share the mobile's reachable listen addresses (from UPnP) with the home node.
  /// This allows home to dial the mobile directly instead of requiring relay.
  Future<bool> updateMyListenAddrs(
    String peerId,
    List<String> listenAddrs, {
    String? ownerId,
  }) async {
    final result =
        await homeClient.call('updateMyListenAddrs', {
              'peerId': peerId,
              'listenAddrs': listenAddrs,
              if (ownerId != null) 'ownerId': ownerId,
            })
            as Map<String, dynamic>;
    return result['ok'] == true;
  }
}
