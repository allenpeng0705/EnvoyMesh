import 'package:envoy_mesh_libp2p/envoy_mesh_libp2p.dart';
import 'package:test/test.dart';

void main() {
  group('PhoneSocialBackend discovery lifecycle seam', () {
    test('wanSearch attach then clear on stop-shaped sequence', () async {
      final persona = PhonePersona(
        owner: generateOwnerIdentity(),
        device: generateDeviceIdentity(),
      );
      final backend = PhoneSocialBackend(
        persona: persona,
        transport: FakeMeshEnvelopeTransport(),
      );

      var calls = 0;
      backend.replaceWanSearch(({topic, interests, maxResults = 20}) async {
        calls++;
        return [
          const MeshPeerHit(
            nodeId: '12D3KooRemote',
            ownerId: 'envoy:owner:remote',
            displayName: 'Remote',
          ),
        ];
      });

      final withWan = await backend.searchPeers(topic: 'music');
      expect(calls, 1);
      expect(withWan.single.ownerId, 'envoy:owner:remote');

      backend.replaceWanSearch(null);
      expect(await backend.searchPeers(topic: 'music'), isEmpty);
      expect(calls, 1);
    });
  });

  group('LAN hit merge (S7)', () {
    test('mergeHits keeps LAN multiaddrs and prefers owner-bearing hits', () {
      const lan = MeshPeerHit(
        nodeId: '12D3KooLan',
        ownerId: '',
        multiaddrs: ['/ip4/192.168.1.5/tcp/4001/p2p/12D3KooLan'],
        interests: ['lan'],
      );
      const wan = MeshPeerHit(
        nodeId: '12D3KooLan',
        ownerId: 'envoy:owner:lan',
        displayName: 'Neighbor',
        multiaddrs: ['/p2p/relay/p2p-circuit/p2p/12D3KooLan'],
      );
      final merged = PhoneDiscoveryRuntime.mergeHits(
        [lan, wan],
        selfLibp2pPeerId: '12D3KooSelf',
        selfOwnerId: 'envoy:owner:me',
      );
      expect(merged, hasLength(1));
      expect(merged.single.ownerId, 'envoy:owner:lan');
      expect(merged.single.displayName, 'Neighbor');
      expect(
        merged.single.multiaddrs,
        contains('/ip4/192.168.1.5/tcp/4001/p2p/12D3KooLan'),
      );
      expect(
        merged.single.multiaddrs,
        contains('/p2p/relay/p2p-circuit/p2p/12D3KooLan'),
      );
    });

    test('provisional lan owner id enables Hello target', () {
      final owner = provisionalLanOwnerId('12D3KooOnlyLan');
      expect(isProvisionalLanOwnerId(owner), isTrue);
      expect(owner, 'lan:12D3KooOnlyLan');
      expect(shortLanPeerLabel('12D3KooOnlyLan'), contains('…'));
    });
  });

  group('Libp2pMeshHost surface', () {
    test('tiny host still satisfies session interface', () {
      final host = _TinyHost();
      expect(host.isStarted, isTrue);
      expect(host.reservedRelayPeerId, isNull);
    });
  });

  group('MemoryLibp2pSeedStore', () {
    test('round-trips seed bytes as string', () async {
      final store = MemoryLibp2pSeedStore();
      await store.write('libp2p_identity_seed', 'abc');
      expect(await store.read('libp2p_identity_seed'), 'abc');
    });
  });
}

class _TinyHost implements Libp2pMeshHost {
  @override
  bool get isStarted => true;

  @override
  int get hostEpoch => 1;

  @override
  Set<String> get registeredProtocols => {};

  @override
  String? get reservedRelayPeerId => null;

  @override
  void registerStreamHandler(String protocolId, Libp2pStreamHandler handler) {}

  @override
  void removeStreamHandler(String protocolId) {}

  @override
  Future<void> reserveRelay(String relayMultiaddr) async {}

  @override
  Future<void> releaseRelayReservation() async {}
}
