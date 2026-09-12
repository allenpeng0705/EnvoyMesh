import 'dart:async';
import 'dart:developer' as developer;

import 'package:envoy_mesh_libp2p/envoy_mesh_libp2p.dart';
import 'package:envoy_thin_client/models/stored_node.dart';
import 'package:envoy_thin_client/services/candidate_resolver.dart';
import 'package:envoy_thin_client/services/client_proxy_transport.dart';
import 'package:envoy_thin_client/services/exceptions.dart';
import 'package:envoy_thin_client/services/home_remote_client.dart';
import 'package:envoy_thin_client/services/pairing_uri.dart' show PairingData;
import 'package:envoy_thin_client/services/platform_web_socket.dart';
import 'package:envoy_thin_client/services/reconnect_supervisor.dart';
import 'package:envoy_thin_client/services/web_socket_like.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../mesh/secure_storage_libp2p_seed_store.dart';
import '../services/connectivity_observer.dart';
import '../services/home_rpc_session.dart';
import '../services/upnp.dart';
import '../storage/local_database.dart';
import '../storage/secure_storage.dart';
import 'home_connection_hooks.dart';
import 'home_pairing.dart';

/// Log a message that is always visible, even in release builds.
void _log(String msg) {
  developer.log(msg, name: 'NodeNotifier');
}

enum NodeConnectionState {
  disconnected,
  connecting,
  connected,
  error,
}

/// State for the active home node and connection.
class NodeState {
  final StoredNode? activeNode;
  final List<StoredNode> pairedNodes;
  final NodeConnectionState connectionState;
  final String? activeTransport;
  final String? errorMessage;
  final String? ownerId;

  /// Timestamp of the most recent `connectToNode` attempt (success or
  /// failure). The Me screen renders this as a relative "last attempt"
  /// string while the supervisor is retrying.
  final DateTime? lastConnectAttemptAt;

  /// Monotonic count of reconnect attempts the supervisor has made
  /// for the current target node. Reset to 0 on a fresh `connectToNode`
  /// or on a successful connect.
  final int reconnectAttempt;

  /// Typed error code from the most recent failed connect attempt.
  /// `null` when there is no error or when the last connect succeeded.
  ///
  /// Values:
  ///   - `'unauthorized'` — home rejected the session token; supervisor
  ///     has stopped, Me screen shows a Re-pair CTA.
  ///   - `'offline'`      — every transport candidate failed to reach
  ///     the home node; supervisor will keep retrying.
  ///   - `'transport'`    — non-auth failure mid-attempt (WS error,
  ///     timeout, malformed response). Supervisor will keep retrying.
  final String? homeNodeErrorCode;

  /// UPnP discovered reachable address. If not null, the mobile
  /// can receive direct connections on this address.
  /// Format: /ip4/X.X.X.X/tcp/PORT
  final String? upnpAdvertisedAddr;

  /// Phase 51 — bound family profile id on the home node.
  final String? familyProfileId;

  /// Immutable pairing intent written only at family invite / owner QR pair
  /// time (and cleared on unpair). Never overwritten by config sync — so a
  /// corrupted `familyProfileId:"owner"` can still filter DMs and repair as Mom.
  final String? pairedFamilyProfileId;

  /// Phase 51 — whether this session is the owner profile.
  final bool isOwnerProfile;

  /// Phase 51 — family profiles snapshot from config / pairing.
  final List<Map<String, dynamic>> familyProfiles;

  const NodeState({
    this.activeNode,
    this.pairedNodes = const [],
    this.connectionState = NodeConnectionState.disconnected,
    this.activeTransport,
    this.errorMessage,
    this.ownerId,
    this.lastConnectAttemptAt,
    this.reconnectAttempt = 0,
    this.homeNodeErrorCode,
    this.upnpAdvertisedAddr,
    this.familyProfileId,
    this.pairedFamilyProfileId,
    this.isOwnerProfile = true,
    this.familyProfiles = const [],
  });

  /// Profile used for family DM visibility + identity recovery.
  /// Prefers immutable pairing intent over a possibly corrupted session id.
  String get effectiveFamilyProfileId {
    final paired = pairedFamilyProfileId?.trim();
    if (paired != null && paired.isNotEmpty && paired != 'owner') return paired;
    final current = familyProfileId?.trim();
    if (current != null && current.isNotEmpty) return current;
    return 'owner';
  }

  /// Owner-controlled Coding assistants gate (Pi + Envoy Harness chat).
  /// Requires a paired home node — without one there is nothing to talk to.
  bool get mayUseCoding {
    if (activeNode == null) return false;
    if (isOwnerProfile) return true;
    final pid = effectiveFamilyProfileId.trim();
    if (pid.isEmpty || pid == 'owner') return false;
    for (final p in familyProfiles) {
      if (p['id']?.toString() == pid) {
        return p['codingEnabled'] == true;
      }
    }
    return false;
  }

  NodeState copyWith({
    StoredNode? activeNode,
    bool clearActiveNode = false,
    List<StoredNode>? pairedNodes,
    NodeConnectionState? connectionState,
    String? activeTransport,
    String? errorMessage,
    bool clearErrorMessage = false,
    String? ownerId,
    bool clearOwnerId = false,
    DateTime? lastConnectAttemptAt,
    int? reconnectAttempt,
    String? homeNodeErrorCode,
    bool clearHomeNodeErrorCode = false,
    String? upnpAdvertisedAddr,
    bool clearUpnpAddr = false,
    String? familyProfileId,
    bool clearFamilyProfileId = false,
    String? pairedFamilyProfileId,
    bool clearPairedFamilyProfileId = false,
    bool? isOwnerProfile,
    List<Map<String, dynamic>>? familyProfiles,
  }) {
    return NodeState(
      activeNode: clearActiveNode ? null : (activeNode ?? this.activeNode),
      pairedNodes: pairedNodes ?? this.pairedNodes,
      connectionState: connectionState ?? this.connectionState,
      activeTransport: activeTransport ?? this.activeTransport,
      errorMessage: clearErrorMessage ? null : (errorMessage ?? this.errorMessage),
      ownerId: clearOwnerId ? null : (ownerId ?? this.ownerId),
      lastConnectAttemptAt: lastConnectAttemptAt ?? this.lastConnectAttemptAt,
      reconnectAttempt: reconnectAttempt ?? this.reconnectAttempt,
      homeNodeErrorCode: clearHomeNodeErrorCode
          ? null
          : (homeNodeErrorCode ?? this.homeNodeErrorCode),
      upnpAdvertisedAddr: clearUpnpAddr ? null : (upnpAdvertisedAddr ?? this.upnpAdvertisedAddr),
      familyProfileId: clearFamilyProfileId
          ? null
          : (familyProfileId ?? this.familyProfileId),
      pairedFamilyProfileId: clearPairedFamilyProfileId
          ? null
          : (pairedFamilyProfileId ?? this.pairedFamilyProfileId),
      isOwnerProfile: isOwnerProfile ?? this.isOwnerProfile,
      familyProfiles: familyProfiles ?? this.familyProfiles,
    );
  }
}

/// Provider for node connection state.
final nodeProvider =
    StateNotifierProvider<NodeNotifier, NodeState>((ref) {
  return NodeNotifier(
    ref: ref,
    secureStorage: SecureStorage(),
    localDb: LocalDatabase(),
  );
});

class NodeNotifier extends StateNotifier<NodeState> {
  final Ref _ref;
  final SecureStorage _secureStorage;
  final LocalDatabase _localDb;

  HomeRemoteClient? _client;

  /// Product-plane hooks installed by the product layer (see
  /// [HomeConnectionHooksRegistry]). `null` when no product layer is present —
  /// unit tests that exercise transport/pairing only.
  HomeConnectionHooks? get _hooks =>
      _ref.read(homeConnectionHooksRegistryProvider).hooks;
  /// Reusable session plumbing (no product types — see Workstream A5).
  HomeRpcSession? _session;

  /// Route that was working when the app entered the background.
  ///
  /// Resume tries this route first once, avoiding slow LAN/P2P timeouts before
  /// returning to a known-good relay. Later reconnects use the normal resolver
  /// order so direct-route upgrades still work.
  String? _resumeTransportName;

