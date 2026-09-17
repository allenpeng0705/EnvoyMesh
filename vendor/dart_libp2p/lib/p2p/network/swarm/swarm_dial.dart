import 'dart:async';

import 'package:dart_libp2p/core/multiaddr.dart';
import 'package:dart_libp2p/core/peer/peer_id.dart';
// Corrected import for Protocol constants:
import 'package:dart_libp2p/p2p/multiaddr/protocol.dart' as multiaddr_protocol;
import 'package:dart_libp2p/core/network/context.dart';
import 'package:dart_libp2p/core/network/network.dart';
import 'package:dart_libp2p/p2p/host/basic/basic_host.dart';
import 'package:logging/logging.dart';

import '../../../core/interfaces.dart';
import '../../../core/network/conn.dart';

/// DialFunc is a function that dials a peer at a specific address
typedef DialFunc = Future<Conn> Function(Context context, MultiAddr addr, PeerId peerId);

/// AddrDialer is a helper for dialing multiple addresses in parallel
class AddrDialer {
  final Logger _logger = Logger('AddrDialer');

  /// The peer ID to dial
  final PeerId _peerId;

  /// The addresses to dial
  final List<MultiAddr> _addrs;

  /// The dial function to use
  final DialFunc _dialFunc;

  /// The context for the dial operation
  final Context _context;

  /// Creates a new AddrDialer
  AddrDialer({
    required PeerId peerId,
    required List<MultiAddr> addrs,
    required DialFunc dialFunc,
    required Context context,
  }) : 
    _peerId = peerId,
    _addrs = addrs,
    _dialFunc = dialFunc,
    _context = context;

  /// Dials the addresses in parallel and returns the first successful connection
  Future<Conn> dial() async {
    if (_addrs.isEmpty) {
      throw Exception('No addresses to dial');
    }

    // Create a completer for the first successful connection
    final completer = Completer<Conn>();
    
    // Track all errors for comprehensive reporting (3b)
    final errors = <String, Exception>{};
    var dialsInProgress = _addrs.length;

    // Dial ALL addresses in parallel immediately (1a)
    for (final addr in _addrs) {
      _dialAddr(addr).then((conn) {
        // First success wins
        if (!completer.isCompleted) {
          completer.complete(conn);
        }
      }).catchError((error) {
        // Collect error for this address
        errors[addr.toString()] = error is Exception 
            ? error 
            : Exception(error.toString());
        
        dialsInProgress--;
        
        // If all dials failed, report all errors
        if (dialsInProgress == 0 && !completer.isCompleted) {
          final errorMsg = errors.entries
              .map((e) => '${e.key}: ${e.value}')
              .join('; ');
          completer.completeError(
            Exception('Failed to dial any address. Errors: $errorMsg')
          );
        }
      });
    }

    return completer.future;
  }

  /// Dials a single address
  Future<Conn> _dialAddr(MultiAddr addr) async {
    try {
      _logger.fine('Dialing $addr');
      return await _dialFunc(_context, addr, _peerId);
    } catch (e) {
      _logger.warning('Failed to dial $addr: $e');
      rethrow;
    }
  }
}

/// DialRanker implementation that ranks addresses by delay
class DelayDialRanker {
  /// Call method to make this class callable as a function
  List<AddrDelay> call(List<MultiAddr> addrs) {
    final nonRelayAddrs = <MultiAddr>[];
    final relayAddrs = <MultiAddr>[];

    for (final addr in addrs) {
      bool isRelay = false;
      for (final p in addr.protocols) { // This 'p' is of type multiaddr_protocol.Protocol
        if (p.code == multiaddr_protocol.Protocols.circuit.code) { // Corrected access to P_CIRCUIT code
          isRelay = true;
          break;
        }
      }

      if (isRelay) {
        relayAddrs.add(addr);
      } else {
        nonRelayAddrs.add(addr);
      }
    }

    final result = <AddrDelay>[];
    // Add non-relay addresses first, with zero delay
    for (final addr in nonRelayAddrs) {
      result.add(AddrDelay(addr: addr, delay: Duration.zero));
    }
    // Add relay addresses next, also with zero delay for now (could add a slight delay later)
    for (final addr in relayAddrs) {
      result.add(AddrDelay(addr: addr, delay: Duration.zero));
    }

    return result;
  }
}

/// DialBackoff implements exponential backoff for failed dials
class DialBackoff {
  /// The base delay for backoff
  final Duration _baseDelay;

  /// The maximum delay for backoff
  final Duration _maxDelay;

  /// The current delay
  Duration _currentDelay;

  /// Creates a new DialBackoff
  DialBackoff({
    Duration baseDelay = const Duration(milliseconds: 100),
    Duration maxDelay = const Duration(minutes: 5),
  }) : 
    _baseDelay = baseDelay,
    _maxDelay = maxDelay,
    _currentDelay = baseDelay;

  /// Gets the next delay and increases the backoff
  Duration nextDelay() {
    final delay = _currentDelay;

    // Double the delay for next time, but don't exceed max
    _currentDelay = Duration(milliseconds: _currentDelay.inMilliseconds * 2);
    if (_currentDelay > _maxDelay) {
      _currentDelay = _maxDelay;
    }

    return delay;
  }

  /// Resets the backoff to the base delay
  void reset() {
    _currentDelay = _baseDelay;
  }
}

/// Address with priority and timeout information for connection attempts
class ScoredAddress {
  final MultiAddr addr;
  final AddressType type;
  final int priority;           // Lower = higher priority
  final Duration timeout;       // Type-specific timeout
  
  ScoredAddress({
    required this.addr,
    required this.type,
    required this.priority,
    required this.timeout,
  });
}

