import 'dart:async';
import 'package:dart_libp2p/dart_libp2p.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/stored_node.dart';
import '../services/web_socket_like.dart';
import 'chat_provider.dart';
import 'contact_provider.dart';
import 'terminal_provider.dart';
import '../services/candidate_resolver.dart';
import '../services/home_remote_client.dart';
import '../services/node_service_client.dart';
import '../services/pairing_service.dart';
import '../services/client_proxy_transport.dart';
import '../services/platform_web_socket.dart';
import '../services/exceptions.dart';
import '../services/reconnect_supervisor.dart';
import '../services/connectivity_observer.dart';
import '../services/libp2p_node.dart';
import '../storage/local_database.dart';
import '../storage/secure_storage.dart';

/// Connection state for the active home node.
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
  });

  NodeState copyWith({
    StoredNode? activeNode,
    List<StoredNode>? pairedNodes,
    NodeConnectionState? connectionState,
    String? activeTransport,
    String? errorMessage,
    bool clearErrorMessage = false,
    String? ownerId,
    DateTime? lastConnectAttemptAt,
    int? reconnectAttempt,
    String? homeNodeErrorCode,
    bool clearHomeNodeErrorCode = false,
  }) {
    return NodeState(
      activeNode: activeNode ?? this.activeNode,
      pairedNodes: pairedNodes ?? this.pairedNodes,
      connectionState: connectionState ?? this.connectionState,
      activeTransport: activeTransport ?? this.activeTransport,
      errorMessage: clearErrorMessage ? null : (errorMessage ?? this.errorMessage),
      ownerId: ownerId ?? this.ownerId,
      lastConnectAttemptAt: lastConnectAttemptAt ?? this.lastConnectAttemptAt,
      reconnectAttempt: reconnectAttempt ?? this.reconnectAttempt,
      homeNodeErrorCode: clearHomeNodeErrorCode
          ? null
          : (homeNodeErrorCode ?? this.homeNodeErrorCode),
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
  NodeServiceClient? _nodeService;
  PairingService? _pairingService;

  /// Libp2p node for direct P2P connectivity when relay is unavailable.
  Libp2pNode? _libp2pNode;

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

  /// Load all paired nodes from local storage on app start.
  Future<void> loadPairedNodes() async {
    await _localDb.initialize();
    final rows = await _localDb.listNodes();
    final nodes = rows.map((r) => StoredNode.fromJson(r)).toList();
    state = state.copyWith(pairedNodes: nodes);

    // Start the connectivity observer (one-shot for the app's
    // lifetime). It kicks the supervisor whenever the device
    // transitions from offline to online.
    await _ensureConnectivityObserver();

    // Auto-connect to last-used node.
    final activeNodeId = await _secureStorage.getActiveNodeId();
    if (activeNodeId != null) {
      final node = nodes.where((n) => n.id == activeNodeId).firstOrNull;
      if (node != null) {
        await connectToNode(node);
        // Start a supervisor for this node even if the first
        // attempt succeeded — the user may close the home node and
        // reopen it later in the same session, and the supervisor
        // is the path that will reconnect. (The supervisor is a
        // no-op while the inner client is connected; see
        // [kickReconnect].)
        _startSupervisorFor(node.id);
      }
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
  }

  /// Construct a fresh [ReconnectSupervisor] targeting the given
  /// nodeId. Replaces any prior supervisor. The supervisor
  /// immediately schedules its first attempt; the inner
  /// `connectToNode` de-duplicates concurrent calls via
  /// [_connectingFuture] so a supervisor kick does not race the
  /// initial connect.
  void _startSupervisorFor(String nodeId) {
    _supervisor?.stop();
    _supervisorTargetNodeId = nodeId;
    _supervisor = ReconnectSupervisor(
      currentTargetNodeIdProvider: () => _supervisorTargetNodeId,
      getTargetNode: () {
        final id = _supervisorTargetNodeId;
        if (id == null) return null;
        return state.pairedNodes
            .where((n) => n.id == id)
            .firstOrNull;
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
        state = state.copyWith(
          homeNodeErrorCode: code,
          errorMessage: message,
        );
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
  /// No-op when already connected.
  void kickReconnect() {
    if (state.connectionState == NodeConnectionState.connected) return;
    final supervisor = _supervisor;
    if (supervisor == null || supervisor.isStopped) {
      // Supervisor was stopped after initial connect, or never started.
      // Restart it to attempt reconnection.
      final targetNodeId = _supervisorTargetNodeId;
      if (targetNodeId != null) {
        _startSupervisorFor(targetNodeId);
      }
      return;
    }
    supervisor.kick();
  }

  @override
  void dispose() {
    _disposed = true;
    _supervisor?.stop();
    _supervisor = null;
    _supervisorTargetNodeId = null;
    _connectivitySub?.cancel();
    _connectivitySub = null;
    _connectivityObserver?.dispose();
    _connectivityObserver = null;
    _client?.dispose();
    _client = null;
    _nodeService = null;
    _pairingService = null;
    super.dispose();
  }

  /// Pair with a home node using pairing data.
  Future<PairResult> pairWithNode(
    PairingData data,
    String deviceName,
    List<HomeRemoteCandidate> candidates,
  ) async {
    state = state.copyWith(
        connectionState: NodeConnectionState.connecting);

    // Ensure the local database is initialized before we write to it.
    // On a fresh install, loadPairedNodes may not have completed yet.
    await _localDb.initialize();

    final opts = HomeRemoteClientOptions(
      resolveCandidates: () async => candidates,
      createTransport: (c) => _createTransportForCandidate(c),
    );
    _client = HomeRemoteClient(opts);
    PairResult result;
    try {
      await _client!.ensureConnected();
      _nodeService = NodeServiceClient(_client!);
      _pairingService = PairingService(_nodeService!);

      result = await _pairingService!.pair(data, deviceName);
    } catch (e) {
      _client?.dispose();
      _client = null;
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
    } catch (e) {
      debugPrint('Failed to save session token: $e');
      state = state.copyWith(
        connectionState: NodeConnectionState.error,
        errorMessage: 'Pairing succeeded but failed to persist — '
            'the node may be lost after app restart.',
      );
    }

    // Store node info in local DB.
    final node = StoredNode(
      id: nodeId,
      name: existingNode?.name ?? data.agentName ?? 'Home Node',
      ownerId: result.ownerId,
      homePeerId: data.homeNodePeerId ?? '',
      lanIp: data.lanWsUrl,
      wsPort: 3030,
      relayWsUrl: data.relayWsUrl,
      pairedAt: existingNode?.pairedAt ?? DateTime.now(),
      lastConnectedAt: DateTime.now(),
      publicHost: existingNode?.publicHost,
      publicPort: existingNode?.publicPort ?? 3030,
      bootstrapPeers: data.bootstrapPeers ?? const [],
    );
    await _localDb.upsertNode(node.toJson());
    await _localDb.updateNodeLastConnected(nodeId);

    // Update paired nodes list — replace existing or add new.
    final updatedNodes = existingNode != null
        ? state.pairedNodes
            .map((n) => n.homePeerId == data.homeNodePeerId ? node : n)
            .toList()
        : [...state.pairedNodes, node];
    state = state.copyWith(
      pairedNodes: updatedNodes,
      ownerId: result.ownerId,
    );

    // Dispose the pairing connection (used QR pairing token, not session token).
    _client?.dispose();
    _client = null;
    _nodeService = null;
    _pairingService = null;

    // Reconnect with the new session token so all RPCs are authenticated.
    await connectToNode(node);

    // Fetch bootstrap peers from the home node for multi-relay fallback.
    // This is the last step of pairing so the StoredNode is complete.
    try {
      final payload = await _nodeService!.getPairingPayload();
      final bootstrapList = (payload['bootstrapPeers'] as List<dynamic>?)
          ?.cast<String>();
      if (bootstrapList != null && bootstrapList.isNotEmpty) {
        final nodeWithBootstrap = node.copyWith(bootstrapPeers: bootstrapList);
        await _localDb.upsertNode(nodeWithBootstrap.toJson());
        final updatedNodes = state.pairedNodes
            .map((n) =>
                n.homePeerId == data.homeNodePeerId ? nodeWithBootstrap : n)
            .toList();
        state = state.copyWith(pairedNodes: updatedNodes);
      }
    } catch (e) {
      debugPrint('Failed to fetch bootstrap peers: $e');
    }

    // Start the reconnect supervisor for this node. If the
    // initial connect failed, the supervisor will keep retrying
    // (with backoff) until either the home comes back online or
    // the user unpairs.
    _startSupervisorFor(node.id);

    return result;
  }

  /// Sync all data from the home node after a successful connection.
  void _syncAllData() {
    final chatNotifier = _ref.read(chatProvider.notifier);
    final contactNotifier = _ref.read(contactProvider.notifier);
    final terminalNotifier = _ref.read(terminalProvider.notifier);
    final nodeService = _nodeService;
    final client = _client;
    if (client == null || nodeService == null) return;

    // Subscribe to push events from the home node.
    _subscribeToPushEvents(client, chatNotifier, contactNotifier,
        terminalNotifier);

    // Sync contacts directly using _nodeService.
    _syncBondsDirect(nodeService, contactNotifier).then((_) {
      final node = state.activeNode;
      if (node != null) {
        chatNotifier.loadThreads(node.id);
      }
      // Create threads for all bonded contacts, then refresh display names.
      _ref.read(chatProvider.notifier).createContactThreads();
      _ref.read(chatProvider.notifier).refreshThreadDisplayNames();
    });

    // Rooms and terminals sync directly using _nodeService.
    _syncRoomsDirect(nodeService, chatNotifier);
    _syncTerminalsDirect(nodeService, chatNotifier, terminalNotifier);
    // Sync all terminal sessions (running and stopped) as chat threads.
    chatNotifier.syncTerminals();
    _syncInboxDirect(nodeService, chatNotifier);

    // EnvoyAI (OpenClaw) — always create, built-in.
    chatNotifier.onBridgeStatus({
      'enabled': true,
      'agentName': 'EnvoyAI',
      'agentType': 'envoyai',
    });

    // Ext Agent (HomeClaw / others) — always create the thread, then
    // update its status from the bridge. Shows "Bridge Online" or
    // "Bridge Offline" matching the Social app behaviour.
    chatNotifier.onBridgeStatus({
      'enabled': false,
      'agentName': 'Ext Agent',
      'agentType': 'external',
    });
    nodeService.getBridgeStatus().then((status) {
      chatNotifier.onBridgeStatus(status);
    }).catchError((e) {
      debugPrint('getBridgeStatus failed: $e');
    });
  }

  Future<void> _syncBondsDirect(
      NodeServiceClient nodeService, ContactNotifier contactNotifier) async {
    final nodeState = state;
    if (nodeState.activeNode == null) return;
    try {
      final bonds = await nodeService.getBonds();
      // Filter out self-identity (shared-identity devices are bonds to self).
      // Same rule as `ContactNotifier.syncBonds`; both call sites
      // go through the shared helper to keep the behaviour identical.
      final filtered = filterSelfBonds(bonds, nodeState.ownerId);
      final localDb = LocalDatabase();
      await localDb.upsertContacts(
        nodeState.activeNode!.id,
        filtered.map((c) => c.toJson()).toList(),
      );
      // Update contact state directly (avoid nodeServiceProvider null cache).
      contactNotifier.setBonds(filtered);
    } catch (e) {
      debugPrint('_syncBondsDirect failed: $e');
    }
  }

  void _syncRoomsDirect(
      NodeServiceClient nodeService, ChatNotifier chatNotifier) {
    nodeService.listChatRooms().then((rooms) {
      final nodeState = state;
      if (nodeState.activeNode == null) return;
      final localDb = LocalDatabase();
      localDb.upsertRooms(
        nodeState.activeNode!.id,
        rooms.map((r) => r.toJson()).toList(),
      );
      for (final room in rooms) {
        chatNotifier.onRoomMessage({
          'roomId': room.id,
          'roomName': room.name,
          'senderOwnerId': '',
          'text': room.lastMessageText ?? '',
          'createdAt': room.lastMessageAt?.toIso8601String(),
        });
      }
    }).catchError((e) {
      debugPrint('_syncRoomsDirect failed: $e');
    });
  }

  void _syncTerminalsDirect(NodeServiceClient nodeService,
      ChatNotifier chatNotifier, TerminalNotifier terminalNotifier) {
    nodeService.listTerminalSessions().then((sessions) {
      // Update terminal state with all sessions (running and stopped).
      terminalNotifier.setSessions(sessions);
      // Only sync running terminals to chat as messages.
      final running = sessions
          .where((s) => s.runningProcess != null && s.runningProcess!.isNotEmpty);
      for (final session in running) {
        chatNotifier.onChatMessage({
          'senderOwnerId': 'terminal',
          'text': '${session.runningProcess ?? 'shell'} — ${session.cwd ?? '~'}',
          'messageId': 'term_${session.id}',
          'createdAt': session.createdAt?.toIso8601String(),
          'terminalId': session.id,
          'terminalName': session.name,
        });
      }
    }).catchError((e) {
      debugPrint('_syncTerminalsDirect failed: $e');
    });
  }

  void _syncInboxDirect(
      NodeServiceClient nodeService, ChatNotifier chatNotifier) {
    nodeService.listPendingSocialIntroProposals().then((result) {
      for (final item in result) {
        final from = item['fromOwnerId'] as String?;
        final displayName = item['fromDisplayName'] as String?;
        if (from != null) {
          chatNotifier.onChatMessage({
            'senderOwnerId': from,
            'senderDisplayName': displayName ?? from,
            'text': 'Wants to connect',
            'messageId': 'intro_${from}',
            'createdAt': DateTime.now().toIso8601String(),
          });
        }
      }
    }).catchError((e) {
      debugPrint('_syncInboxDirect failed: $e');
    });
  }

  /// Sync pending social intro proposals (Inbox).
  void _syncInbox(ChatNotifier chatNotifier) {
    final nodeService = _nodeService;
    if (nodeService == null) return;
    nodeService.listPendingSocialIntroProposals().then((result) {
      // Create threads for pending intros.
      if (result is List) {
        for (final item in result) {
          if (item is Map<String, dynamic>) {
            final from = item['fromOwnerId'] as String?;
            final displayName = item['fromDisplayName'] as String?;
            if (from != null) {
              chatNotifier.onChatMessage({
                'senderOwnerId': from,
                'senderDisplayName': displayName ?? from,
                'text': 'Wants to connect',
                'messageId': 'intro_${from}',
                'createdAt': DateTime.now().toIso8601String(),
              });
            }
          }
        }
      }
    }).catchError((_) {});
  }

  /// Create the appropriate transport for a candidate URL scheme.
  ///
  /// Relay candidates use `ClientProxyTransport.connect` which speaks the
  /// proxy handshake through the relay WebSocket. All other candidates
  /// use a plain WebSocket.
  Future<WebSocketLike> _createTransportForCandidate(
      HomeRemoteCandidate candidate) async {
    // Relay proxy transport: URLs containing ?target=<homePeerId> use the
    // ClientProxyTransport which handles the proxy handshake protocol.
    if (candidate.homePeerId != null &&
        candidate.homePeerId!.isNotEmpty &&
        candidate.url.contains('?target=')) {
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
      try {
        return await _createLibp2pTransport(candidate);
      } catch (e) {
        // Circuit relay failed (sync error from connect(), or DHT fallback
        // exhausted). Return a failed Future so the caller records this
        // failure and moves to the next candidate.
        return Future.error(e);
      }
    }
    // Standard WebSocket.
    return PlatformWebSocket.connect(candidate.url);
  }

  /// Create a libp2p transport for circuit relay dialing.
  Future<WebSocketLike> _createLibp2pTransport(
      HomeRemoteCandidate candidate) async {
    // DHT bootstrap peers — all 4 presets from the home node's wan-default
    // profile so EnvoyGo can query the same DHT network the home node
    // uses for address registration.
    //
    // - cn-relay (47.93.11.212): EnvoyMesh community relay — circuit relay
    //   transport hop AND DHT bootstrap. Also the only relay EnvoyGo can use
    //   for circuit relay when the home node's user relay is down.
    // - public-libp2p, public-libp2p-am6, public-libp2p-am7: IPFS public DHT
    //   bootstrap servers. The home node registers its address here via DHT
    //   provide. EnvoyGo queries these to find the home node's direct
    //   addresses when circuit relay is unavailable.
    const dhtBootstrapPeers = <String>[
      // EnvoyMesh community relay (circuit relay hop + DHT bootstrap)
      '/ip4/47.93.11.212/tcp/4001/p2p/12D3KooWLNR4WYWHBswe8ux5zWsy6cuGywnYPJbdbaAbbpmJMjbo',
      // IPFS public DHT bootstrap servers (same network the home node uses)
      '/dnsaddr/bootstrap.libp2p.io/p2p/QmNnooDu7bfjPFoTZYxMNLWUQJyrVwtbZg5gBMjTezGAJN',
      '/dnsaddr/am6.bootstrap.libp2p.io/p2p/QmbLHAnMoJPWSCR5Zhtx6BHJX9KiKNN6LccNBoMmrjUqFq',
      '/dnsaddr/am7.bootstrap.libp2p.io/p2p/QmcZf59bWwK5XFi76CZX8cbJ4BhTzzA7W8R4Hk6x4pJ8Yf',
    ];

    // Start libp2p node if not already started.
    _libp2pNode ??= Libp2pNode();
    if (!_libp2pNode!.isStarted) {
      await _libp2pNode!.start(
        // DHT bootstrap: connect to all 4 peers to join the DHT network.
        // Also used as circuit relay hop when dialing /p2p-circuit/.
        bootstrapAddrs: dhtBootstrapPeers,
      );
    }

    const clientProxyProtocol = '/envoymesh/client-proxy/0.1.0';

    // Try circuit relay dial first: /p2p/<relay>/p2p-circuit/p2p/<home>
    try {
      final transport = await _libp2pNode!.dial(
        peerMultiaddr: candidate.url,
        protocolId: clientProxyProtocol,
      );
      await transport.performHandshake(candidate.sessionToken ?? '');
      return transport;
    } catch (_) {
      // Circuit relay failed (community relay unreachable).
      // Fall back to DHT: query for the home node's direct addresses
      // and dial those directly.
    }

    // DHT fallback: find peer's direct addresses via DHT.
    // findPeer() returns addresses that already include /p2p/<peerId>,
    // so use them directly without appending.
    final homePeerId = PeerId.fromString(candidate.homePeerId!);
    final addrInfo = await _libp2pNode!.findPeer(homePeerId);
    // ignore: dart SDK print, not async-safe
    debugPrint('[DHT] findPeer($homePeerId) => ${addrInfo?.addrs.length ?? 0} addrs');
    if (addrInfo != null && addrInfo.addrs.isNotEmpty) {
      // Try each direct address until one works.
      for (final addr in addrInfo.addrs) {
        try {
          // addr.toString() is already a complete multiaddr like
          // /ip4/192.168.x.x/tcp/54264/p2p/<peerId> — use directly.
          final transport = await _libp2pNode!.dial(
            peerMultiaddr: addr.toString(),
            protocolId: clientProxyProtocol,
          );
          await transport.performHandshake(candidate.sessionToken ?? '');
          return transport;
        } catch (_) {
          // This address failed, try the next one.
        }
      }
    }

    // All paths exhausted.
    throw Exception('homeRemote.connectFailed');
  }

  /// Subscribe to server push events via WebSocket (fallback) and
  /// libp2p GossipSub (primary). Dedup is handled by ChatNotifier's
  /// _seenMessageIds, so events arriving via both paths are only
  /// processed once.
  void _subscribeToPushEvents(
    HomeRemoteClient client,
    ChatNotifier chatNotifier,
    ContactNotifier contactNotifier,
    TerminalNotifier terminalNotifier,
  ) {
    // -- WebSocket push events --
    client.on('chat:message', (data) {
      if (data is Map<String, dynamic>) {
        chatNotifier.onChatMessage(data);
      }
    });
    client.on('chat:room-message', (data) {
      if (data is Map<String, dynamic>) {
        chatNotifier.onRoomMessage(data);
      }
    });
    client.on('bond:established', (_) {
      contactNotifier.onBondEstablished();
    });
    client.on('bond:revoked', (data) {
      if (data is Map<String, dynamic>) {
        contactNotifier
            .onBondRevoked(data['peerOwnerId'] as String? ?? '');
      }
    });
    client.on('bridge:status', (data) {
      if (data is Map<String, dynamic>) {
        chatNotifier.onBridgeStatus(data);
      }
    });
    client.on('agent:activity', (data) {
      if (data is Map<String, dynamic>) {
        chatNotifier.onChatMessage(data);
      }
    });
    client.on('terminal:session-updated', (_) async {
      // Load sessions first, then sync to ensure state is populated.
      await terminalNotifier.loadSessions();
      chatNotifier.syncTerminals();
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
    state = state.copyWith(
      connectionState: NodeConnectionState.connecting,
      reconnectAttempt: 0,
      lastConnectAttemptAt: DateTime.now(),
    );

    final sessionToken =
        await _secureStorage.getSessionToken(node.id);
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
    final isOnWifi = _connectivityObserver?.isOnWifi ?? true;
    final candidates =
        resolver.resolve(node, sessionToken: sessionToken, isOnWifi: isOnWifi);
    if (candidates.isEmpty) {
      // No transport candidates (LAN, public, libp2p, relay). The
      // stored node has no way to reach the home. Same as above:
      // throw so the supervisor halts and the user sees the
      // persistent error state.
      state = state.copyWith(
        connectionState: NodeConnectionState.error,
        errorMessage: 'No transport candidates available.',
        homeNodeErrorCode: 'unauthorized',
      );
      throw const UnauthorizedException(
        'No transport candidates available — re-pair required.',
      );
    }

    final opts = HomeRemoteClientOptions(
      resolveCandidates: () async => candidates,
      createTransport: (c) => _createTransportForCandidate(c),
      onHomeOnlineChange: (online) {
        state = state.copyWith(
            connectionState: online
                ? NodeConnectionState.connected
                : NodeConnectionState.disconnected);
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

    try {
      await _client!.ensureConnected();
      _nodeService = NodeServiceClient(_client!);

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
        final status = await _nodeService!.getConnectionStatus();
        final peers = (status['bootstrapPeers'] as List<dynamic>?)
            ?.cast<String>();
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
        debugPrint('Failed to sync bootstrap peers: $e');
      }

      // Trigger full data sync.
      _syncAllData();
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
      await disconnect();
    }
  }

  /// Disconnect from the active node.
  Future<void> disconnect() async {
    _client?.dispose();
    _client = null;
    _nodeService = null;
    _pairingService = null;
    _connectingFuture = null;
    state = state.copyWith(
      connectionState: NodeConnectionState.disconnected,
      activeTransport: null,
    );
  }

  /// Switch to a different paired node.
  Future<void> switchToNode(String nodeId) async {
    final node =
        state.pairedNodes.where((n) => n.id == nodeId).firstOrNull;
    if (node == null) return;
    await disconnect();
    await connectToNode(node);
    // Retarget the supervisor to the new node. If the prior
    // supervisor was for a different node, stop it and start
    // fresh; if it was already for this node (rapid switch
    // toggling), leave it alone.
    if (_supervisorTargetNodeId != nodeId) {
      _startSupervisorFor(nodeId);
    }
  }

  /// Update the public IP/domain for a paired node.
  Future<void> updatePublicAccess(
      String nodeId, String host, int port) async {
    final rows = await _localDb.listNodes();
    final node = rows
        .where((r) => r['id'] == nodeId)
        .firstOrNull;
    if (node == null) return;

    final updated = {...node, 'public_host': host, 'public_port': port};
    await _localDb.upsertNode(updated);

    final stored = StoredNode.fromJson(updated);
    state = state.copyWith(
      activeNode: state.activeNode?.id == nodeId
          ? stored
          : state.activeNode,
      pairedNodes: state.pairedNodes.map((n) {
        return n.id == nodeId ? stored : n;
      }).toList(),
    );
  }

  /// Remove a paired node. This is the only path that clears the
  /// pairing record from local storage — there is no auto-unpair.
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
    await _secureStorage.deleteSessionToken(nodeId);
    if (await _secureStorage.getActiveNodeId() == nodeId) {
      await _secureStorage.saveActiveNodeId('');
    }
    await _localDb.deleteNode(nodeId);
    final remaining = state.pairedNodes.where((n) => n.id != nodeId).toList();
    state = state.copyWith(
      activeNode: null,
      pairedNodes: remaining,
      ownerId: null,
    );
    // If this was the last paired node, tear down the connectivity
    // subscription too. (When the user re-pairs, _ensureConnectivityObserver
    // is a no-op because the sub already exists; loadPairedNodes
    // doesn't reach it for an already-initialised notifier.)
    if (remaining.isEmpty) {
      await _connectivitySub?.cancel();
      _connectivitySub = null;
    }
  }

  String _generateNodeId() {
    return DateTime.now().microsecondsSinceEpoch.toRadixString(36);
  }
}