  /// Libp2p node for direct P2P connectivity when relay is unavailable.
  Libp2pNode? _libp2pNode;

  /// Avoid stacking push handlers when `_syncAllData` runs on reconnect
  /// against the same [HomeRemoteClient].
  HomeRemoteClient? _pushEventsClient;

  /// One-shot guard: repair owner→family session binding then reconnect.
  bool _sessionRepairAttempted = false;

  /// `true` after [dispose] has been called. Used to short-circuit
  /// supervisor callbacks that fire after the notifier is gone.
  bool _disposed = false;

  /// Active supervisor for retrying `connectToNode` after a failed
  /// initial connect. Created lazily by [_startSupervisorFor] when
  /// a paired node is known. `null` when no auto-reconnect is
  /// in flight (either because no node is paired, or because the
  /// last attempt succeeded and the inner client has taken over,
  /// or because an `UnauthorizedException` halted the loop).
  ReconnectSupervisor? _supervisor;

  /// The nodeId the supervisor is currently configured to retry
  /// against. Updated on `loadPairedNodes`, `pairWithNode`,
  /// `switchToNode`. Cleared in `unpairNode` when the unpaired
  /// node is the supervisor's target.
  String? _supervisorTargetNodeId;

  /// Concurrency guard for `connectToNode`. If a connect is already
  /// in flight to the same target, additional callers receive the
  /// same future instead of stacking up — the supervisor relies on
  /// this to avoid double-creating `HomeRemoteClient` instances.
  Future<void>? _connectingFuture;

  /// Connectivity observer for kicking the supervisor on offline →
  /// online edges. `null` until [loadPairedNodes] (or any other
  /// pairing entry point) starts it.
  ConnectivityObserver? _connectivityObserver;

  /// Subscription to the connectivity observer's `onBecameOnline`
  /// stream. Cancelled in [unpairNode] when no paired nodes remain
  /// and in [dispose].
  StreamSubscription<void>? _connectivitySub;

  /// Subscription for Wi‑Fi ↔ cellular flips while staying online.
  StreamSubscription<void>? _networkTypeSub;

  /// Current Wi‑Fi flag from the observer (`null` if unknown / not started).
  bool? get isOnWifi => _connectivityObserver?.isOnWifi;

  /// Periodic timer that refreshes the UPnP port mapping before the
  /// lease expires. Started after a successful UPnP discovery; cancelled
  /// in [dispose].
  Timer? _upnpRefreshTimer;

  /// Duration between UPnP lease refreshes. 30 minutes — well within the
  /// 60-minute lease window, giving ample margin before expiry.
  static const _upnpRefreshInterval = Duration(minutes: 30);

  NodeNotifier({
    required Ref ref,
    required SecureStorage secureStorage,
    required LocalDatabase localDb,
    ConnectivityObserver? connectivityObserver,
  })  : _ref = ref,
        _secureStorage = secureStorage,
        _localDb = localDb,
        _connectivityObserver = connectivityObserver,
        super(const NodeState());

  HomeRemoteClient? get client => _client;

  /// Shared libp2p host (home dial + phone mesh). Null until first start.
  Libp2pNode? get libp2pNode => _libp2pNode;

  /// Start the shared libp2p host if needed (phone mesh or home circuit dial).
  ///
  /// Always seeds the community TCP relays. Pairing `bootstrapPeers` often
  /// include WebSocket URLs — those are filtered out so cold start does not
  /// stall dialing non-libp2p addresses. Remaining peers connect in background.
  Future<Libp2pNode?>? _ensureLibp2pInFlight;

  Future<Libp2pNode?> ensureLibp2pStarted() async {
    final inFlight = _ensureLibp2pInFlight;
    if (inFlight != null) return inFlight;

    final done = Completer<Libp2pNode?>();
    _ensureLibp2pInFlight = done.future;
    try {
      _libp2pNode ??= Libp2pNode(
        seedStore: SecureStorageLibp2pSeedStore(_secureStorage),
      );
      final fromNode = state.activeNode?.bootstrapPeers ?? const <String>[];
      final bootstrap = <String>[
        ...defaultEnvoyCommunityRelayBootstrapAddrs,
        ...filterLibp2pTcpBootstrapAddrs(fromNode),
      ];
      // Dedupe while preserving community-relay-first order.
      final seen = <String>{};
      final unique = <String>[
        for (final a in bootstrap)
          if (seen.add(a)) a,
      ];
      await _libp2pNode!.ensureTcpListen(
        listenAddrs: const ['/ip4/0.0.0.0/tcp/0'],
        bootstrapAddrs: unique,
        enableRelay: true,
      );
      done.complete(_libp2pNode);
      return _libp2pNode;
    } catch (e) {
      _log('ensureLibp2pStarted failed: $e');
      done.complete(null);
      return null;
    } finally {
      _ensureLibp2pInFlight = null;
    }
  }

  /// Load all paired nodes from local storage on app start.
  Future<void> loadPairedNodes() async {
    try {
      await _localDb.initialize();
    } catch (e) {
      _log('[loadPairedNodes] FAILED to initialize DB: $e');
      return;
    }
    List<Map<String, dynamic>> rows;
    try {
      rows = await _localDb.listNodes();
      _log('[loadPairedNodes] rows from DB: ${rows.length}');
    } catch (e) {
      _log('[loadPairedNodes] FAILED to listNodes: $e');
      return;
    }
    final nodes = <StoredNode>[];
    for (final r in rows) {
      try {
        nodes.add(StoredNode.fromJson(r));
      } catch (e) {
        _log('[loadPairedNodes] FAILED to parse node ${r['id']}: $e');
      }
    }
    _log('[loadPairedNodes] parsed nodes: ${nodes.map((n) => n.id).toList()}');
    state = state.copyWith(pairedNodes: nodes);

    // Start the connectivity observer (one-shot for the app's
    // lifetime). It kicks the supervisor whenever the device
    // transitions from offline to online.
    try {
      await _ensureConnectivityObserver();
    } catch (e) {
      _log(
        '[loadPairedNodes] _ensureConnectivityObserver failed (non-fatal): $e',
      );
    }

    // Auto-connect to last-used node.
    final activeNodeId = await _secureStorage.getActiveNodeId();
    _log('[loadPairedNodes] activeNodeId from SecureStorage: $activeNodeId');
    if (activeNodeId == null) {
      _log('[loadPairedNodes] no activeNodeId — skipping auto-connect');
    } else {
      final node = nodes.where((n) => n.id == activeNodeId).firstOrNull;
      _log('[loadPairedNodes] node found for activeNodeId: ${node?.id}');
      if (node == null) {
        _log('[loadPairedNodes] node is NULL — no matching StoredNode in DB');
      } else {
        // Start the supervisor FIRST so that if connectToNode fails
        // (home offline), the supervisor is already running and
        // "Reconnect now" / kickReconnect will work.
        _startSupervisorFor(node.id);
        _log('[loadPairedNodes] _startSupervisorFor called');
        _log('[loadPairedNodes] calling connectToNode...');
        try {
          await connectToNode(node);
          _log('[loadPairedNodes] connectToNode succeeded');
        } catch (e, st) {
          _log('[loadPairedNodes] connectToNode failed: $e\n$st');
          _log('[loadPairedNodes] supervisor should now be running for retry');
        }
      }
    }
  }

  /// Discover UPnP address for direct P2P connectivity.
  ///
  /// UPnP allows the mobile to map a port on the router so
  /// the home node can dial us directly (reverse connection).
  Future<void> _discoverUpnp() async {
    // Get the mobile's libp2p listen port (or use default 4001)
    // The libp2p node's actual port is determined at runtime.
    // For UPnP, we map the libp2p port so home can dial us.
    try {
      final upnpResult = await UpnpClient.mapPort(
        internalPort: 4001,
        externalPort: 4001,
      );

      if (upnpResult != null) {
        final addr = '/ip4/${upnpResult.ip}/tcp/${upnpResult.port}';
        state = state.copyWith(upnpAdvertisedAddr: addr);

        // Share with home node.
        await _shareUpnpAddrWithHome();

        // Refresh the UPnP mapping before the 60-minute lease expires.
        _startUpnpRefreshTimer();
      }
    } catch (e) {
      // UPnP is best-effort — if the router doesn't support it or we're
      // on a network that blocks multicast, the app should still work.
      _log('[_discoverUpnp] UPnP failed (non-fatal): $e');
    }
  }

