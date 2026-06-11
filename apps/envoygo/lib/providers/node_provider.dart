import 'dart:async';
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

  const NodeState({
    this.activeNode,
    this.pairedNodes = const [],
    this.connectionState = NodeConnectionState.disconnected,
    this.activeTransport,
    this.errorMessage,
    this.ownerId,
  });

  NodeState copyWith({
    StoredNode? activeNode,
    List<StoredNode>? pairedNodes,
    NodeConnectionState? connectionState,
    String? activeTransport,
    String? errorMessage,
    String? ownerId,
  }) {
    return NodeState(
      activeNode: activeNode ?? this.activeNode,
      pairedNodes: pairedNodes ?? this.pairedNodes,
      connectionState: connectionState ?? this.connectionState,
      activeTransport: activeTransport ?? this.activeTransport,
      errorMessage: errorMessage,
      ownerId: ownerId ?? this.ownerId,
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

  NodeNotifier({
    required Ref ref,
    required SecureStorage secureStorage,
    required LocalDatabase localDb,
  })  : _ref = ref,
        _secureStorage = secureStorage,
        _localDb = localDb,
        super(const NodeState());

  HomeRemoteClient? get client => _client;

  /// Load all paired nodes from local storage on app start.
  Future<void> loadPairedNodes() async {
    await _localDb.initialize();
    final rows = await _localDb.listNodes();
    final nodes = rows.map((r) => StoredNode.fromJson(r)).toList();
    state = state.copyWith(pairedNodes: nodes);

    // Auto-connect to last-used node.
    final activeNodeId = await _secureStorage.getActiveNodeId();
    if (activeNodeId != null) {
      final node = nodes.where((n) => n.id == activeNodeId).firstOrNull;
      if (node != null) {
        await connectToNode(node);
      }
    }
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
      final selfOwnerId = nodeState.ownerId;
      final filtered = selfOwnerId != null
          ? bonds
              .where((c) =>
                  c.ownerId != selfOwnerId &&
                  !c.ownerId.startsWith('envoy_device_'))
              .toList()
          : bonds;
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
      // Only sync running terminals (have an active process).
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
  FutureOr<WebSocketLike> _createTransportForCandidate(
      HomeRemoteCandidate candidate) {
    return PlatformWebSocket.connect(candidate.url);
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
    client.on('terminal:session-updated', (_) {
      terminalNotifier.loadSessions();
      chatNotifier.syncTerminals();
    });
  }

  /// Connect to a stored node.
  Future<void> connectToNode(StoredNode node) async {
    state = state.copyWith(
        connectionState: NodeConnectionState.connecting);

    final sessionToken =
        await _secureStorage.getSessionToken(node.id);
    if (sessionToken == null || sessionToken.isEmpty) {
      state = state.copyWith(
        connectionState: NodeConnectionState.error,
        errorMessage: 'Session token not found — re-pair required.',
      );
      return;
    }

    final resolver = CandidateResolver();
    final candidates = resolver.resolve(node, sessionToken: sessionToken);
    if (candidates.isEmpty) {
      state = state.copyWith(
        connectionState: NodeConnectionState.error,
        errorMessage: 'No transport candidates available.',
      );
      return;
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
      );

      // Trigger full data sync.
      _syncAllData();
    } catch (e) {
      final msg = e.toString();
      if (msg.contains('Authentication') ||
          msg.contains('auth') ||
          msg.contains('Unauthorized') ||
          msg.contains('token')) {
        await _secureStorage.deleteSessionToken(node.id);
      }
      state = state.copyWith(
        connectionState: NodeConnectionState.error,
        errorMessage: msg,
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

  /// Remove a paired node.
  Future<void> unpairNode(String nodeId) async {
    await disconnect();
    await _secureStorage.deleteSessionToken(nodeId);
    if (await _secureStorage.getActiveNodeId() == nodeId) {
      await _secureStorage.saveActiveNodeId('');
    }
    await _localDb.deleteNode(nodeId);
    state = state.copyWith(
      activeNode: null,
      pairedNodes:
          state.pairedNodes.where((n) => n.id != nodeId).toList(),
      ownerId: null,
    );
  }

  String _generateNodeId() {
    return DateTime.now().microsecondsSinceEpoch.toRadixString(36);
  }
}
