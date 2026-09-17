import 'package:dart_libp2p/core/connmgr/conn_gater.dart';
import 'package:dart_libp2p/core/multiaddr.dart';
import 'package:dart_libp2p/core/network/conn.dart';
import 'package:dart_libp2p/core/peer/peer_id.dart';
import 'dart:async';
import 'package:logging/logging.dart';

/// BasicConnGater is a simple implementation of the ConnGater interface that
/// allows all connections by default but can be configured to block specific
/// peers or addresses.
class BasicConnGater implements ConnGater {
  final Logger _logger = Logger('BasicConnGater');

  /// Set of blocked peer IDs
  final Set<PeerId> _blockedPeers = {};

  /// Set of blocked multiaddresses
  final Set<MultiAddr> _blockedAddrs = {};

  /// Set of blocked connections
  final Set<String> _blockedConns = {};

  /// Set of blocked subnets
  final Set<String> _blockedSubnets = {};

  /// Map of connection timeouts
  final Map<String, Timer> _connectionTimeouts = {};

  /// Map of connection metrics
  final Map<String, ConnectionMetrics> _connectionMetrics = {};

  /// Map of active connections by peer ID
  final Map<String, Set<String>> _peerConnections = {};

  /// Set of active connections
  final Set<String> _activeConnections = {};

  /// Maximum number of connections allowed
  final int _maxConnections;

  /// Maximum number of connections per peer
  final int _maxConnectionsPerPeer;

  /// Connection timeout duration
  final Duration _connectionTimeout;

  /// Creates a new BasicConnGater with the specified limits
  BasicConnGater({
    int maxConnections = 1000,
    int maxConnectionsPerPeer = 10,
    Duration connectionTimeout = const Duration(minutes: 5),
  }) : 
    _maxConnections = maxConnections,
    _maxConnectionsPerPeer = maxConnectionsPerPeer,
    _connectionTimeout = connectionTimeout;

  /// BlockPeer blocks a peer by its ID
  void blockPeer(PeerId peerId) {
    _blockedPeers.add(peerId);
    _logger.fine('Blocked peer: $peerId');
  }

  /// UnblockPeer unblocks a previously blocked peer
  void unblockPeer(PeerId peerId) {
    _blockedPeers.remove(peerId);
    _logger.fine('Unblocked peer: $peerId');
  }

  /// BlockAddr blocks a specific multiaddress
  void blockAddr(MultiAddr addr) {
    _blockedAddrs.add(addr);
    _logger.fine('Blocked address: $addr');
  }

  /// UnblockAddr unblocks a previously blocked address
  void unblockAddr(MultiAddr addr) {
    _blockedAddrs.remove(addr);
    _logger.fine('Unblocked address: $addr');
  }

  /// BlockConn blocks a specific connection by its ID
  void blockConn(String connId) {
    _blockedConns.add(connId);
    _logger.fine('Blocked connection: $connId');
  }

  /// UnblockConn unblocks a previously blocked connection
  void unblockConn(String connId) {
    _blockedConns.remove(connId);
    _logger.fine('Unblocked connection: $connId');
  }

  /// BlockSubnet blocks a subnet (CIDR notation)
  void blockSubnet(String subnet) {
    _blockedSubnets.add(subnet);
    _logger.fine('Blocked subnet: $subnet');
  }

  /// UnblockSubnet unblocks a previously blocked subnet
  void unblockSubnet(String subnet) {
    _blockedSubnets.remove(subnet);
    _logger.fine('Unblocked subnet: $subnet');
  }

  /// IsPeerBlocked returns whether a peer is blocked
  bool isPeerBlocked(PeerId peerId) {
    return _blockedPeers.contains(peerId);
  }

  /// IsAddrBlocked returns whether an address is blocked
  bool isAddrBlocked(MultiAddr addr) {
    return _blockedAddrs.contains(addr);
  }