  /// Schedule periodic UPnP lease refreshes. Idempotent — calling while a
  /// timer is already running resets it.
  void _startUpnpRefreshTimer() {
    _upnpRefreshTimer?.cancel();
    _upnpRefreshTimer = Timer.periodic(_upnpRefreshInterval, (_) {
      if (_disposed) return;
      _refreshUpnpMapping();
    });
  }

  /// Re-run UPnP discovery and re-share the address with the home node.
  /// Called by the periodic refresh timer.
  Future<void> _refreshUpnpMapping() async {
    if (_disposed) return;
    _log('[NodeNotifier] refreshing UPnP mapping…');
    await _discoverUpnp();
  }

  /// Share the UPnP-discovered address with the home node.
  ///
  /// If the UPnP address is not yet available (still discovering or failed on
  /// startup), triggers a fresh discovery so the share happens as soon as
  /// possible without blocking the connect path.
  Future<void> _shareUpnpAddrWithHome() async {
    var upnpAddr = state.upnpAdvertisedAddr;

    // If we don't have a UPnP address yet, kick off discovery immediately.
    // _discoverUpnp() will call us again when it has the result.
    if (upnpAddr == null) {
      _discoverUpnp();
      return;
    }

    if (_session == null || _libp2pNode == null) return;

    try {
      final peerId = _libp2pNode!.peerId?.toString();
      if (peerId != null) {
        await _session!.updateMyListenAddrs(
          peerId,
            [
              upnpAddr,
            ],
          ownerId: state.ownerId);
        _log('[NodeNotifier] shared UPnP address $upnpAddr with home node');
      }
    } catch (e) {
      _log('[NodeNotifier] failed to share UPnP address: $e');
    }
  }

  /// Lazily create and start the connectivity observer on first
  /// use. Idempotent. The subscription is stored on the notifier
  /// so it can be cancelled in [unpairNode] / [dispose].
  Future<void> _ensureConnectivityObserver() async {
    if (_connectivitySub != null) return;
    final observer = _connectivityObserver ??= RealConnectivityObserver();
    await observer.start();
    _connectivitySub = observer.onBecameOnline.listen((_) {
      kickReconnect();
    });
    _networkTypeSub = observer.onNetworkTypeChanged.listen((_) {
      _log(
        '[connectivity] Wi‑Fi↔cellular — force reconnect with fresh candidates',
      );
      unawaited(_reconnectForNetworkTypeChange());
    });
  }

  /// Drop a (possibly stuck) session and reconnect with fresh candidates
  /// (always LAN → P2P → relay fallback).
  Future<void> _reconnectForNetworkTypeChange() async {
    await forceReconnect();
  }

  /// Construct a fresh [ReconnectSupervisor] targeting the given
  /// nodeId. Replaces any prior supervisor. The supervisor
  /// immediately schedules its first attempt; the inner
  /// `connectToNode` de-duplicates concurrent calls via
  /// [_connectingFuture] so a supervisor kick does not race the
  /// initial connect.
  void _startSupervisorFor(String nodeId) {
    _log(
      '[_startSupervisorFor] nodeId=$nodeId, current supervisorTargetNodeId=$_supervisorTargetNodeId',
    );
    _supervisor?.stop();
    _supervisorTargetNodeId = nodeId;
    _supervisor = ReconnectSupervisor(
      currentTargetNodeIdProvider: () => _supervisorTargetNodeId,
      getTargetNode: () {
        final id = _supervisorTargetNodeId;
        if (id == null) return null;
        return state.pairedNodes.where((n) => n.id == id).firstOrNull;
      },
      attemptConnect: (node) => connectToNode(node),
      onAttemptStarted: () {
        if (_disposed) return;
        state = state.copyWith(
          reconnectAttempt: state.reconnectAttempt + 1,
          lastConnectAttemptAt: DateTime.now(),
        );
      },
      onConnected: () {
        if (_disposed) return;
        state = state.copyWith(
          reconnectAttempt: 0,
          clearHomeNodeErrorCode: true,
          clearErrorMessage: true,
        );
      },
      onAttemptFailed: (code, message) {
        if (_disposed) return;
        state = state.copyWith(homeNodeErrorCode: code,
          errorMessage: message);
      },
    );
    _supervisor!.start();
  }

  /// Force an immediate reconnect attempt, resetting the
  /// supervisor's backoff. Used by:
  ///   - the Me screen's "Reconnect now" button;
  ///   - the `AppLifecycleState.resumed` lifecycle hook in
  ///     `_EnvoyGoRoot` (so resume-from-background re-checks the
  ///     home node instead of waiting up to 30s for the next
  ///     supervisor tick);
  ///   - the `connectivity_plus` offline → online listener.
  ///
  /// No-op when already connected — use [forceReconnect] to re-dial
  /// (e.g. switch Relay → LAN after joining home Wi‑Fi).
  void kickReconnect() {
    _log(
      '[kickReconnect] called, connectionState=${state.connectionState}, supervisor=$_supervisor, supervisor.isStopped=${_supervisor?.isStopped}, supervisorTargetNodeId=$_supervisorTargetNodeId',
    );
    if (state.connectionState == NodeConnectionState.connected) return;
    final supervisor = _supervisor;
    if (supervisor == null || supervisor.isStopped) {
      // Supervisor was stopped after initial connect, or never started.
      // Restart it to attempt reconnection. Fall back to activeNode after
      // pauseForBackground (supervisor stopped; target must still resolve).
      final targetNodeId =
          _supervisorTargetNodeId ?? state.activeNode?.id;
      if (targetNodeId != null) {
        _startSupervisorFor(targetNodeId);
      }
      return;
    }
    supervisor.kick();
  }

  /// Drop the active session and re-dial with a fresh candidate order.
  ///
  /// Unlike [kickReconnect], this works while connected — used when the
  /// phone moved onto home Wi‑Fi but is still stuck on Relay, or when
  /// the user taps Reconnect on the Me screen.
  Future<void> forceReconnect() async {
    final node = state.activeNode;
    if (node == null) {
      kickReconnect();
      return;
    }
    _log(
      '[forceReconnect] re-dialing ${node.id} (was ${state.activeTransport})',
    );
    await disconnect();
    _supervisor?.stop();
    _supervisor = null;
    _supervisorTargetNodeId = node.id;
    try {
      await connectToNode(node);
      // HomeRemoteClient owns post-connect reconnect; no supervisor needed.
    } catch (e) {
      _log('[forceReconnect] failed: $e');
      _startSupervisorFor(node.id);
    }
  }

  @override
  void dispose() {
    _disposed = true;
    _supervisor?.stop();
    _supervisor = null;
    _supervisorTargetNodeId = null;
    _upnpRefreshTimer?.cancel();
    _upnpRefreshTimer = null;
    _connectivitySub?.cancel();
    _connectivitySub = null;
    _networkTypeSub?.cancel();
    _networkTypeSub = null;
    _connectivityObserver?.dispose();
    _connectivityObserver = null;
    _client?.dispose();
    _client = null;
    _pushEventsClient = null;
    _session = null;
    super.dispose();
  }

  /// Transport options for a one-shot client over [candidates].
  ///
  /// Used by product code that must open a pre-auth connection of its own (the
  /// family-invite preview in `lib/providers/home_product_sync.dart`), so the
  /// transport factory stays owned by this layer. Mirrors the options
  /// [pairWithNode] builds.
  HomeRemoteClientOptions buildClientOptionsForCandidates(
    List<HomeRemoteCandidate> candidates, {
    void Function(HomeRemoteCandidate candidate)? onCandidateTrying,
  }) {
    return HomeRemoteClientOptions(
      resolveCandidates: () async => candidates,
      createTransport: (c) => _createTransportForCandidate(c),
      onCandidateTrying: onCandidateTrying,
    );
  }

  /// Stable client device id (reusable plumbing owned by this layer; the
  /// product layer borrows it when it pairs).
  Future<String> clientDeviceId() => getOrCreateClientDeviceId(_secureStorage);

