import 'package:envoy_mesh/envoy_mesh.dart';
import 'package:envoygo/mesh/social_model_adapters.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('peerFromMesh', () {
    test('carries multiaddrs and hop status into the UI model', () {
      const hit = MeshPeerHit(
        nodeId: '12D3KooWPeer',
        ownerId: 'envoy:owner:peer',
        displayName: 'Emily',
        interests: ['music'],
        profileVisibility: 'public',
        multiaddrs: ['/p2p/12D3KooWRelay/p2p-circuit/p2p/12D3KooWPeer'],
        hasHopSlot: false,
      );

      final peer = peerFromMesh(hit);
      expect(peer.nodeId, '12D3KooWPeer');
      expect(peer.ownerId, 'envoy:owner:peer');
      expect(peer.displayName, 'Emily');
      expect(peer.interests, ['music']);
      expect(peer.profileVisibility, 'public');
      // Regression guard: dropping either field re-enables Say Hello for a peer
      // the relay says has no live hop.
      expect(peer.multiaddrs, isNotEmpty);
      expect(peer.hasHopSlot, isFalse);
      expect(peer.dialable, isFalse);
    });

    test('keeps a live hop and a silent source dialable by address', () {
      const live = MeshPeerHit(
        nodeId: '12D3KooWLive',
        ownerId: 'envoy:owner:live',
        multiaddrs: ['/p2p/12D3KooWRelay/p2p-circuit/p2p/12D3KooWLive'],
        hasHopSlot: true,
      );
      expect(peerFromMesh(live).dialable, isTrue);

      const lan = MeshPeerHit(
        nodeId: '12D3KooWLan',
        ownerId: 'lan:12D3KooWLan',
        multiaddrs: ['/ip4/192.168.1.9/tcp/4001/p2p/12D3KooWLan'],
      );
      final lanPeer = peerFromMesh(lan);
      expect(lanPeer.hasHopSlot, isNull);
      expect(lanPeer.dialable, isTrue);
    });
  });
}