/// Priority ranker that considers local network capabilities
class CapabilityAwarePriorityRanker {
  static const directTimeout = Duration(seconds: 5);
  static const relayTimeout = Duration(seconds: 10);
  
  /// Rank addresses by priority based on local capabilities
  List<ScoredAddress> rank(
    List<MultiAddr> addresses,
    OutboundCapabilityInfo capability,
  ) {
    final scored = <ScoredAddress>[];
    
    for (final addr in addresses) {
      final type = addr.addressType;
      final priority = _assignPriority(type, capability);
      final timeout = _timeoutFor(type);
      
      scored.add(ScoredAddress(
        addr: addr, 
        type: type, 
        priority: priority, 
        timeout: timeout,
      ));
    }
    
    // Sort by priority (lower = higher priority)
    scored.sort((a, b) => a.priority.compareTo(b.priority));
    return scored;
  }
  
  /// Assign priority based on address type and capability
  int _assignPriority(AddressType type, OutboundCapabilityInfo capability) {
    if (capability.capability == OutboundCapability.dualStack) {
      // Dual-stack: prefer IPv6, then IPv4, then relay
      return switch (type) {
        AddressType.directIPv6Public => 1,  // Prefer IPv6 for dual-stack
        AddressType.directIPv4Public => 2,
        AddressType.directIPv4Private => 3,
        AddressType.relaySpecific => 10,
        AddressType.relayGeneric => 20,
        _ => 100,
      };
    } else if (capability.capability == OutboundCapability.ipv4Only) {
      // IPv4-only: prefer public IPv4, then private, then relay
      return switch (type) {
        AddressType.directIPv4Public => 1,
        AddressType.directIPv4Private => 5,
        AddressType.relaySpecific => 10,
        AddressType.relayGeneric => 20,
        _ => 100,
      };
    } else if (capability.capability == OutboundCapability.ipv6Only) {
      // IPv6-only: prefer IPv6, then relay
      return switch (type) {
        AddressType.directIPv6Public => 1,
        AddressType.relaySpecific => 10,
        AddressType.relayGeneric => 20,
        _ => 100,
      };
    } else {
      // Relay-only or unknown: only try relays
      return switch (type) {
        AddressType.relaySpecific => 1,
        AddressType.relayGeneric => 5,
        _ => 100,
      };
    }
  }
  
  /// Determine timeout based on address type
  Duration _timeoutFor(AddressType type) {
    return switch (type) {
      AddressType.relaySpecific => relayTimeout,
      AddressType.relayGeneric => relayTimeout,
      _ => directTimeout,
    };
  }
}

/// Happy Eyeballs dialer with staggered connection attempts (RFC 8305)
/// 
/// Attempts connections in priority order with a stagger delay between each.
/// First successful connection wins and cancels remaining attempts.
class HappyEyeballsDialer {
  final Logger _logger = Logger('HappyEyeballsDialer');
  static const staggerDelay = Duration(milliseconds: 250);
  
  final PeerId _peerId;
  final List<ScoredAddress> _addrs;
  final DialFunc _dialFunc;
  final Context _context;

  HappyEyeballsDialer({
    required PeerId peerId,
    required List<ScoredAddress> addrs,
    required DialFunc dialFunc,
    required Context context,
  }) : _peerId = peerId, 
       _addrs = addrs, 
       _dialFunc = dialFunc, 
       _context = context;

  /// Dial with Happy Eyeballs algorithm
  /// 
  /// Attempts connections in priority order, staggering each attempt by 250ms.
  /// Returns the first successful connection and cancels remaining attempts.
  Future<Conn> dial() async {
    if (_addrs.isEmpty) throw Exception('No addresses to dial');

    final completer = Completer<Conn>();
    final errors = <String, Exception>{};
    var pendingAttempts = _addrs.length;
    var cancelled = false;

    // Start staggered connection attempts
    for (var i = 0; i < _addrs.length; i++) {
      final scored = _addrs[i];
      final delay = staggerDelay * i;

      Future.delayed(delay, () async {
        // Skip if already succeeded or cancelled
        if (completer.isCompleted || cancelled) {
          pendingAttempts--;
          return;
        }

        _logger.fine('Attempting ${scored.addr} (priority ${scored.priority})');
        
        try {
          final conn = await _dialFunc(_context, scored.addr, _peerId)
              .timeout(scored.timeout);

          if (!completer.isCompleted) {
            cancelled = true;  // Signal other attempts to stop
            completer.complete(conn);
            _logger.fine('Connected via ${scored.addr}');
          } else {
            // Another attempt won, close this connection
            try {
              await conn.close();
            } catch (e) {
              _logger.fine('Error closing redundant connection: $e');
            }
          }
        } catch (e) {
          errors[scored.addr.toString()] = e is Exception ? e : Exception('$e');
          pendingAttempts--;
          
          // If all attempts failed, complete with error
          if (pendingAttempts == 0 && !completer.isCompleted) {
            final errorMsg = errors.entries
                .map((e) => '${e.key}: ${e.value}')
                .join('; ');
            completer.completeError(
              Exception('All dial attempts failed: $errorMsg')
            );
          }
        }
      });
    }

    // Overall timeout: max individual timeout + total stagger time
    final maxWait = _addrs.fold<Duration>(
      Duration.zero,
      (max, addr) => addr.timeout > max ? addr.timeout : max,
    ) + (staggerDelay * _addrs.length);

    return completer.future.timeout(maxWait, onTimeout: () {
      cancelled = true;
      throw Exception('Connection timed out after ${maxWait.inMilliseconds}ms');
    });
  }
}