  /// Pair with a home node using pairing data.
  ///
  /// [onConnectingCandidate] is invoked before each transport candidate is
  /// attempted (LAN → P2P → relay) so the pairing UX can show live "now
  /// connecting via …" feedback during the handshake.
  Future<PairResult> pairWithNode(
    PairingData data,
    String deviceName,
    List<HomeRemoteCandidate> candidates, {
    String? profileName,
    String? profileAvatarColor,
    String? profileId,
    void Function(HomeRemoteCandidate candidate)? onConnectingCandidate,
  }) async {
    state = state.copyWith(connectionState: NodeConnectionState.connecting);

    // Ensure the local database is initialized before we write to it.
    // On a fresh install, loadPairedNodes may not have completed yet.
    await _localDb.initialize();

    final opts = HomeRemoteClientOptions(
      resolveCandidates: () async => candidates,
      createTransport: (c) => _createTransportForCandidate(c),
      onCandidateTrying: onConnectingCandidate,
    );
    _client = HomeRemoteClient(opts);
    _pushEventsClient = null;
    PairResult result;
    try {
      await _client!.ensureConnected();
      _session = HomeRpcSession(_client!);

      // The handshake binds a profile, so it is a product-plane RPC: the
      // product layer performs it over the transport we just connected
      // (Workstream A5 inversion). Without a product layer there is nothing to
      // pair to, so this is a hard error rather than a silent no-op.
      final hooks = _hooks;
      if (hooks == null) {
        throw StateError(
          'pairWithNode requires the product layer hooks '
          '(homeProductSyncProvider) to be installed',
        );
      }
      final deviceId = await getOrCreateClientDeviceId(_secureStorage);
      final rawResult = await hooks.pairHome(
        pairingToken: data.token,
        deviceName: deviceName,
        deviceId: deviceId,
        profileBindings: {
          if (profileId != null) 'profileId': profileId,
          if (profileName != null) 'profileName': profileName,
          if (profileAvatarColor != null)
            'profileAvatarColor': profileAvatarColor,
        },
      );
      result = PairResult.fromRpc(rawResult);
    } catch (e) {
      _client?.dispose();
      _client = null;
      _pushEventsClient = null;
      state = state.copyWith(
        connectionState: NodeConnectionState.error,
        errorMessage: 'Pairing failed: $e',
      );
      rethrow;
    }

    // Store session token securely.
    // Reuse existing nodeId if this homePeerId was already paired.
    final existingNode = state.pairedNodes
        .where((n) => n.homePeerId == data.homeNodePeerId)
        .firstOrNull;
    final nodeId = existingNode?.id ?? _generateNodeId();
    try {
      await _secureStorage.saveSessionToken(nodeId, result.sessionToken);
      await _secureStorage.saveActiveNodeId(nodeId);
      await _secureStorage.write(
        'node.$nodeId.familyProfileId',
        result.profileId,
      );
      await _secureStorage.write(
        'node.$nodeId.isOwnerProfile',
        result.isOwnerProfile ? '1' : '0',
      );
      // Immutable pairing intent — never rewritten by config sync.
      await _secureStorage.write(
        'node.$nodeId.pairedFamilyProfileId',
        result.profileId,
      );
    } catch (e) {
      _log('Failed to save session token: $e');
      state = state.copyWith(
        connectionState: NodeConnectionState.error,
        errorMessage: 'Pairing succeeded but failed to persist — '
            'the node may be lost after app restart.',
      );
    }

    state = state.copyWith(
      familyProfileId: result.profileId,
      pairedFamilyProfileId: result.profileId,
      isOwnerProfile: result.isOwnerProfile,
      familyProfiles: result.familyProfiles,
      ownerId: result.ownerId,
    );
    _sessionRepairAttempted = false;
    // Fresh pair — always start on Social/Chats (owner vs family tab sets
    // differ). Tab ids are a product concern, so the product layer resolves
    // them from the role.
    _hooks?.onOwnerRoleChanged(result.isOwnerProfile);

    // Build the StoredNode with relays from the QR code.
    // Extra `rels` / bootstrapPeers WS URLs enable regional fallback.
    // Save to DB BEFORE connectToNode so that if connection fails, the next
    // retry (which loads from DB) still has the correct bootstrapPeers.
    final List<String> bootstrapPeers = [];
    if (data.bootstrapPeers != null && data.bootstrapPeers!.isNotEmpty) {
      bootstrapPeers.addAll(data.bootstrapPeers!);
    }
    if (data.relayWsUrls != null) {
      for (final u in data.relayWsUrls!) {
        if (!bootstrapPeers.contains(u)) bootstrapPeers.add(u);
      }
    }
    if (data.bootstrapPresetNames != null &&
        data.bootstrapPresetNames!.isNotEmpty) {
      for (final p in CandidateResolver.resolveBootstrapPresets(
        data.bootstrapPresetNames!,
      )) {
        if (!bootstrapPeers.contains(p)) bootstrapPeers.add(p);
      }
    }

    final node = StoredNode(
      id: nodeId,
      name: defaultHomeNodeDisplayName,
      ownerId: result.ownerId,
      homePeerId: data.homeNodePeerId ?? '',
      lanIp: data.lanWsUrl,
      wsPort: 3030,
      relayWsUrl: data.relayWsUrl,
      pairedAt: existingNode?.pairedAt ?? DateTime.now(),
      lastConnectedAt: DateTime.now(),
      publicHost: existingNode?.publicHost,
      publicPort: existingNode?.publicPort ?? 3030,
      bootstrapPeers: bootstrapPeers,
    );
    // Persist BEFORE connectToNode so retry uses the correct bootstrapPeers.
    await _localDb.upsertNode(node.toJson());
    await _localDb.updateNodeLastConnected(nodeId);

    // Update paired nodes list — replace existing or add new.
    final updatedNodes = existingNode != null
        ? state.pairedNodes
            .map((n) => n.homePeerId == data.homeNodePeerId ? node : n)
            .toList()
        : [...state.pairedNodes, node];
    state = state.copyWith(pairedNodes: updatedNodes,
      ownerId: result.ownerId);

    // Dispose the pairing connection (used QR pairing token, not session token).
    _client?.dispose();
    _client = null;
    _pushEventsClient = null;
    _session = null;

    // Reconnect with the new session token so all RPCs are authenticated.
    await connectToNode(node);

    // Fetch bootstrap peers from the home node for multi-relay fallback.
    // This is the last step of pairing so the StoredNode is complete.
    try {
      final payload = await _session!.getPairingPayload();
      final bootstrapList = (payload['bootstrapPeers'] as List<dynamic>?)?.cast<String>();
      if (bootstrapList != null && bootstrapList.isNotEmpty) {
        final nodeWithBootstrap = node.copyWith(bootstrapPeers: bootstrapList);
        await _localDb.upsertNode(nodeWithBootstrap.toJson());
        final updatedNodes = state.pairedNodes
            .map(
              (n) =>
                n.homePeerId == data.homeNodePeerId ? nodeWithBootstrap : n,
            )
            .toList();
        state = state.copyWith(pairedNodes: updatedNodes);
      }
    } catch (e) {
      _log('Failed to fetch bootstrap peers: $e');
    }

    // Start the reconnect supervisor for this node. If the
    // initial connect failed, the supervisor will keep retrying
    // (with backoff) until either the home comes back online or
    // the user unpairs.
    _startSupervisorFor(node.id);

    // Unpair of the last node cancels Wi‑Fi↔cellular listeners; restore them
    // so re-pair without app restart still re-probes LAN/P2P on network change.
    try {
      await _ensureConnectivityObserver();
    } catch (e) {
      _log('[pairWithNode] _ensureConnectivityObserver failed (non-fatal): $e');
    }

    return result;
  }

