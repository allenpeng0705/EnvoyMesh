
import 'package:dart_libp2p/core/peer/peer_id.dart';

/// Protocol ID for AutoNAT v1.0.0
const String autoNATV1Proto = '/libp2p/autonat/1.0.0';

// Potentially other core definitions for AutoNAT v1 can go here in the future.

/// Interface for the AutoNAT v1 client.
abstract class AutoNATV1Client {
  /// Requests a peer providing AutoNAT services to test dial back
  /// and report the address on a successful connection.
  Future<void> dialBack(PeerId peer);
}
