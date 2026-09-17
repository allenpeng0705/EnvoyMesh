// The family's candidate walk, tested where it lives.
//
// These are the rules the EnvoyDev phone relies on but does not own: the order rungs are tried in,
// how a peer id and a set of addresses become a direct dial rather than a self-referential circuit,
// and when the shared community relay is offered at all.

import 'package:envoy_thin_client/models/stored_node.dart';
import 'package:envoy_thin_client/services/candidate_resolver.dart';
import 'package:test/test.dart';

const home = '12D3KooWhome';
const relay = '12D3KooWrelay';
const directAddr = '/ip4/192.168.1.9/tcp/4001/p2p/$home';
const relayAddr = '/ip4/47.93.11.212/tcp/4001/p2p/$relay';
// A genuine circuit path that already ends at the home: the relay's id is the first hop, the home's
// id is the destination. Same shape as [relayAddr] plus a circuit segment, which is exactly the
// ambiguity the classifier resolves by reading the final `/p2p/` component.
const relayCircuitAddr =
    '/ip4/47.93.11.212/tcp/4001/p2p/$relay/p2p-circuit/p2p/$home';

StoredNode node({
  String homePeerId = home,
  List<String> bootstrapPeers = const [],
  String? lanIp,
  String? relayWsUrl,
  String? publicHost,
}) =>
    StoredNode(
      id: 'n',
      name: 'home',
      ownerId: 'o',
      homePeerId: homePeerId,
      lanIp: lanIp,
      relayWsUrl: relayWsUrl,
      publicHost: publicHost,
      publicPort: 4770,
      pairedAt: DateTime(2026),
      bootstrapPeers: bootstrapPeers,
    );

List<String> namesOf(List<Object> candidates) =>
    candidates.map((c) => (c as dynamic).name as String).toList();