  /// Abort an in-flight `pairWithNode` call. Idempotent: safe to call
  /// when no pairing is running. Forces the underlying transport to
  /// close, which makes the pending `pairThinClient` RPC throw; the
  /// awaiting `pairWithNode` future then lands in its catch block,
  /// rethrows, and the progress screen navigates back to the confirm
  /// screen with the error message intact.
  ///
  /// Used by `PairingProgressScreen` so the user can back out of a
  /// 2-3 minute handshake (Apple HIG: don't strand the user on a
  /// spinner for minutes with no way out).
  void cancelPairing() {
    if (state.connectionState != NodeConnectionState.connecting) return;
    _log('cancelPairing: aborting in-flight pairing handshake');
    final client = _client;
    _client = null;
    _pushEventsClient = null;
    _session = null;
    // Force-close the transport. The pending RPC throws and
    // pairWithNode's catch handler runs; it tries `_client?.dispose()`
    // which is now a no-op on the local null.
    client?.dispose();
    state = state.copyWith(connectionState: NodeConnectionState.disconnected);
  }

  /// Sync all data from the home node after a successful connection.
  void _syncAllData() {
    final client = _client;
    if (client == null || _session == null) return;

    // Subscribe to push events from the home node. The connection layer only
    // forwards them; the product layer owns the handlers (Workstream A5).
    _subscribeToPushEvents(client);

    // Load product state (bonds, threads, rooms, terminals, inbox, bridge
    // status). The product layer decides what applies to this profile/plane.
    _hooks?.onConnected();

    // Sync dynamic AI character bots + family profiles from config. Config also
    // carries the session's profile binding, which is connection state, so it
    // is applied here and the product layer is notified afterwards.
    client.call('getNodeConfig').then((config) {
      final configMap = Map<String, dynamic>.from(config as Map);
      _applyFamilyConfig(configMap);
      _hooks?.onNodeConfig(configMap);
    }).catchError((e) {
      _log('getNodeConfig for aiBots failed: $e');
    });
  }


  void _applyFamilyConfig(Map<String, dynamic> config) {
    final profilesRaw = config['familyProfiles'];
    final profiles = profilesRaw is List
        ? profilesRaw
            .whereType<Map>()
            .map((e) => Map<String, dynamic>.from(e))
            .toList()
        : const <Map<String, dynamic>>[];
    final callerProfileId =
        (config['callerFamilyProfileId'] as String?)?.trim();
    final callerIsOwner = config['callerIsOwnerProfile'] as bool?;

    // Prefer immutable pairing intent over a possibly corrupted session id
    // (e.g. local `familyProfileId` flipped to owner by a bad broadcast).
    final pairedId = state.pairedFamilyProfileId?.trim();
    final localId = state.familyProfileId?.trim();
    final intentId = (pairedId != null &&
            pairedId.isNotEmpty &&
            pairedId != 'owner')
        ? pairedId
        : localId;
    final localIsFamilyMember =
        intentId != null && intentId.isNotEmpty && intentId != 'owner';

    late final String? nextProfileId;
    late final bool nextIsOwner;
    String? nextPairedId = pairedId;
    if (localIsFamilyMember) {
      if (callerProfileId != null &&
          callerProfileId.isNotEmpty &&
          callerProfileId != 'owner') {
        // Server confirms a non-owner profile (possibly after re-pair).
        nextProfileId = callerProfileId;
        nextIsOwner = false;
        nextPairedId = callerProfileId;
      } else {
        nextProfileId = intentId;
        nextIsOwner = false;
        nextPairedId ??= intentId;
        if (callerProfileId == 'owner' || callerIsOwner == true) {
          _log(
            'Ignoring getNodeConfig owner identity; keeping family profile $intentId',
          );
          unawaited(repairFamilySession(intentId));
        }
      }
    } else if (callerProfileId != null &&
        callerProfileId.isNotEmpty &&
        callerProfileId != 'owner') {
      // Local looks like owner — still prefer a non-owner server stamp
      // (common recovery path when only secure-storage was corrupted).
      nextProfileId = callerProfileId;
      nextIsOwner = false;
      nextPairedId = callerProfileId;
    } else {
      nextProfileId = (callerProfileId != null && callerProfileId.isNotEmpty)
          ? callerProfileId
          : localId;
      nextIsOwner = callerIsOwner ??
          _resolveIsOwnerProfile(null, nextProfileId);
    }

    final profileChanged = nextProfileId != state.familyProfileId ||
        nextIsOwner != state.isOwnerProfile;
    final ownerRoleChanged = nextIsOwner != state.isOwnerProfile;
    final pairedChanged = nextPairedId != state.pairedFamilyProfileId;

    state = state.copyWith(
      familyProfiles: profiles,
      familyProfileId: nextProfileId,
      pairedFamilyProfileId: nextPairedId,
      isOwnerProfile: nextIsOwner,
    );
    final node = state.activeNode;
    if (node != null) {
      unawaited(
        _persistFamilySessionFlags(
        node.id,
        profileId: nextProfileId,
        isOwner: nextIsOwner,
        ),
      );
      if (pairedChanged &&
          nextPairedId != null &&
          nextPairedId.isNotEmpty) {
        unawaited(_persistPairedFamilyProfileId(node.id, nextPairedId));
      }
      if (profiles.isNotEmpty) {
        _hooks?.onProfilesChanged(profiles, node.id);
      }
    }
    // Re-register push only when identity actually changed (avoid re-register
    // on every home:config-updated).
    if (profileChanged) {
      unawaited(registerPushToken());
      // Tab sets differ by role (product concern) — the product layer resets
      // to Social/Chats (id-based, no index collision).
      if (ownerRoleChanged) {
        _hooks?.onOwnerRoleChanged(nextIsOwner);
      }
    }
    // Owner toggled Ext Agent allow — refresh chat-row visibility from RPC
    // (masked getBridgeStatus) so we do not wait for an unrelated bridge push.
    if (!nextIsOwner) {
      _hooks?.onExtAgentVisibilityRefreshNeeded();
    }
  }

  /// Resolve owner vs family from persisted flags.
  ///
  /// A non-owner family profile id always wins over a stale `isOwnerProfile=1`
  /// flag so Mom/Dad never default back to owner after reconnect.
  static bool _resolveIsOwnerProfile(String? flag, String? profileId) {
    final id = profileId?.trim();
    if (id != null && id.isNotEmpty && id != 'owner') return false;
    if (flag == '0') return false;
    if (flag == '1') return true;
    return true;
  }

  Future<void> _persistFamilySessionFlags(
    String nodeId, {
    required String? profileId,
    required bool isOwner,
  }) async {
    try {
      if (profileId != null && profileId.isNotEmpty) {
        await _secureStorage.write('node.$nodeId.familyProfileId', profileId);
      }
      await _secureStorage.write(
        'node.$nodeId.isOwnerProfile',
        isOwner ? '1' : '0',
      );
    } catch (e) {
      _log('persist family session flags failed: $e');
    }
  }

  /// Persist immutable pairing intent (pair time + recovery backfill only).
  Future<void> _persistPairedFamilyProfileId(
    String nodeId,
    String profileId,
  ) async {
    try {
      await _secureStorage.write(
        'node.$nodeId.pairedFamilyProfileId',
        profileId,
      );
    } catch (e) {
      _log('persist pairedFamilyProfileId failed: $e');
    }
  }

  /// When the home session token is stuck on owner but this device knows it
  /// is Mom/Dad, repair the token and reconnect so WS routing + push target
  /// the correct profile. Requires a legacy missing-profileId token or an
  /// immutable server `boundFamilyProfileId` — intentional owner QR pairs
  /// must re-pair with a family invite.
  ///
  /// Returns `true` when repair + reconnect succeeded.
  Future<bool> repairFamilySession(
    String profileId, {
    bool force = false,
  }) async {
    if (_disposed) return false;
    if (!force && _sessionRepairAttempted) return false;
    _sessionRepairAttempted = true;
    final session = _session;
    final node = state.activeNode;
    if (session == null || node == null) {
      _sessionRepairAttempted = false;
      return false;
    }
    try {
      _log('repairSessionProfile → $profileId');
      await session.repairSessionProfile(profileId: profileId);
      // Must drop the old owner-bound WS; connectToNode alone can leave a
      // stale HomeRemoteClient and keep sendFamilyMessage on owner.
      await forceReconnect();
      return true;
    } catch (e) {
      _log('repairSessionProfile failed: $e');
      // Allow another attempt on the next config sync / reconnect.
      _sessionRepairAttempted = false;
      return false;
    }
  }

