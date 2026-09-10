import 'package:envoygo/models/peer_search_result.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('PeerSearchResult dialability', () {
    PeerSearchResult row({
      bool? hasHopSlot,
      List<String> multiaddrs = const [],
    }) =>
        PeerSearchResult.fromJson({
          'nodeId': '12D3KooWPeerA',
          'ownerId': 'envoy:owner:peer-a',
          'displayName': 'Emily',
          'multiaddrs': multiaddrs,
          if (hasHopSlot != null) 'hasHopSlot': hasHopSlot,
        });

    test('parses hasHopSlot from the home node JSON-RPC row', () {
      expect(row(hasHopSlot: true).hasHopSlot, isTrue);
      expect(row(hasHopSlot: false).hasHopSlot, isFalse);
      // Legacy/absent field stays unknown rather than defaulting to a claim.
      expect(row().hasHopSlot, isNull);
      // Non-bool payloads (older/other sources) are ignored, not coerced.
      expect(
        PeerSearchResult.fromJson({
          'nodeId': '12D3KooWPeerA',
          'ownerId': 'envoy:owner:peer-a',
          'hasHopSlot': 'yes',
        }).hasHopSlot,
        isNull,
      );
    });

    test('a checked-in peer without a live hop is not dialable', () {
      final peer = row(
        hasHopSlot: false,
        multiaddrs: const ['/p2p/12D3KooWRelay/p2p-circuit/p2p/12D3KooWPeerA'],
      );
      // The explicit flag wins: a stale address must not enable Say Hello.
      expect(peer.dialable, isFalse);
    });

    test('a live hop is dialable', () {
      expect(row(hasHopSlot: true).dialable, isTrue);
    });

    test('a direct address wins over a negative hop report', () {
      // A DHT/LAN merge can contribute real (non-circuit) addresses for a peer
      // whose roster entry holds no slot: dialing it directly can still work.
      final peer = row(
        hasHopSlot: false,
        multiaddrs: const ['/ip4/192.168.1.9/tcp/4001/p2p/12D3KooWPeerA'],
      );
      expect(peer.dialable, isTrue);
    });

    test('falls back to address presence when the source is silent', () {
      // LAN / DHT / local hits: real addresses, no hop-slot report.
      expect(row(multiaddrs: const ['/ip4/192.168.1.9/tcp/4001/p2p/x']).dialable, isTrue);
      // Relay-roster hit with no addrs and no flag: nothing to dial.
      expect(row().dialable, isFalse);
    });
  });
}