  /// IsConnBlocked returns whether a connection is blocked
  bool isConnBlocked(String connId) {
    return _blockedConns.contains(connId);
  }

  /// IsSubnetBlocked returns whether a subnet is blocked
  bool isSubnetBlocked(String subnet) {
    return _blockedSubnets.contains(subnet);
  }

  /// Checks if an address is in a blocked subnet
  bool isAddrInBlockedSubnet(MultiAddr addr) {
    for (final subnet in _blockedSubnets) {
      if (_isAddrInSubnet(addr, subnet)) {
        return true;
      }
    }
    return false;
  }

  /// Helper method to check if an address is in a subnet
  bool _isAddrInSubnet(MultiAddr addr, String subnet) {
    try {
      // Extract IP address from multiaddr
      final ipAddr = addr.valueForProtocol('ip4') ?? addr.valueForProtocol('ip6');
      if (ipAddr == null) return false;

      // Parse CIDR notation
      final parts = subnet.split('/');
      if (parts.length != 2) return false;

      final subnetAddr = parts[0];
      final prefixLen = int.parse(parts[1]);

      // Convert IP addresses to binary form
      final ipBytes = _ipToBytes(ipAddr);
      final subnetBytes = _ipToBytes(subnetAddr);

      if (ipBytes.length != subnetBytes.length) return false;

      // Check if IP is in subnet
      final mask = _createMask(prefixLen, ipBytes.length);
      for (var i = 0; i < ipBytes.length; i++) {
        if ((ipBytes[i] & mask[i]) != (subnetBytes[i] & mask[i])) {
          return false;
        }
      }
      return true;
    } catch (e) {
      return false;
    }
  }

  /// Helper method to convert IP address to bytes
  List<int> _ipToBytes(String ip) {
    if (ip.contains(':')) {
      // IPv6
      final parts = ip.split(':');
      final bytes = <int>[];
      for (final part in parts) {
        if (part.isEmpty) continue;
        final value = int.parse(part, radix: 16);
        bytes.add((value >> 8) & 0xFF);
        bytes.add(value & 0xFF);
      }
      return bytes;
    } else {
      // IPv4
      return ip.split('.').map((part) => int.parse(part)).toList();
    }
  }

  /// Helper method to create a subnet mask
  List<int> _createMask(int prefixLen, int addrLen) {
    final mask = List<int>.filled(addrLen, 0);
    for (var i = 0; i < addrLen; i++) {
      if (prefixLen > 8) {
        mask[i] = 0xFF;
        prefixLen -= 8;
      } else {
        mask[i] = (0xFF << (8 - prefixLen)) & 0xFF;
        break;
      }
    }
    return mask;
  }

  /// Records connection metrics
  void _recordConnectionMetrics(String connId, PeerId peerId) {
    _connectionMetrics[connId] = ConnectionMetrics(
      peerId: peerId,
      startTime: DateTime.now(),
    );
  }

  /// Updates connection metrics
  void updateConnectionMetrics(String connId, {int? bytesIn, int? bytesOut}) {
    final metrics = _connectionMetrics[connId];
    if (metrics != null) {
      if (bytesIn != null) metrics.bytesIn += bytesIn;
      if (bytesOut != null) metrics.bytesOut += bytesOut;
    }
  }

  /// Gets connection metrics
  ConnectionMetrics? getConnectionMetrics(String connId) {
    return _connectionMetrics[connId];
  }

  /// Sets up connection timeout
  void _setupConnectionTimeout(String connId) {
    _connectionTimeouts[connId] = Timer(_connectionTimeout, () {
      _logger.warning('Connection timeout: $connId');
      blockConn(connId);
    });
  }

  /// Cleans up connection timeout
  void _cleanupConnectionTimeout(String connId) {
    _connectionTimeouts[connId]?.cancel();
    _connectionTimeouts.remove(connId);
  }

  /// Cleans up connection metrics
  void _cleanupConnectionMetrics(String connId) {
    _connectionMetrics.remove(connId);
  }