  /// Create the appropriate transport for a candidate URL scheme.
  ///
  /// Relay candidates use `ClientProxyTransport.connect` which speaks the
  /// proxy handshake through the relay WebSocket. All other candidates
  /// use a plain WebSocket.
  Future<WebSocketLike> _createTransportForCandidate(
      HomeRemoteCandidate candidate,
  ) async {
    // Relay proxy transport: URLs containing ?target=<homePeerId> use the
    // ClientProxyTransport which handles the proxy handshake protocol.
    if (candidate.homePeerId != null &&
        candidate.homePeerId!.isNotEmpty &&
        candidate.url.contains('?target=')) {
      _log(
        '[_createTransportForCandidate] relay (client-proxy): ${candidate.name} — ${candidate.url}',
      );
      // candidate.url is already the full WebSocket URL with ?target= and ?token=.
      // Extract the base relay URL by taking everything before '?target='.
      final targetIdx = candidate.url.indexOf('?target=');
      final relayWsUrl = candidate.url.substring(0, targetIdx);
      return ClientProxyTransport.connect(
        relayWsUrl: relayWsUrl,
        homePeerId: candidate.homePeerId!,
        sessionToken: candidate.sessionToken ?? '',
      );
    }
    // Libp2p circuit relay transport: uses Libp2pNode to dial through
    // the community relay's circuit relay v2.
    if (candidate.libp2pRelayAddr != null &&
        candidate.libp2pRelayAddr!.isNotEmpty) {
      _log(
        '[_createTransportForCandidate] libp2p-circuit-relay: ${candidate.name} — ${candidate.url}',
      );
      try {
        // Bound libp2p setup — DHT start alone waits 10s; without a cap,
        // each p2p candidate can hang far longer than perCandidateTimeoutMs.
        return await _createLibp2pTransport(candidate).timeout(
          const Duration(seconds: 12),
          onTimeout: () {
            throw TimeoutException(
              'libp2p transport timed out for ${candidate.name}',
            );
          },
        );
      } catch (e) {
        return Future.error(e);
      }
    }
    // Standard WebSocket.
    _log(
      '[_createTransportForCandidate] websocket: ${candidate.name} — ${candidate.url}',
    );
    return PlatformWebSocket.connect(candidate.url);
  }

  /// Create a libp2p transport for circuit relay dialing.
  Future<WebSocketLike> _createLibp2pTransport(
      HomeRemoteCandidate candidate,
  ) async {
    _log(
      '[_createLibp2pTransport] ENTERING — candidate: ${candidate.name}, url: ${candidate.url}',
    );

    // Get DHT bootstrap peers from the stored node (synced from home node via QR code).
    // Use these instead of hardcoded peers so mobile uses the same DHT network as home node.
    final nodeState = state;
    final bootstrapPeers = nodeState.activeNode?.bootstrapPeers ?? <String>[];
    _log(
      '[_createLibp2pTransport] DHT bootstrap peers from stored node: $bootstrapPeers',
    );

    // Start libp2p node if not already started (or restart for TCP listen).
    _libp2pNode ??= Libp2pNode(
      seedStore: SecureStorageLibp2pSeedStore(_secureStorage),
    );
    await _libp2pNode!.ensureTcpListen(
      listenAddrs: const ['/ip4/0.0.0.0/tcp/0'],
      bootstrapAddrs: bootstrapPeers,
      enableRelay: true,
    );

    const clientProxyProtocol = '/envoymesh/client-proxy/0.1.0';

    // Step 1: Try DHT first — find the peer's direct addresses via Kademlia.
    // DHT succeeds when the peer has advertised itself in the DHT (e.g., via the
    // community relay or a public bootstrap server). This gives us a direct IP
    // address that bypasses the relay entirely.
    AddrInfo? addrInfo;
    try {
      final homePeerId = PeerId.fromString(candidate.homePeerId!);
      _log(
        '[_createLibp2pTransport] DHT findPeer looking up homePeerId: ${homePeerId.toString()}',
      );
      addrInfo = await _libp2pNode!.findPeer(homePeerId);
    } catch (e) {
      _log('[_createLibp2pTransport] findPeer threw: $e');
      addrInfo = null;
    }
    _log(
      '[_createLibp2pTransport] DHT findPeer => ${addrInfo?.addrs.length ?? 0} addrs',
    );
    if (addrInfo != null && addrInfo.addrs.isNotEmpty) {
      _log(
        '[_createLibp2pTransport] DHT addresses discovered: ${addrInfo.addrs.map((a) => a.toString()).join(', ')}',
      );
      // Replace the ephemeral port from relay-observed addr with the conventional
      // libp2p port (4001). The relay reports the ephemeral source port of the TCP
      // connection (e.g. 28746), not the actual listen port. For direct libp2p
      // dial to work, port forwarding must map external 4001 -> internal libp2p port.
      const libp2pPort = 4001;
      for (final addr in addrInfo.addrs) {
        String dialAddr = addr.toString();
        // Skip circuit-relay addresses — those go through the relay, not direct.
        // For direct addresses (/ip4/X/tcp/PORT/p2p/PEERID), replace the port
        // with the conventional libp2p port so the dial reaches the right listener.
        if (!dialAddr.contains('/p2p-circuit/')) {
          // Direct address: replace ephemeral port with conventional libp2p port.
          // Format: /ip4/1.2.3.4/tcp/5678/p2p/PEERID
          dialAddr = dialAddr.replaceFirstMapped(
            RegExp(r'/tcp/\d+'),
            (m) => '/tcp/$libp2pPort',
          );
          _log(
            '[_createLibp2pTransport] DHT direct addr (port replaced to $libp2pPort): $dialAddr',
          );
        } else {
          _log(
            '[_createLibp2pTransport] DHT circuit-relay addr (skipping): $dialAddr',
          );
          continue;
        }
        try {
          final transport = await _libp2pNode!.dial(
            peerMultiaddr: dialAddr,
            protocolId: clientProxyProtocol,
          );
          await transport.performHandshake(candidate.sessionToken ?? '');
          return transport;
        } catch (e) {
          _log('[_createLibp2pTransport] direct dial $dialAddr failed: $e');
        }
      }
    }

    // Step 2: Circuit relay fallback — dial through a relay hop.
    // This works when DHT lookup failed (peer not advertising in DHT) but the
    // relay server is reachable. Format: /p2p/<relay>/p2p-circuit/p2p/<home>
    try {
      _log('[_createLibp2pTransport] trying circuit relay: ${candidate.url}');
      final transport = await _libp2pNode!.dial(
        peerMultiaddr: candidate.url,
        protocolId: clientProxyProtocol,
      );
      await transport.performHandshake(candidate.sessionToken ?? '');
      return transport;
    } catch (e) {
      _log('[_createLibp2pTransport] circuit relay failed: $e');
    }

    // All paths exhausted.
    throw Exception(
      'homeRemote.connectFailed (DHT: ${addrInfo?.addrs.length ?? 0} addrs)',
    );
  }

  /// Subscribe to server push events via WebSocket (fallback) and
  /// libp2p GossipSub (primary). Dedup is handled by ChatNotifier's
  /// _seenMessageIds, so events arriving via both paths are only
  /// processed once.
  /// Home push events forwarded to the product layer.
  ///
  /// The list is the connection layer's *contract* with the product layer: it
  /// names wire events, not product types. Handlers live in
  /// `HomeConnectionHooks.onPushEvent`.
  static const _forwardedPushEvents = [
    'chat:message',
    'chat:room-message',
    'chat:delivered',
    'chat:delivery-failed',
    'chat:room-updated',
    'chat:room-removed',
    'bond:established',
    'bond:revoked',
    'bridge:status',
    'agent:activity',
    'terminal:session-updated',
    'feed:notify',
    'content:engage',
  ];

