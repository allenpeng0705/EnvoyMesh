import 'package:envoy_mesh/envoy_mesh.dart';
import 'package:test/test.dart';

void main() {
  group('relay hop persistence', () {
    const circuit = '/p2p/12D3KooWRelay/p2p-circuit/p2p/12D3KooWPeer';

    test('encodes a hop report for storage', () {
      expect(hopFreshUntilForReport(null), isNull);
      // Explicit "not live" is recorded as 0 so it also clears an earlier
      // positive report.
      expect(hopFreshUntilForReport(false), 0);
      expect(hopFreshUntilForReport(true, nowMs: 1000), 1000 + phoneHopFreshWindowMs);
    });

    test('reads hop state back, including expiry', () {
      const base = PhonePeerRecord(
        ownerId: 'envoy:owner:peer',
        libp2pPeerId: '12D3KooWPeer',
        multiaddrs: [circuit],
      );
      expect(hopSlotForRecord(base), isNull);

      final live = base.copyWith(hopFreshUntilMs: hopFreshUntilForReport(true, nowMs: 1000));
      expect(hopSlotForRecord(live, nowMs: 1000), isTrue);
      expect(hopSlotForRecord(live, nowMs: 1000 + phoneHopFreshWindowMs), isTrue);
      // Past the window the stored circuit address is no longer trustworthy.
      expect(hopSlotForRecord(live, nowMs: 1000 + phoneHopFreshWindowMs + 1), isFalse);

      final reportedDown = base.copyWith(hopFreshUntilMs: hopFreshUntilForReport(false));
      expect(hopSlotForRecord(reportedDown), isFalse);
    });

    test('survives the JSON round-trip', () {
      final record = PhonePeerRecord(
        ownerId: 'envoy:owner:peer',
        libp2pPeerId: '12D3KooWPeer',
        displayName: 'Emily',
        multiaddrs: const [circuit],
        hopFreshUntilMs: hopFreshUntilForReport(true, nowMs: 5000),
      );
      final restored = PhonePeerRecord.fromJson(record.toJson());
      expect(restored.hopFreshUntilMs, 5000 + phoneHopFreshWindowMs);
      expect(restored.multiaddrs, [circuit]);
      expect(restored.displayName, 'Emily');

      // Absent field = unknown, not "not live".
      final legacy = PhonePeerRecord.fromJson({
        'ownerId': 'envoy:owner:old',
        'libp2pPeerId': '12D3KooWOld',
        'multiaddrs': const [circuit],
        'profile': const <String, dynamic>{},
      });
      expect(legacy.hopFreshUntilMs, isNull);
      expect(hopSlotForRecord(legacy), isNull);
    });

    test('upsertPeer lets the newest report win, including a clear', () {
      final store = PhoneSocialStore();
      store.upsertPeer(PhonePeerRecord(
        ownerId: 'envoy:owner:peer',
        libp2pPeerId: '12D3KooWPeer',
        multiaddrs: const [circuit],
        hopFreshUntilMs: hopFreshUntilForReport(true, nowMs: 1000),
      ));

      // A silent refresh must not wipe the known-good report.
      store.upsertPeer(const PhonePeerRecord(
        ownerId: 'envoy:owner:peer',
        libp2pPeerId: '12D3KooWPeer',
      ));
      expect(store.peerFor('envoy:owner:peer')!.hopFreshUntilMs, 1000 + phoneHopFreshWindowMs);

      // An explicit "no hop now" clears it.
      store.upsertPeer(PhonePeerRecord(
        ownerId: 'envoy:owner:peer',
        libp2pPeerId: '12D3KooWPeer',
        hopFreshUntilMs: hopFreshUntilForReport(false),
      ));
      expect(hopSlotForRecord(store.peerFor('envoy:owner:peer')!), isFalse);
    });
  });

  group('MeshPeerHit.dialable', () {
    test('a direct address dials without a relay slot', () {
      const hit = MeshPeerHit(
        nodeId: '12D3KooWPeer',
        ownerId: 'envoy:owner:peer',
        multiaddrs: ['/ip4/192.168.1.9/tcp/4001/p2p/12D3KooWPeer'],
        hasHopSlot: false,
      );
      expect(hit.dialable, isTrue);
    });

    test('circuit-only addresses need the hop report', () {
      const circuitOnly = MeshPeerHit(
        nodeId: '12D3KooWPeer',
        ownerId: 'envoy:owner:peer',
        multiaddrs: ['/p2p/12D3KooWRelay/p2p-circuit/p2p/12D3KooWPeer'],
        hasHopSlot: false,
      );
      expect(circuitOnly.dialable, isFalse);

      const hopLive = MeshPeerHit(
        nodeId: '12D3KooWPeer',
        ownerId: 'envoy:owner:peer',
        multiaddrs: ['/p2p/12D3KooWRelay/p2p-circuit/p2p/12D3KooWPeer'],
        hasHopSlot: true,
      );
      expect(hopLive.dialable, isTrue);

      // Silent source: the relay only hands out circuit addrs for live peers.
      const silent = MeshPeerHit(
        nodeId: '12D3KooWPeer',
        ownerId: 'envoy:owner:peer',
        multiaddrs: ['/p2p/12D3KooWRelay/p2p-circuit/p2p/12D3KooWPeer'],
      );
      expect(silent.dialable, isTrue);
    });

    test('nothing to dial is not dialable', () {
      const empty = MeshPeerHit(
        nodeId: '12D3KooWPeer',
        ownerId: 'relay:12D3KooWPeer',
      );
      expect(empty.dialable, isFalse);
      expect(allAddressesNeedRelayHop(const []), isFalse);
      expect(allAddressesNeedRelayHop(const ['/ip4/1.2.3.4/tcp/4001/p2p/x']), isFalse);
      expect(allAddressesNeedRelayHop(const ['/p2p/r/p2p-circuit/p2p/x']), isTrue);
    });
  });
}