void main() {
  setUp(() => CandidateResolver.setCommunityHomePeerId(home));

  test('the walk is LAN → public → P2P → bootstrap → relay last', () {
    const resolver = CandidateResolver();
    final candidates = resolver.resolve(
      node(
        lanIp: 'ws://192.168.1.9:4770/ws',
        publicHost: 'example.com',
        relayWsUrl: 'wss://relay.example/ws',
        bootstrapPeers: [directAddr, 'ws://relay-b.example/ws'],
      ),
      sessionToken: 'tok',
      isOnWifi: true,
    );

    expect(namesOf(candidates), [
      'lan',
      'public',
      'p2p-direct',
      'p2p-cn-relay',
      'relay',
      // The WebSocket entry in `bootstrapPeers` is the second relay base, not a P2P hop: a relay
      // roster rides in that list for historical reasons, and `_buildRelayWsCandidates` owns it.
      'relay-1',
      'community-relay',
    ]);
  });

  test('a home-addressed multiaddr is dialled directly, not as its own relay', () {
    const resolver = CandidateResolver();
    final direct = resolver
        .resolve(node(bootstrapPeers: [directAddr]), sessionToken: 'tok')
        .where((c) => c.name.startsWith('p2p-direct'))
        .toList();

    expect(direct, hasLength(1));
    // The address itself. The bug this replaces produced `/p2p/<home>/p2p-circuit/p2p/<home>`.
    expect(direct.single.url, directAddr);
    expect(direct.single.libp2pRelayAddr, directAddr);
  });

  test('a circuit address the payload already carries is dialled as it stands', () {
    const resolver = CandidateResolver();
    final candidates = resolver
        .resolve(node(bootstrapPeers: [relayCircuitAddr]), sessionToken: 'tok');
    final candidate =
        candidates.firstWhere((c) => c.url == relayCircuitAddr);

    // The whole address, hop included, not a hop built through the relay it already names.
    expect(candidate.libp2pRelayAddr, relayCircuitAddr);
    // The relay's id is the first hop, never the destination: reading the last `/p2p/` blindly would
    // make the home peer id the relay's and dial the wrong peer.
    expect(candidate.homePeerId, home);
    expect(candidates.map((c) => c.homePeerId), isNot(contains(relay)));
    expect(
      candidates.where((c) => c.url == '/p2p/$relay/p2p-circuit/p2p/$home'),
      isEmpty,
    );
  });

  test('an advertised circuit is labelled a relay route, never p2p-direct', () {
    const resolver = CandidateResolver();
    // Regression: `_addressNamesHome` returned true for *any* address containing `/p2p-circuit/`, so
    // this two-hop route — relay first, home at the destination — was shown to the user as
    // `p2p-direct`. The dial was always the circuit; only the label was wrong.
    final circuitOnly = resolver
        .resolve(node(bootstrapPeers: [relayCircuitAddr]), sessionToken: 'tok');
    expect(circuitOnly.where((c) => c.name.startsWith('p2p-direct')), isEmpty);
    expect(
      circuitOnly.firstWhere((c) => c.url == relayCircuitAddr).name,
      'p2p-cn-relay',
    );

    // The two shapes are not conflated: a plain home address is still a direct dial, and the circuit
    // beside it still names its relay.
    final mixed = resolver.resolve(
      node(bootstrapPeers: [directAddr, relayCircuitAddr]),
      sessionToken: 'tok',
      isOnWifi: true,
    );
    expect(
      mixed.where((c) => c.name.startsWith('p2p-direct')).single.url,
      directAddr,
    );
    expect(
      mixed.where((c) => c.url == relayCircuitAddr).single.name,
      'p2p-cn-relay',
    );
  });

  test('duplicate home addresses collapse and blanks are dropped from the P2P rungs', () {
    const resolver = CandidateResolver();
    final candidates = resolver.resolve(
      node(bootstrapPeers: [directAddr, '', directAddr]),
      sessionToken: 'tok',
      // Wi-Fi keeps both rungs, so the always-present cn-relay hop is still visible and the count
      // below proves the empty entry added nothing rather than being hidden by the cap.
      isOnWifi: true,
    );
    final direct =
        candidates.where((c) => c.name.startsWith('p2p-direct')).toList();

    // One address, one rung — the second copy is the same dial, not a second attempt.
    expect(direct, hasLength(1));
    expect(direct.single.url, directAddr);
    // An empty entry names no peer and no relay, so it builds no P2P rung.
    expect(
      candidates.where(
          (c) => c.name.startsWith('p2p-') && !c.name.startsWith('p2p-direct')),
      hasLength(1), // only the always-present cn-relay hop
    );
  });

  test('a relay address still becomes a circuit hop through that relay', () {
    const resolver = CandidateResolver();
    final hops = resolver
        .resolve(node(bootstrapPeers: [relayAddr]), sessionToken: 'tok')
        .where((c) => c.name.startsWith('p2p-') && !c.name.startsWith('p2p-direct'))
        .toList();

    final throughRelay =
        hops.firstWhere((c) => c.url.contains('/p2p/$relay/p2p-circuit/'));
    expect(throughRelay.url, '/p2p/$relay/p2p-circuit/p2p/$home');
    expect(throughRelay.libp2pRelayAddr, relayAddr);
  });

  test('no peer id, no P2P rung at all', () {
    const resolver = CandidateResolver();
    final candidates = resolver.resolve(
      node(homePeerId: '', bootstrapPeers: [directAddr]),
      sessionToken: 'tok',
    );
    expect(candidates.where((c) => c.name.startsWith('p2p-')), isEmpty);
  });

  test('the P2P cap spends its slot on the direct address, not a relay hop', () {
    const resolver = CandidateResolver();
    // Cellular: one P2P candidate, and both a direct address and a relay hop are on offer. A direct
    // address is one hop instead of two.
    final p2p = resolver
        .resolve(
          node(bootstrapPeers: [directAddr, relayAddr]),
          sessionToken: 'tok',
          isOnWifi: false,
        )
        .where((c) => c.name.startsWith('p2p-'))
        .toList();
    expect(p2p.map((c) => c.name), ['p2p-direct']);
    expect(p2p.single.url, directAddr);
  });

  test('communityRelayRequiresPeerId defaults to false, so EnvoyGo keeps its token-only rung', () {
    expect(const CandidateResolver().communityRelayRequiresPeerId, isFalse);
  });

  test('the community relay needs a peer id to route to when asked to', () {
    const strict = CandidateResolver(communityRelayRequiresPeerId: true);
    // The resolver reads the id from its process-wide community setting, which a caller makes
    // per-connect; leaving it unset is exactly the "no peer id" case.
    CandidateResolver.setCommunityHomePeerId(null);
    expect(
      strict
          .resolve(node(homePeerId: '', bootstrapPeers: const []), sessionToken: 'tok')
          .where((c) => c.name == 'community-relay'),
      isEmpty,
    );

    // Without the flag the token-only fallback stays, which is what EnvoyGo relies on.
    const lenient = CandidateResolver();
    expect(
      lenient
          .resolve(node(homePeerId: '', bootstrapPeers: const []), sessionToken: 'tok')
          .where((c) => c.name == 'community-relay'),
      hasLength(1),
    );
  });

  test('the token reaches every WebSocket candidate exactly once', () {
    const resolver = CandidateResolver();
    final candidates = resolver.resolve(
      node(lanIp: 'ws://192.168.1.9:4770/ws', relayWsUrl: 'wss://relay.example/ws'),
      sessionToken: 'tok',
    );
    for (final candidate in candidates) {
      if (!candidate.url.startsWith('ws')) continue;
      expect('token='.allMatches(candidate.url).length, 1, reason: candidate.url);
    }
  });
}