  void _subscribeToPushEvents(HomeRemoteClient client) {
    // `_syncAllData` also runs on HomeRemoteClient.onReconnect for the
    // same client — only wire handlers once per client instance.
    if (identical(_pushEventsClient, client)) return;
    _pushEventsClient = client;

    for (final event in _forwardedPushEvents) {
      client.on(event, (data) => _hooks?.onPushEvent(event, data));
    }
    // Config changes also carry connection state (profile binding / owner
    // role), so they are applied here first and forwarded afterwards.
    client.on('home:config-updated', (data) {
      if (data is! Map) return;
      final config = data['config'];
      if (config is! Map) return;
      final configMap = Map<String, dynamic>.from(config);
      _applyFamilyConfig(configMap);
      // Always notify — family gets [] (or their own bots); clearing removes
      // owner bots that previously leaked onto Mom/Dad devices.
      _hooks?.onNodeConfig(configMap);
    });
  }


  /// Connect to a stored node.
  Future<void> connectToNode(StoredNode node) async {
    // Concurrency guard: if a connect is already in flight to the
    // same target, return that future instead of stacking up. The
    // [ReconnectSupervisor] relies on this to avoid double-creating
    // `HomeRemoteClient` instances on its own kicks.
    final inflight = _connectingFuture;
    if (inflight != null && _supervisorTargetNodeId == node.id) {
      return inflight;
    }
    _connectingFuture = _connectToNodeImpl(node);
    try {
      await _connectingFuture;
    } finally {
      _connectingFuture = null;
    }
  }

  Future<void> _connectToNodeImpl(StoredNode node) async {
    // Phase 51E — restore family session from secure storage immediately so
    // tab gating / mesh sync / push prefs don't briefly treat a family
    // member as the owner before getNodeConfig returns.
    final storedProfileId =
        await _secureStorage.read(
      'node.${node.id}.familyProfileId',
    );
    final storedOwnerFlag =
        await _secureStorage.read(
      'node.${node.id}.isOwnerProfile',
    );
    var storedPairedId =
        await _secureStorage.read(
      'node.${node.id}.pairedFamilyProfileId',
    );
    // Migrate older installs: if we still have a non-owner session id and
    // never wrote pairing intent, treat that as the immutable intent.
    if ((storedPairedId == null || storedPairedId.isEmpty) &&
        storedProfileId != null &&
        storedProfileId.isNotEmpty &&
        storedProfileId != 'owner') {
      storedPairedId = storedProfileId;
      unawaited(_persistPairedFamilyProfileId(node.id, storedProfileId));
    }
    final intentForRestore = (storedPairedId != null &&
            storedPairedId.isNotEmpty &&
            storedPairedId != 'owner')
        ? storedPairedId
        : storedProfileId;
    final restoredIsOwner = _resolveIsOwnerProfile(
      storedOwnerFlag,
      intentForRestore,
    );
    state = state.copyWith(
      activeNode: node,
      ownerId: node.ownerId.isNotEmpty ? node.ownerId : state.ownerId,
      connectionState: NodeConnectionState.connecting,
      reconnectAttempt: 0,
      lastConnectAttemptAt: DateTime.now(),
      // Restore stored profile id (do NOT clearFamilyProfileId — that wiped
      // the value and defaulted myProfileId to "owner", flipping family bubbles).
      // Prefer pairing intent when session id was corrupted to owner.
      familyProfileId: intentForRestore,
      clearFamilyProfileId:
          intentForRestore == null || intentForRestore.isEmpty,
      pairedFamilyProfileId: storedPairedId,
      clearPairedFamilyProfileId:
          storedPairedId == null || storedPairedId.isEmpty,
      isOwnerProfile: restoredIsOwner,
      familyProfiles: const [],
    );

    final sessionToken =
        await _secureStorage.getSessionToken(node.id);
    _log(
      '[_connectToNodeImpl] nodeId=${node.id}, sessionToken=${sessionToken != null ? "present (${sessionToken.length} chars)" : "NULL"}',
    );
    if (sessionToken == null || sessionToken.isEmpty) {
      // No session token in secure storage. The pairing record is
      // still there (the device is still "paired" in the user's
      // mental model) but the credential that authenticates future
      // reconnects is gone. Throw `UnauthorizedException` so the
      // supervisor sees a terminal failure and stops — otherwise
      // a normal return would look like "success" to the
      // supervisor and it would stop with the error state cleared.
      state = state.copyWith(
        connectionState: NodeConnectionState.error,
        errorMessage: 'Session token not found — re-pair required.',
        homeNodeErrorCode: 'unauthorized',
      );
      throw const UnauthorizedException(
        'Session token not found — re-pair required.',
      );
    }

    final resolver = CandidateResolver();
    // Tell the resolver the home's peer ID so the community relay p2p
    // candidate includes it (enables circuit-relay dialing through the
    // community relay even when the user's private relay is down).
    CandidateResolver.setCommunityHomePeerId(node.homePeerId);
    // isOnWifi only caps how many P2P dials we attempt; order is always
    // LAN → public → P2P → relay.
    final isOnWifi = _connectivityObserver?.isOnWifi ?? false;
    _log('[_connectToNodeImpl] isOnWifi=$isOnWifi');
    List<HomeRemoteCandidate> resolveNow() {
      return resolver.resolve(
        node,
        sessionToken: sessionToken,
        isOnWifi: _connectivityObserver?.isOnWifi ?? false,
      );
    }

    final candidates = resolveNow();
    _log(
      '[_connectToNodeImpl] candidates: ${candidates.map((c) => "${c.name}(${c.url})").toList()}',
    );
    if (candidates.isEmpty) {
      // No transport candidates (LAN, public, libp2p, relay). The
      // stored node has no way to reach the home. Do NOT throw
      // UnauthorizedException — that would stop the supervisor
      // permanently. Instead throw a plain Exception so the
      // supervisor retries with backoff.
      state = state.copyWith(
        connectionState: NodeConnectionState.error,
        errorMessage: 'No transport candidates available.',
        homeNodeErrorCode: 'no_candidates',
      );
      throw Exception('No transport candidates available.');
    }

    var preferResumeTransport = _resumeTransportName != null;
    final resumeTransportName = _resumeTransportName;
    _resumeTransportName = null;

    final opts = HomeRemoteClientOptions(
      // Re-resolve on each reconnect (LAN/P2P first, then relay).
      resolveCandidates: () async {
        final resolved = resolveNow();
        if (!preferResumeTransport || resumeTransportName == null) {
          return resolved;
        }
        preferResumeTransport = false;
        final preferredIndex = resolved.indexWhere(
          (c) => c.name == resumeTransportName,
        );
        if (preferredIndex <= 0) return resolved;
        return [
          resolved[preferredIndex],
          ...resolved.take(preferredIndex),
          ...resolved.skip(preferredIndex + 1),
        ];
      },
      createTransport: (c) => _createTransportForCandidate(c),
      onHomeOnlineChange: (online) {
        state = state.copyWith(
            connectionState: online
                ? NodeConnectionState.connected
                : NodeConnectionState.disconnected,
        );
      },
      onActiveTransportChange: (candidate) {
        state = state.copyWith(activeTransport: candidate?.name);
      },
      onReconnect: () {
        // Resync data after reconnection.
        _syncAllData();
      },
    );
    _client = HomeRemoteClient(opts);
    _pushEventsClient = null;

    try {
      await _client!.ensureConnected();
      _session = HomeRpcSession(_client!);

      // Share UPnP address with home node if we have one.
      await _shareUpnpAddrWithHome();

      await _localDb.updateNodeLastConnected(node.id);
      await _secureStorage.saveActiveNodeId(node.id);

      state = state.copyWith(
        activeNode: node.copyWith(lastConnectedAt: DateTime.now()),
        connectionState: NodeConnectionState.connected,
        ownerId: node.ownerId,
        clearErrorMessage: true,
      );

      // Sync bootstrap peers from the home node so the fallback candidate
      // list stays current with whatever relays/libp2p servers the home
      // is currently connected to.
      try {
        final status = await _session!.getConnectionStatus();
        final peers = (status['bootstrapPeers'] as List<dynamic>?)?.cast<String>();
        if (peers != null && peers.isNotEmpty) {
          final nodeWithBootstrap = node.copyWith(bootstrapPeers: peers);
          await _localDb.upsertNode(nodeWithBootstrap.toJson());
          state = state.copyWith(
            activeNode: nodeWithBootstrap,
            pairedNodes: state.pairedNodes
                .map((n) => n.id == node.id ? nodeWithBootstrap : n)
                .toList(),
          );
        }
      } catch (e) {
        _log('Failed to sync bootstrap peers: $e');
      }

      // Trigger full data sync.
      _syncAllData();

      // Phase 31I — register alert push token with home (APNs / FCM).
      // Best-effort; skipped when OS push is unconfigured on device.
      unawaited(registerPushToken());
    } catch (e) {
      // Only delete the session token when the home node explicitly
      // rejected the auth — a typed `UnauthorizedException` from the
      // RPC layer. Any other error (network drop, timeout, transient
      // relay failure) keeps the token intact so a later retry can
      // succeed. This replaces the previous substring-match
      // (`msg.contains('auth') || msg.contains('token') || ...`)
      // which would destroy the token on benign transport errors
      // that happened to mention those substrings.
      if (e is UnauthorizedException) {
        await _secureStorage.deleteSessionToken(node.id);
        state = state.copyWith(
          connectionState: NodeConnectionState.error,
          errorMessage: 'Session expired. Re-pair required.',
          homeNodeErrorCode: 'unauthorized',
        );
        await disconnect();
        return;
      }
      state = state.copyWith(
        connectionState: NodeConnectionState.error,
        errorMessage: e.toString(),
      );
      _log('[_connectToNodeImpl] connection FAILED: $e');
      await disconnect();
    }
  }

