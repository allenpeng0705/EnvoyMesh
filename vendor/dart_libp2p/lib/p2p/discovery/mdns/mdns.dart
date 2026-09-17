import 'dart:async';
import 'dart:io';
import 'dart:math';

import 'package:mdns_dart/mdns_dart.dart';

import '../../../core/discovery.dart';
import '../../../core/peer/addr_info.dart';
import '../../../core/host/host.dart';
import '../../../core/multiaddr.dart';
import '../../../core/peer/peer_id.dart';

/// Constants for mDNS service
class MdnsConstants {
  /// The default service name for libp2p mDNS discovery
  static const String serviceName = '_p2p._udp';

  /// The domain for mDNS
  static const String mdnsDomain = 'local';

  /// Prefix for DNS address records
  static const String dnsaddrPrefix = 'dnsaddr=';

  /// Default port for mDNS
  static const int defaultPort = 4001;
}

/// Interface for handling discovered peers
abstract class MdnsNotifee {
  /// Called when a peer is discovered
  void handlePeerFound(AddrInfo peer);
}

/// Implementation of mDNS discovery for libp2p using mdns_dart
class MdnsDiscovery implements Discovery {
  final Host _host;
  final String _serviceName;
  final String _peerName;
  MdnsNotifee? _notifee;

  // mDNS server for advertising our service
  MDNSServer? _server;
  MDNSService? _service;

  // Discovery state
  StreamSubscription<ServiceEntry>? _discoverySubscription;
  Timer? _discoveryTimer;
  bool _isRunning = false;
  
  // Track discovered services to avoid duplicates
  final Set<String> _discoveredServices = <String>{};

  /// Sets the notifee
  set notifee(MdnsNotifee? value) {
    _notifee = value;
  }

  /// Creates a new MdnsDiscovery service
  MdnsDiscovery(this._host, {
    String? serviceName,
    MdnsNotifee? notifee,
  }) : 
    _serviceName = serviceName ?? MdnsConstants.serviceName,
    _peerName = _generateRandomString(32 + Random().nextInt(32)),
    _notifee = notifee;

  /// Starts the mDNS discovery service
  Future<void> start() async {
    if (_isRunning) return;

    // Start advertising our service
    await _startAdvertising();

    // Start discovering other peers
    await _startDiscovery();

    _isRunning = true;
  }

  /// Stops the mDNS discovery service
  Future<void> stop() async {
    if (!_isRunning) return;


    // Stop discovery
    _discoverySubscription?.cancel();
    _discoverySubscription = null;
    
    // Stop periodic discovery timer
    _discoveryTimer?.cancel();
    _discoveryTimer = null;

    // Clear discovered services cache
    _discoveredServices.clear();

    // Stop advertising
    if (_server != null) {
      await _server!.stop();
      _server = null;
    }

    _service = null;
    _isRunning = false;
  }

  @override
  Future<Duration> advertise(String ns, [List<DiscoveryOption> options = const []]) async {
    if (!_isRunning) {
      await start();
    }

    final opts = DiscoveryOptions().apply(options);
    return opts.ttl ?? const Duration(minutes: 1);
  }

  @override
  Future<Stream<AddrInfo>> findPeers(String ns, [List<DiscoveryOption> options = const []]) async {
    if (!_isRunning) {
      await start();
    }

    final controller = StreamController<AddrInfo>();

    // Create a notifee that will forward discovered peers to the stream
    final streamNotifee = _StreamNotifee(controller);

    // Store the original notifee
    final originalNotifee = _notifee;

    // Create a composite notifee that will notify both the original notifee and the stream
    final compositeNotifee = _CompositeNotifee([
      if (originalNotifee != null) originalNotifee,
      streamNotifee,
    ]);

    // Set up a subscription to handle cleanup when the stream is closed
    controller.onCancel = () {
      notifee = originalNotifee;
    };

    // Set the composite notifee as the current notifee
    notifee = compositeNotifee;

    return controller.stream;
  }

  /// Start advertising our service using REAL mDNS service announcement
  Future<void> _startAdvertising() async {
    final addresses = _host.addrs;
    if (addresses.isEmpty) {
      return;
    }

    try {
      // Create TXT records with our peer addresses (including peer ID)
      final txtRecords = <String>[];
      for (final addr in addresses) {
        // Append peer ID to create complete multiaddr
        final fullAddr = '${addr.toString()}/p2p/${_host.id.toString()}';
        final txtRecord = '${MdnsConstants.dnsaddrPrefix}$fullAddr';
        txtRecords.add(txtRecord);
      }

      // Get our IP addresses for the service
      final localIPs = await _getLocalIPAddresses();

      // Create the mDNS service
      _service = await MDNSService.create(
        instance: _peerName,
        service: _serviceName,
        domain: MdnsConstants.mdnsDomain,
        port: MdnsConstants.defaultPort,
        ips: localIPs,
        txt: txtRecords,
      );

      // Create and start the mDNS server
      final config = MDNSServerConfig(
        zone: _service!,
      );

      _server = MDNSServer(config);
      await _server!.start();

    } catch (e) {
    }
  }

