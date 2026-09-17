import 'dart:async';

import 'package:dart_libp2p/core/peer/addr_info.dart';

import '../peer/peer_id.dart';

/// QueryEventType indicates the query event's type.
enum QueryEventType {
  /// Sending a query to a peer.
  sendingQuery,
  
  /// Got a response from a peer.
  peerResponse,
  
  /// Found a "closest" peer (not currently used).
  finalPeer,
  
  /// Got an error when querying.
  queryError,
  
  /// Found a provider.
  provider,
  
  /// Found a value.
  value,
  
  /// Adding a peer to the query.
  addingPeer,
  
  /// Dialing a peer.
  dialingPeer,
}

/// Number of events to buffer.
const int queryEventBufferSize = 16;

/// QueryEvent is emitted for every notable event that happens during a DHT query.
class QueryEvent {
  /// The peer ID associated with this event.
  final PeerId id;
  
  /// The type of this event.
  final QueryEventType type;
  
  /// Responses received, if any.
  final List<AddrInfo>? responses;
  
  /// Extra information about this event.
  final String? extra;

  /// Creates a new query event.
  QueryEvent({
    required this.id,
    required this.type,
    this.responses,
    this.extra,
  });
  
  /// Creates a JSON representation of this event.
  Map<String, dynamic> toJson() {
    return {
      'ID': id.toString(),
      'Type': type.index,
      'Responses': responses,
      'Extra': extra,
    };
  }
  
  /// Creates a QueryEvent from a JSON representation.
  static QueryEvent fromJson(Map<String, dynamic> json) {
    return QueryEvent(
      id: PeerId.fromString(json['ID']),
      type: QueryEventType.values[json['Type']],
      responses: json['Responses'] != null 
          ? (json['Responses'] as List).map((e) => e as AddrInfo).toList() 
          : null,
      extra: json['Extra'],
    );
  }
}

/// A class to manage query event subscriptions.
class QueryEventManager {
  /// The stream controller for query events.
  final StreamController<QueryEvent> _controller;
  
  /// Creates a new query event manager.
  QueryEventManager() : _controller = StreamController<QueryEvent>.broadcast();
  
  /// Gets the stream of query events.
  Stream<QueryEvent> get events => _controller.stream;
  
  /// Publishes a query event.
  void publishEvent(QueryEvent event) {
    if (!_controller.isClosed) {
      _controller.add(event);
    }
  }
  
  /// Closes the event manager.
  void close() {
    if (!_controller.isClosed) {
      _controller.close();
    }
  }
  
  /// Returns true if there are active listeners for query events.
  bool get hasListeners => _controller.hasListener;
}

/// A registry for query event managers.
class QueryEventRegistry {
  static final Map<String, QueryEventManager> _managers = {};
  
  /// Registers for query events with the given ID.
  static Stream<QueryEvent> registerForQueryEvents(String id) {
    final manager = _managers.putIfAbsent(id, () => QueryEventManager());
    return manager.events;
  }
  
  /// Publishes a query event with the given ID.
  static void publishQueryEvent(String id, QueryEvent event) {
    final manager = _managers[id];
    if (manager != null) {
      manager.publishEvent(event);
    }
  }
  
  /// Returns true if there are active listeners for the given ID.
  static bool subscribesToQueryEvents(String id) {
    final manager = _managers[id];
    return manager != null && manager.hasListeners;
  }
  
  /// Unregisters the query event manager with the given ID.
  static void unregister(String id) {
    final manager = _managers.remove(id);
    if (manager != null) {
      manager.close();
    }
  }
}