  /// Cleans up connection tracking
  void _cleanupConnectionTracking(String connId, PeerId peerId) {
    _activeConnections.remove(connId);
    final peerIdStr = peerId.toString();
    _peerConnections[peerIdStr]?.remove(connId);
    if (_peerConnections[peerIdStr]?.isEmpty ?? false) {
      _peerConnections.remove(peerIdStr);
    }
  }

  @override
  bool interceptPeerDial(PeerId peerId) {
    if (isPeerBlocked(peerId)) {
      _logger.fine('Blocked peer dial: $peerId');
      return false;
    }
    return true;
  }

  @override
  bool interceptAddrDial(PeerId peerId, MultiAddr addr) {
    // Check if the peer is blocked
    if (isPeerBlocked(peerId)) {
      _logger.fine('Blocked peer dial: $peerId');
      return false;
    }

    // Check if the address is blocked
    if (isAddrBlocked(addr)) {
      _logger.fine('Blocked address dial: $addr');
      return false;
    }

    // Check if the address is in a blocked subnet
    if (isAddrInBlockedSubnet(addr)) {
      _logger.fine('Blocked subnet dial: $addr');
      return false;
    }

    return true;
  }

  @override
  bool interceptAccept(Conn conn) {
    if (isConnBlocked(conn.id)) {
      _logger.fine('Blocked connection accept: ${conn.id}');
      return false;
    }

    // Check total connection limit
    if (_activeConnections.length >= _maxConnections) {
      _logger.fine('Connection limit reached: ${_activeConnections.length} connections');
      return false;
    }

    // Check per-peer connection limit
    final peerIdStr = conn.remotePeer.toString();
    final peerConns = _peerConnections[peerIdStr] ?? {};
    if (peerConns.length >= _maxConnectionsPerPeer) {
      _logger.fine('Per-peer connection limit reached for peer $peerIdStr: ${peerConns.length} connections');
      return false;
    }

    // Track the connection
    _activeConnections.add(conn.id);
    _peerConnections[peerIdStr] = peerConns..add(conn.id);
    _setupConnectionTimeout(conn.id);
    _recordConnectionMetrics(conn.id, conn.remotePeer);
    return true;
  }

  @override
  bool interceptSecured(bool isInitiator, PeerId peerId, Conn conn) {
    if (isPeerBlocked(peerId)) {
      _logger.fine('Blocked secured connection: $peerId');
      return false;
    }
    if (isConnBlocked(conn.id)) {
      _logger.fine('Blocked secured connection: ${conn.id}');
      return false;
    }
    return true;
  }

  @override
  (bool, DisconnectReason?) interceptUpgraded(Conn conn) {
    if (isPeerBlocked(conn.remotePeer)) {
      _logger.fine('Blocked upgraded connection: ${conn.remotePeer}');
      return (
        false,
        DisconnectReason(
          code: 1,
          message: 'Peer is blocked',
        ),
      );
    }
    if (isConnBlocked(conn.id)) {
      _logger.fine('Blocked upgraded connection: ${conn.id}');
      return (
        false,
        DisconnectReason(
          code: 2,
          message: 'Connection is blocked',
        ),
      );
    }
    return (true, null);
  }

  /// Closes the connection gater and cleans up resources
  void close() {
    for (final timer in _connectionTimeouts.values) {
      timer.cancel();
    }
    _connectionTimeouts.clear();
    _connectionMetrics.clear();
    _activeConnections.clear();
    _peerConnections.clear();
  }
}

/// Connection metrics
class ConnectionMetrics {
  final PeerId peerId;
  final DateTime startTime;
  int bytesIn = 0;
  int bytesOut = 0;

  ConnectionMetrics({
    required this.peerId,
    required this.startTime,
  });

  /// Gets the connection duration
  Duration get duration => DateTime.now().difference(startTime);

  /// Gets the total bytes transferred
  int get totalBytes => bytesIn + bytesOut;
} 