  /// Disconnect from the active node.
  Future<void> disconnect() async {
    _client?.dispose();
    _client = null;
    _pushEventsClient = null;
    _session = null;
    _connectingFuture = null;
    // Product rows are dropped by the product layer (transient feed/content
    // inbox notifications only — media caches survive reconnects).
    _hooks?.onDisconnected();
    // Keep media cache across reconnects. Full wipe only when switching to a
    // different home (paths collide). Unpair clears vault for that homePeerId
    // only so re-pair of the same home can reuse disk cache.
    state = state.copyWith(
      connectionState: NodeConnectionState.disconnected,
      activeTransport: null,
    );
  }

  /// Pause the home WebSocket while the app is backgrounded/killed so the
  /// home node's skip-if-online gate can deliver FCM/APNs. Keeps pairing
  /// + supervisor target; [kickReconnect] on resume re-dials.
  Future<void> pauseForBackground() async {
    if (_client == null &&
        state.connectionState != NodeConnectionState.connected &&
        state.connectionState != NodeConnectionState.connecting) {
      return;
    }
    final nodeId = state.activeNode?.id;
    if (nodeId != null) {
      _supervisorTargetNodeId = nodeId;
    }
    if (state.connectionState == NodeConnectionState.connected &&
        state.activeTransport != null) {
      _resumeTransportName = state.activeTransport;
    }
    _log('[pauseForBackground] dropping thin-client WS for push delivery');
    _supervisor?.stop();
    await disconnect();
  }

  /// Reset node state and force a fresh reconnect.
  /// Clears activeNode so loadPairedNodes will re-run auto-connect.
  /// Use this when the stored state is corrupted and you need to
  /// force the supervisor to retry without any cached state.
  Future<void> resetNodeState() async {
    _log('[resetNodeState] clearing state and restarting supervisor');
    await disconnect();
    _supervisor?.stop();
    _supervisor = null;
    _supervisorTargetNodeId = null;
    // If there is an active node, restart the supervisor so
    // kickReconnect / auto-reconnect will work.
    final activeNodeId = await _secureStorage.getActiveNodeId();
    if (activeNodeId != null) {
      final node =
          state.pairedNodes.where((n) => n.id == activeNodeId).firstOrNull;
      if (node != null) {
        _startSupervisorFor(node.id);
        _log('[resetNodeState] supervisor restarted for $activeNodeId');
      }
    }
    state = state.copyWith(
      homeNodeErrorCode: null,
      errorMessage: null,
      reconnectAttempt: 0,
    );
  }

  /// Switch to a different paired node.
  Future<void> switchToNode(String nodeId) async {
    final node =
        state.pairedNodes.where((n) => n.id == nodeId).firstOrNull;
    if (node == null) return;
    await disconnect();
    // Avoid serving the previous home's vault/media under the same paths.
    await _hooks?.onNodeSwitched();
    await connectToNode(node);
    // Retarget the supervisor to the new node. If the prior
    // supervisor was for a different node, stop it and start
    // fresh; if it was already for this node (rapid switch
    // toggling), leave it alone.
    if (_supervisorTargetNodeId != nodeId) {
      _startSupervisorFor(nodeId);
    }
  }

  /// Update the manual direct home address (`host:port` / Tailscale / VPN).
  ///
  /// Persists [publicHost]/[publicPort] and re-dials the active node so the
  /// new candidate is tried immediately (Phase 68-C1c).
  Future<void> updatePublicAccess(String nodeId, String host, int port) async {
    final rows = await _localDb.listNodes();
    final node = rows.where((r) => r['id'] == nodeId).firstOrNull;
    if (node == null) return;

    final trimmedHost = host.trim();
    final updated = {
      ...node,
      'public_host': trimmedHost.isEmpty ? null : trimmedHost,
      'public_port': port,
    };
    await _localDb.upsertNode(updated);

    final stored = StoredNode.fromJson(updated);
    final isActive = state.activeNode?.id == nodeId;
    state = state.copyWith(
      activeNode: isActive ? stored : state.activeNode,
      pairedNodes: state.pairedNodes.map((n) {
        return n.id == nodeId ? stored : n;
      }).toList(),
    );
    if (isActive) {
      await forceReconnect();
    }
  }

  /// Remove a paired node. This is the only path that clears the
  /// pairing record from local storage — there is no auto-unpair.
  ///
  /// Clears session secrets, SQLite cache (threads/messages/contacts/rooms),
  /// and in-memory chat/contact/terminal state for [nodeId].
  Future<void> unpairNode(String nodeId) async {
    // If the supervisor was targeting this node, stop it before we
    // tear down state — otherwise it would keep firing with a
    // deleted node id.
    if (_supervisorTargetNodeId == nodeId) {
      _supervisor?.stop();
      _supervisor = null;
      _supervisorTargetNodeId = null;
    }
    await disconnect();
    await _secureStorage.clearNodeSession(nodeId);
    if (await _secureStorage.getActiveNodeId() == nodeId) {
      await _secureStorage.saveActiveNodeId('');
    }
    await _localDb.deleteNode(nodeId);

    // Drop in-memory UI state so chats don't linger after unpair.
    _hooks?.onNodeForgotten(nodeId);

    final remaining = state.pairedNodes.where((n) => n.id != nodeId).toList();
    state = state.copyWith(
      clearActiveNode: true,
      pairedNodes: remaining,
      clearOwnerId: true,
      clearFamilyProfileId: true,
      clearPairedFamilyProfileId: true,
      isOwnerProfile: true,
      familyProfiles: const [],
      connectionState: NodeConnectionState.disconnected,
      clearErrorMessage: true,
      clearHomeNodeErrorCode: true,
      clearUpnpAddr: true,
    );
    // Keep disk media cache (vault + library-read + peer thumbs) so re-pairing
    // the same homePeerId does not re-download via relay. Wipe only on
    // switchToNode (different home). LRU prune caps disk use.
    // If this was the last paired node, tear down the connectivity
    // subscription too. (When the user re-pairs, _ensureConnectivityObserver
    // is a no-op because the sub already exists; loadPairedNodes
    // doesn't reach it for an already-initialised notifier.)
    if (remaining.isEmpty) {
      await _connectivitySub?.cancel();
      _connectivitySub = null;
      await _networkTypeSub?.cancel();
      _networkTypeSub = null;
    }
  }

  String _generateNodeId() {
    return DateTime.now().microsecondsSinceEpoch.toRadixString(36);
  }

  /// Phase 31I — obtain APNs/FCM alert token and register with home.
  /// Phase 50 — gated on the in-app push toggle (PushPreferences).
  /// Public so the Me screen can call it when the user re-enables push.
  Future<void> registerPushToken() async {
    if (_client == null) return;
    // Push registration targets a profile on the home node (product plane), so
    // the product layer owns it; this stays as the public entry point the Me
    // screen calls when the user re-enables push.
    await _hooks?.onPushRegistrationNeeded();
  }
}
