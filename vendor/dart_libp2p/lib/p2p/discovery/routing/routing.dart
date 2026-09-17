import 'dart:async';
import 'dart:convert';
import 'dart:developer' as developer;
import 'dart:typed_data';
import 'package:crypto/crypto.dart';
import 'package:dcid/dcid.dart';

import 'package:dart_libp2p/core/discovery.dart';
import 'package:dart_libp2p/core/peer/addr_info.dart';
import 'package:dart_libp2p/core/routing/routing.dart';

/// RoutingDiscovery is an implementation of discovery using ContentRouting.
/// Namespaces are translated to Cids using the SHA256 hash.
class RoutingDiscovery implements Discovery {
  final ContentRouting _router;

  /// Creates a new RoutingDiscovery
  RoutingDiscovery(this._router);

  @override
  Future<Duration> advertise(String ns, [List<DiscoveryOption> options = const []]) async {
    final opts = DiscoveryOptions().apply(options);

    var ttl = opts.ttl;
    if (ttl == null || ttl > const Duration(hours: 3)) {
      // the DHT provider record validity is 24hrs, but it is recommended to republish at least every 6hrs
      // we go one step further and republish every 3hrs
      ttl = const Duration(hours: 3);
    }

    final cid = await nsToCid(ns);

    // this context requires a timeout; it determines how long the DHT looks for
    // closest peers to the key/CID before it goes on to provide the record to them.
    // Not setting a timeout here will make the DHT wander forever.
    try {
      await _router.provide(cid, true).timeout(const Duration(seconds: 60));
    } catch (e) {
      if (e is TimeoutException) {
        // Log the timeout for monitoring and debugging purposes
        developer.log(
          'Timeout while providing CID in RoutingDiscovery.advertise',
          name: 'dart_libp2p.discovery.routing',
          error: e,
          time: DateTime.now(),
        );
        // We continue execution despite the timeout since this is a non-critical error
        // The DHT may have partially succeeded in finding peers before the timeout
      } else {
        // For other errors, we rethrow as they might indicate more serious issues
        developer.log(
          'Error in RoutingDiscovery.advertise',
          name: 'dart_libp2p.discovery.routing',
          error: e,
          time: DateTime.now(),
        );
        rethrow;
      }
    }

    return ttl;
  }

  @override
  Future<Stream<AddrInfo>> findPeers(String ns, [List<DiscoveryOption> options = const []]) async {
    final opts = DiscoveryOptions().apply(options);
    final limit = opts.limit ?? 100; // default limit if not specified in options

    final cid = await nsToCid(ns);

    // Create a stream controller to handle the timeout
    final controller = StreamController<AddrInfo>();

    // Use a timeout for the initial provider lookup
    Future<void> findProvidersWithTimeout() async {
      try {
        // Start the provider lookup
        final providerStream = _router.findProvidersAsync(cid, limit);

        // Set up a timeout for the initial lookup
        final timeout = const Duration(seconds: 60);
        final timer = Timer(timeout, () {
          // If we reach the timeout, we'll close the controller
          // but we won't consider it an error - we just stop looking for more providers
          if (!controller.isClosed) {
            developer.log(
              'Timeout while finding providers in RoutingDiscovery.findPeers',
              name: 'dart_libp2p.discovery.routing',
              time: DateTime.now(),
            );
            controller.close();
          }
        });

        // Pipe the provider stream to our controller
        await for (final peer in providerStream) {
          if (controller.isClosed) break;
          controller.add(peer);
        }

        // Cancel the timer if we're done before the timeout
        timer.cancel();

        // Close the controller if it's not already closed
        if (!controller.isClosed) {
          await controller.close();
        }
      } catch (e) {
        // Log the error for monitoring and debugging
        developer.log(
          'Error in RoutingDiscovery.findPeers',
          name: 'dart_libp2p.discovery.routing',
          error: e,
          time: DateTime.now(),
        );

        if (!controller.isClosed) {
          controller.addError(e);
          await controller.close();
        }
      }
    }

    // Start the provider lookup process
    findProvidersWithTimeout();

    return controller.stream;
  }

  /// Converts a namespace string to a CID
  static Future<CID> nsToCid(String ns) async {
    final bytes = utf8.encode(ns);
    final hash = sha256.convert(bytes);

    // Create a CID from the hash
    return CID.create(CID.V1, 'sha2-256', Uint8List.fromList(hash.bytes));
  }
}

/// DiscoveryRouting is an implementation of ContentRouting using Discovery.
class DiscoveryRouting implements ContentRouting {
  final Discovery _discovery;
  final List<DiscoveryOption> _opts;

  /// Creates a new DiscoveryRouting
  DiscoveryRouting(this._discovery, [this._opts = const []]);

  @override
  Future<void> provide(CID cid, bool announce) async {
    if (!announce) {
      return;
    }

    await _discovery.advertise(cidToNs(cid), _opts);
  }

  @override
  Stream<AddrInfo> findProvidersAsync(CID cid, int count) async* {
    // Create a limit option with the provided count
    final limitOption = limit(count);
    final options = [limitOption, ..._opts];
    final stream = await _discovery.findPeers(cidToNs(cid), options);

    await for (final peer in stream) {
      yield peer;
    }
  }

  /// Converts a CID to a namespace string
  static String cidToNs(CID cid) {
    return '/provider/${cid.toString()}';
  }
}
