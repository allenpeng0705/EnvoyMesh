import 'package:uuid/uuid.dart';

const _uuid = Uuid();

/// Context information for a connection that enables correlation of events
/// across all layers of the protocol stack.
/// 
/// For relay connections, there are two levels:
/// - Outer connection: Direct connection to the relay server
/// - Inner connection: End-to-end connection through the relay to remote peer
class ConnectionContext {
  /// Unique identifier for this connection
  final String connectionId;
  
  /// Remote peer ID (base58)
  final String remotePeerId;
  
  /// Type of connection: 'direct' or 'relay'
  final String connectionType;
  
  /// Timestamp when connection was established
  final DateTime establishedAt;
  
  // Fields for relay connections (inner connections)
  
  /// For relay inner connections: the outer connection ID (to relay server)
  final String? outerConnectionId;
  
  /// Cross-node correlation ID for relay sessions
  final String? sessionId;
  
  /// Relay server peer ID (for relay connections)
  final String? relayPeerId;
  
  /// Yamux stream ID of the HOP stream (for relay inner connections)
  final int? hopStreamId;
  
  // Transport layer reference
  
  /// Underlying transport connection ID (e.g., UDX CID)
  final String? transportConnectionId;

  ConnectionContext({
    String? connectionId,
    required this.remotePeerId,
    required this.connectionType,
    DateTime? establishedAt,
    this.outerConnectionId,
    this.sessionId,
    this.relayPeerId,
    this.hopStreamId,
    this.transportConnectionId,
  })  : connectionId = connectionId ?? _uuid.v4(),
        establishedAt = establishedAt ?? DateTime.now();

  /// Create context for a direct connection
  factory ConnectionContext.direct({
    required String remotePeerId,
    String? transportConnectionId,
  }) {
    return ConnectionContext(
      remotePeerId: remotePeerId,
      connectionType: 'direct',
      transportConnectionId: transportConnectionId,
    );
  }

  /// Create context for an outer relay connection (to relay server)
  factory ConnectionContext.relayOuter({
    required String relayPeerId,
    String? transportConnectionId,
  }) {
    return ConnectionContext(
      remotePeerId: relayPeerId,
      connectionType: 'relay_outer',
      relayPeerId: relayPeerId,
      transportConnectionId: transportConnectionId,
    );
  }

  /// Create context for an inner relay connection (through relay to remote peer)
  factory ConnectionContext.relayInner({
    required String remotePeerId,
    required String outerConnectionId,
    required String relayPeerId,
    String? sessionId,
    int? hopStreamId,
  }) {
    return ConnectionContext(
      remotePeerId: remotePeerId,
      connectionType: 'relay_inner',
      outerConnectionId: outerConnectionId,
      sessionId: sessionId,
      relayPeerId: relayPeerId,
      hopStreamId: hopStreamId,
    );
  }

  /// Convert to JSON for transmission/storage
  Map<String, dynamic> toJson() => {
        'connectionId': connectionId,
        'remotePeerId': remotePeerId,
        'connectionType': connectionType,
        'establishedAt': establishedAt.toIso8601String(),
        if (outerConnectionId != null) 'outerConnectionId': outerConnectionId,
        if (sessionId != null) 'sessionId': sessionId,
        if (relayPeerId != null) 'relayPeerId': relayPeerId,
        if (hopStreamId != null) 'hopStreamId': hopStreamId,
        if (transportConnectionId != null)
          'transportConnectionId': transportConnectionId,
      };

  @override
  String toString() {
    final buffer = StringBuffer('ConnectionContext(');
    buffer.write('id=$connectionId, ');
    buffer.write('type=$connectionType, ');
    buffer.write('remote=$remotePeerId');
    if (outerConnectionId != null) {
      buffer.write(', outer=$outerConnectionId');
    }
    if (sessionId != null) {
      buffer.write(', session=$sessionId');
    }
    buffer.write(')');
    return buffer.toString();
  }
}

