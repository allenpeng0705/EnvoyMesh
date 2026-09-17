// Copyright (c) 2022 The dart-libp2p Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.



import 'package:dart_libp2p/core/peer/peer_id.dart';

/// Resources manages the resources for the relay service.
class Resources {
  /// The maximum number of concurrent reservations.
  final int maxReservations;

  /// The maximum number of concurrent connections.
  final int maxConnections;

  /// The time-to-live for reservations in seconds.
  final int reservationTtl;

  /// The maximum duration for connections in seconds.
  final int connectionDuration;

  /// The maximum data transfer for connections in bytes.
  final int connectionData;
  
  /// The maximum number of HOP requests per peer per minute (rate limiting).
  final int maxHopRequestsPerMinute;

  /// The current number of reservations.
  int _reservations = 0;

  /// The current number of connections.
  int _connections = 0;
  
  /// Track HOP request history for rate limiting
  final Map<String, List<DateTime>> _hopRequestHistory = {};

  /// Creates a new resource manager.
  Resources({
    this.maxReservations = 128,
    this.maxConnections = 128,
    this.reservationTtl = 3600,
    this.connectionDuration = 3600,
    this.connectionData = 1 << 20, // 1 MiB
    this.maxHopRequestsPerMinute = 10,
  });

  /// Checks if a peer can make a reservation.
  bool canReserve(PeerId peer) {
    return _reservations < maxReservations;
  }

  /// Adds a reservation for a peer.
  void addReservation(PeerId peer) {
    _reservations++;
  }

  /// Removes a reservation for a peer.
  void removeReservation(PeerId peer) {
    _reservations--;
  }

  /// Checks if a peer can make a connection.
  bool canConnect(PeerId src, PeerId dst) {
    return _connections < maxConnections;
  }

  /// Adds a connection for a peer.
  void addConnection(PeerId src, PeerId dst) {
    _connections++;
  }

  /// Removes a connection for a peer.
  void removeConnection(PeerId src, PeerId dst) {
    _connections--;
  }
  
  /// Checks if a peer can make a HOP request (rate limiting)
  /// Uses a sliding window to track requests per minute
  bool canMakeHopRequest(PeerId peer) {
    final peerStr = peer.toString();
    final now = DateTime.now();
    final cutoff = now.subtract(Duration(minutes: 1));
    
    // Clean old entries (older than 1 minute)
    _hopRequestHistory[peerStr] = (_hopRequestHistory[peerStr] ?? [])
        .where((t) => t.isAfter(cutoff))
        .toList();
    
    // Check rate limit
    final requestCount = _hopRequestHistory[peerStr]?.length ?? 0;
    if (requestCount >= maxHopRequestsPerMinute) {
      return false;
    }
    
    // Record this request
    _hopRequestHistory.putIfAbsent(peerStr, () => []).add(now);
    return true;
  }
}