  /// Start discovering other peers using REAL mDNS discovery
  Future<void> _startDiscovery() async {

    try {
      final serviceName = '$_serviceName.${MdnsConstants.mdnsDomain}';

      // Wait a moment for the network to settle and other services to be advertised
      await Future.delayed(const Duration(milliseconds: 1500));
      
      // Start immediate discovery
      await _performDiscoveryQuery(serviceName);
      
      // Set up frequent discovery queries (every 5 seconds)
      // This compensates for MDNSClient.lookup() being a one-shot query
      _discoveryTimer = Timer.periodic(const Duration(seconds: 5), (_) async {
        await _performDiscoveryQuery(serviceName);
      });

    } catch (e) {
    }
  }

  /// Perform a single mDNS discovery query
  Future<void> _performDiscoveryQuery(String serviceName) async {
    try {
      // Use MDNSClient.query() with longer timeout instead of lookup() which has 1s timeout
      // Extract just the service part (remove .local if present)  
      final serviceOnly = serviceName.replaceAll('.local', '');
      final params = QueryParams(
        service: serviceOnly,  // Pass "_p2p._udp" not "_p2p._udp.local"
        domain: 'local',
        timeout: const Duration(seconds: 10), // Extended timeout for better discovery
        wantUnicastResponse: false,
        reusePort: true,
        reuseAddress: true,
        multicastHops: 1,
      );
      
      final stream = await MDNSClient.query(params);
      
      var serviceCount = 0;
      
      await for (final serviceEntry in stream) {
        serviceCount++;
        _processDiscoveredService(serviceEntry);
      }
      
    } catch (e) {
    }
  }

  /// Process a discovered mDNS service entry
  void _processDiscoveredService(ServiceEntry serviceEntry) {
    try {
      // Create a unique key for this service
      final serviceKey = '${serviceEntry.name}@${serviceEntry.host}:${serviceEntry.port}';
      
      // Check if we've already processed this service
      if (_discoveredServices.contains(serviceKey)) {
        return;
      }
      
      // Mark as discovered
      _discoveredServices.add(serviceKey);
      
      // Extract peer information from TXT records
      final addresses = <MultiAddr>[];
      PeerId? peerId;

      for (final txtRecord in serviceEntry.infoFields) {
        if (txtRecord.startsWith(MdnsConstants.dnsaddrPrefix)) {
          final addrStr = txtRecord.substring(MdnsConstants.dnsaddrPrefix.length);
          
          try {
            final addr = MultiAddr(addrStr);
            addresses.add(addr);

            // Extract peer ID from multiaddr if we haven't found one yet
            if (peerId == null) {
              final peerIdStr = addr.valueForProtocol('p2p');
              if (peerIdStr != null) {
                peerId = PeerId.fromString(peerIdStr);
              }
            }
          } catch (e) {
          }
        }
      }

      // Don't discover ourselves
      if (peerId != null && peerId == _host.id) {
        return;
      }

      // If we found addresses and a peer ID, notify the notifee
      if (addresses.isNotEmpty && peerId != null) {
        final addrInfo = AddrInfo(peerId, addresses);
        _notifee?.handlePeerFound(addrInfo);
      }
    } catch (e) {
    }
  }

  /// Get local IP addresses for service announcement
  Future<List<InternetAddress>> _getLocalIPAddresses() async {
    final interfaces = await NetworkInterface.list();
    final addresses = <InternetAddress>[];

    for (final interface in interfaces) {
      for (final addr in interface.addresses) {
        // Skip loopback and link-local addresses
        if (!addr.isLoopback && !addr.isLinkLocal) {
          addresses.add(addr);
        }
      }
    }

    if (addresses.isEmpty) {
      // Fallback to any available address
      for (final interface in interfaces) {
        addresses.addAll(interface.addresses);
        break;
      }
    }

    return addresses;
  }

  /// Test helper: inject a discovered peer into the notifee/stream pipeline.
  void debugInjectPeer(AddrInfo peer) {
    _notifee?.handlePeerFound(peer);
  }

  /// Truncate peer ID for display
  String _truncatePeerId(PeerId peerId) {
    final str = peerId.toString();
    return str.length > 8 ? str.substring(str.length - 8) : str;
  }

  /// Generates a random string of the specified length
  static String _generateRandomString(int length) {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    final random = Random();
    return String.fromCharCodes(
      List.generate(length, (_) => chars.codeUnitAt(random.nextInt(chars.length)))
    );
  }
}

/// A notifee that forwards discovered peers to a stream
class _StreamNotifee implements MdnsNotifee {
  final StreamController<AddrInfo> _controller;

  _StreamNotifee(this._controller);

  @override
  void handlePeerFound(AddrInfo peer) {
    if (!_controller.isClosed) {
      _controller.add(peer);
    }
  }
}

/// A notifee that forwards discovered peers to multiple notifees
class _CompositeNotifee implements MdnsNotifee {
  final List<MdnsNotifee> _notifees;

  _CompositeNotifee(this._notifees);

  @override
  void handlePeerFound(AddrInfo peer) {
    for (final notifee in _notifees) {
      notifee.handlePeerFound(peer);
    }
  }
}