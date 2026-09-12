/// Product-plane hooks for the home connection — the seam that lets the
/// connection layer stop importing the product layer.
///
/// ## Why this exists (Workstream A5, dependency inversion)
///
/// `NodeNotifier` used to call `chatProvider` / `contactProvider` /
/// `terminalProvider` / `feedNotifyProvider` / `contentEngageProvider` /
/// `socialContextProvider` directly, construct a product `NodeServiceClient`
/// and `PairingService`, and read `owner_tabs.dart`. That made the whole
/// connection layer transitively product-bound, so no other product could reuse
/// it.
///
/// The dependency is now inverted: this file declares *what* the connection
/// layer needs at each lifecycle point, naming no product type; the product
/// layer implements it in `lib/providers/home_product_sync.dart` and installs
/// its implementation into [HomeConnectionHooksRegistry] at app start.
///
/// ```text
///   lib/connection/  ──calls──▶  HomeConnectionHooks (this file)
///                                      ▲ implements
///   lib/providers/home_product_sync.dart ──▶ chat / contact / … providers
/// ```
///
/// The connection layer keeps the *moments*: it still dispatches from the same
/// call sites, synchronously, in the same order as before, so the inversion is
/// a wiring change and not a timing change.
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Callbacks the connection layer makes into the product layer.
///
/// Every method is a moment the connection layer already had; the product layer
/// decides what product state to load or drop. No product type appears in any
/// signature.
abstract class HomeConnectionHooks {
  /// A home transport is connected (or reconnected): the product layer should
  /// (re)load its state — bonds, threads, rooms, terminals, inbox rows and the
  /// AI-chat bridge status.
  void onConnected();

  /// A push event arrived from the home node. [event] is the wire event name
  /// (`chat:message`, `bond:established`, `feed:notify`, …) and [data] its
  /// payload, forwarded unchanged.
  void onPushEvent(String event, dynamic data);

  /// The home's node-config arrived (also pushed as `home:config-updated`).
  /// The connection layer has already applied the session/profile part.
  void onNodeConfig(Map<String, dynamic> config);

  /// The profile list in the home config changed — [profiles] are the raw
  /// `familyProfiles` rows for [nodeId].
  void onProfilesChanged(List<Map<String, dynamic>> profiles, String nodeId);

  /// The bound owner/family role changed; the product layer's tab set depends
  /// on it.
  void onOwnerRoleChanged(bool isOwner);

  /// A non-owner session may need the Ext Agent chat row refreshed.
  void onExtAgentVisibilityRefreshNeeded();

  /// (Re)register the device push token with the home node — the bound profile
  /// may have changed.
  Future<void> onPushRegistrationNeeded();

  /// The home node went offline: drop transient product rows. In-memory caches
  /// keyed per content path survive (they are wiped on node switch).
  void onDisconnected();

  /// [nodeId] was unpaired: drop its in-memory product state.
  void onNodeForgotten(String nodeId);

  /// Switching to a *different* home: drop caches keyed by content paths.
  Future<void> onNodeSwitched();

  /// Perform the pairing handshake RPC on the already-connected pre-auth
  /// transport.
  ///
  /// [pairingToken], [deviceName] and [deviceId] are connection-level values;
  /// [profileBindings] carries the optional profile params the caller passed to
  /// `pairWithNode` (`profileId` / `profileName` / `profileAvatarColor`)
  /// opaquely. The returned map is the raw `pairThinClient` result; the
  /// connection layer reads `sessionToken`, `ownerId`, `profileId`,
  /// `isOwnerProfile` and `familyProfiles` from it.
  Future<Map<String, dynamic>> pairHome({
    required String pairingToken,
    required String deviceName,
    required String deviceId,
    required Map<String, dynamic> profileBindings,
  });
}

/// Holds the installed hooks for this container.
///
/// The connection layer must not import the product layer, so the product layer
/// installs its implementation here at app start (`main.dart` reads
/// `homeProductSyncProvider`). Container-scoped rather than global so each test
/// container gets its own registry.
class HomeConnectionHooksRegistry {
  HomeConnectionHooks? _hooks;

  /// The installed hooks, or `null` when no product layer is present (unit
  /// tests that only exercise transport/pairing).
  HomeConnectionHooks? get hooks => _hooks;

  /// Install [hooks] for this container. Idempotent.
  void install(HomeConnectionHooks hooks) {
    _hooks = hooks;
  }
}

/// Registry provider — see [HomeConnectionHooksRegistry].
final homeConnectionHooksRegistryProvider =
    Provider<HomeConnectionHooksRegistry>((ref) {
  return HomeConnectionHooksRegistry();
});
