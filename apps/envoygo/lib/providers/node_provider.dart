import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/stored_node.dart';
import '../services/candidate_resolver.dart';
import '../services/home_remote_client.dart';
import '../services/node_service_client.dart';
import '../services/pairing_service.dart';
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
    secureStorage: SecureStorage(),
    localDb: LocalDatabase(),
  );
});

class NodeNotifier extends StateNotifier<NodeState> {
  final SecureStorage _secureStorage;
  final LocalDatabase _localDb;

  HomeRemoteClient? _client;
  NodeServiceClient? _nodeService;
  PairingService? _pairingService;

  NodeNotifier({
    required SecureStorage secureStorage,
    required LocalDatabase localDb,
  })  : _secureStorage = secureStorage,
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

    final opts = HomeRemoteClientOptions(
      resolveCandidates: () async => candidates,
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
    final nodeId = _generateNodeId();
    await _secureStorage.saveSessionToken(nodeId, result.sessionToken);
    await _secureStorage.saveActiveNodeId(nodeId);

    // Store node info in local DB.
    final node = StoredNode(
      id: nodeId,
      name: data.name ?? 'Home Node',
      ownerId: result.ownerId,
      homePeerId: data.peerId,
      lanIp: data.lanIp,
      wsPort: data.wsPort,
      relayWsUrl: data.relayWsUrl,
      pairedAt: DateTime.now(),
      lastConnectedAt: DateTime.now(),
    );
    await _localDb.upsertNode(node.toJson());
    await _localDb.updateNodeLastConnected(nodeId);

    state = state.copyWith(
      activeNode: node,
      pairedNodes: [...state.pairedNodes, node],
      connectionState: NodeConnectionState.connected,
      ownerId: result.ownerId,
    );

    return result;
  }

  /// Connect to a stored node.
  Future<void> connectToNode(StoredNode node) async {
    state = state.copyWith(
        connectionState: NodeConnectionState.connecting);

    final sessionToken =
        await _secureStorage.getSessionToken(node.id);
    if (sessionToken == null) {
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
      onHomeOnlineChange: (online) {
        if (!online) {
          state = state.copyWith(
              connectionState: NodeConnectionState.disconnected);
        }
      },
      onActiveTransportChange: (candidate) {
        state = state.copyWith(activeTransport: candidate?.name);
      },
    );
    _client = HomeRemoteClient(opts);

    try {
      await _client!.ensureConnected();
      _nodeService = NodeServiceClient(_client!);

      // Authenticate with session token.
      // The token is sent as a query param or via an 'authenticate' RPC.
      // For now, the token is included in candidate URLs.
      await _localDb.updateNodeLastConnected(node.id);
      await _secureStorage.saveActiveNodeId(node.id);

      state = state.copyWith(
        activeNode: node.copyWith(lastConnectedAt: DateTime.now()),
        connectionState: NodeConnectionState.connected,
        ownerId: node.ownerId,
      );
    } catch (e) {
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
