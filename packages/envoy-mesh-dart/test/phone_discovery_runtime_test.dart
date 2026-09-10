import 'package:envoy_mesh/envoy_mesh.dart';
import 'package:test/test.dart';

class _FakeHost implements PhoneDiscoveryHost {
  _FakeHost({this.peerId = '12D3KooSelf'});

  final String peerId;
  final List<String> provided = [];
  final Map<String, List<PhoneDiscoveryProvider>> providersByTopic = {};
  List<String> reachable = const [];

  @override
  String? get libp2pPeerId => peerId;

  @override
  List<String> relayAdvertisedMultiaddrs() => reachable;

  @override
  Future<void> provideCapabilityTopic(String topic) async {
    provided.add(topic);
  }

  @override
  Future<List<PhoneDiscoveryProvider>> findCapabilityTopicProviders(
    String topic, {
    int maxResults = 20,
  }) async {
    return providersByTopic[topic] ?? const [];
  }
}

void main() {
  group('PhoneDiscoveryRuntime', () {
    test('advertise provides profile topics', () async {
      final host = _FakeHost();
      final runtime = PhoneDiscoveryRuntime(host: host);
      final topics = await runtime.advertise(const PhoneDiscoveryAdvertisement(
        ownerId: 'envoy:owner:alice',
        libp2pPeerId: '12D3KooSelf',
        displayName: 'Alice',
        profile: {
          'hobbies': ['chess'],
        },
      ));
      expect(topics, contains('displayname:alice'));
      expect(topics, contains('interest:chess'));
      expect(host.provided, containsAll(topics));
    });

    test('buildCheckinPayload includes topicHash ads + circuit addrs', () {
      final host = _FakeHost()
        ..reachable = [
          '/p2p/12D3KooRelay/p2p-circuit/p2p/12D3KooSelf',
        ];
      final runtime = PhoneDiscoveryRuntime(
        host: host,
        relayBootstrapAddrs: const [
          '/ip4/1.2.3.4/tcp/4001/p2p/12D3KooRelay',
        ],
      );
      final payload = runtime.buildCheckinPayload(
        ad: const PhoneDiscoveryAdvertisement(
          ownerId: 'envoy:owner:alice',
          libp2pPeerId: '12D3KooSelf',
          displayName: 'Alice',
          profile: {'hobbies': ['music']},
        ),
      );
      expect(payload['peerId'], '12D3KooSelf');
      expect(payload['ownerId'], 'envoy:owner:alice');
      expect(
        payload['relayReachableAddrs'],
        ['/p2p/12D3KooRelay/p2p-circuit/p2p/12D3KooSelf'],
      );
      final ads = payload['advertisements'] as List;
      expect(
        ads.any((a) => a is Map && a['capability'] == 'mesh.discovery'),
        isTrue,
      );
      final musicHash = cidStringForCapabilityTopic('interest:music');
      expect(
        ads.any((a) => a is Map && a['topicHash'] == musicHash),
        isTrue,
      );
    });

    test('buildCheckinPayload publishes circuit addrs for all reserved relays', () {
      final host = _FakeHost()
        ..reachable = [
          '/p2p/12D3KooCnRelay/p2p-circuit/p2p/12D3KooSelf',
          '/p2p/12D3KooUsRelay/p2p-circuit/p2p/12D3KooSelf',
        ];
      final runtime = PhoneDiscoveryRuntime(host: host);
      final payload = runtime.buildCheckinPayload(
        ad: const PhoneDiscoveryAdvertisement(
          ownerId: 'envoy:owner:alice',
          libp2pPeerId: '12D3KooSelf',
        ),
      );
      expect(
        payload['relayReachableAddrs'],
        [
          '/p2p/12D3KooCnRelay/p2p-circuit/p2p/12D3KooSelf',
          '/p2p/12D3KooUsRelay/p2p-circuit/p2p/12D3KooSelf',
        ],
      );
    });

    test('searchDht + mergeHits prefers owner-bearing relay hits', () async {
      final host = _FakeHost()
        ..providersByTopic['interest:music'] = const [
          PhoneDiscoveryProvider(
            peerId: '12D3KooBob',
            multiaddrs: ['/ip4/10.0.0.2/tcp/4001/p2p/12D3KooBob'],
          ),
        ];
      final runtime = PhoneDiscoveryRuntime(host: host);
      final dht = await runtime.searchDht(
        selfLibp2pPeerId: '12D3KooSelf',
        queryTopics: const ['interest:music'],
      );
      expect(dht.single.nodeId, '12D3KooBob');
      expect(dht.single.ownerId, isEmpty);

      final relay = runtime.hitsFromRelayCandidates(
        const [
          RelayLookupCandidate(
            peerId: '12D3KooBob',
            ownerId: 'envoy:owner:bob',
            displayName: 'Bob',
            multiaddrs: [
              '/p2p/12D3KooRelay/p2p-circuit/p2p/12D3KooBob',
            ],
          ),
        ],
        selfLibp2pPeerId: '12D3KooSelf',
        selfOwnerId: 'envoy:owner:alice',
      );
      final merged = PhoneDiscoveryRuntime.mergeHits(
        [...dht, ...relay],
        selfLibp2pPeerId: '12D3KooSelf',
        selfOwnerId: 'envoy:owner:alice',
      );
      expect(merged, hasLength(1));
      expect(merged.single.ownerId, 'envoy:owner:bob');
      expect(merged.single.displayName, 'Bob');
      expect(merged.single.multiaddrs, isNotEmpty);
    });

    test('hitsFromRelayCandidates invents a relay (not LAN) provisional owner', () {
      final host = _FakeHost();
      final runtime = PhoneDiscoveryRuntime(host: host);
      final hits = runtime.hitsFromRelayCandidates(
        const [
          RelayLookupCandidate(
            peerId: '12D3KooPublic',
            ownerId: '',
            displayName: 'Emily',
            multiaddrs: [],
          ),
        ],
        selfLibp2pPeerId: '12D3KooSelf',
        selfOwnerId: 'envoy:owner:alice',
      );
      expect(hits, hasLength(1));
      // `relay:` — a WAN roster hit with no hop is findable, not LAN-dialable.
      expect(hits.single.ownerId, provisionalRelayOwnerId('12D3KooPublic'));
      expect(isProvisionalRelayOwnerId(hits.single.ownerId), isTrue);
      expect(isProvisionalLanOwnerId(hits.single.ownerId), isFalse);
      expect(isProvisionalOwnerId(hits.single.ownerId), isTrue);
      expect(hits.single.displayName, 'Emily');
    });

    test('hitsFromRelayCandidates labels a nameless relay hit', () {
      final host = _FakeHost();
      final runtime = PhoneDiscoveryRuntime(host: host);
      final hits = runtime.hitsFromRelayCandidates(
        const [
          RelayLookupCandidate(
            peerId: '12D3KooWNameless',
            ownerId: '',
            displayName: null,
            multiaddrs: [],
          ),
        ],
        selfLibp2pPeerId: '12D3KooSelf',
        selfOwnerId: 'envoy:owner:alice',
      );
      expect(hits.single.displayName, 'Peer (12D3KooW…less)');
    });
  });

  group('relay envelope factory', () {
    test('system envelope + lookup parse', () {
      final device = generateDeviceIdentity();
      final unsigned = buildUnsignedSystemEnvelope(
        device: device,
        intent: 'relay.lookup',
        payload: buildRelayLookupPayload(
          queryId: 'q1',
          topicHash: cidStringForCapabilityTopic('interest:music'),
          expiresAt: expiresAtFromNow(const Duration(minutes: 5)),
        ),
      );
      expect(unsigned['senderRole'], 'system');
      expect(unsigned['intent'], 'relay.lookup');
      final signed = signEnvoyEnvelope(unsigned, device.privateKeyPem);
      expect(verifyEnvoyEnvelope(signed), isTrue);

      final peers = parseRelayLookupPeers({
        'queryId': 'q1',
        'peers': [
          {
            'peerId': '12D3KooX',
            'ownerId': 'envoy:owner:x',
            'multiaddrs': ['/p2p/r/p2p-circuit/p2p/12D3KooX'],
          },
        ],
      });
      expect(peers.single['ownerId'], 'envoy:owner:x');
    });
  });

  group('PhoneSocialBackend wanSearch', () {
    test('merges WAN hits into searchPeers', () async {
      final persona = PhonePersona(
        owner: generateOwnerIdentity(),
        device: generateDeviceIdentity(),
      );
      final transport = FakeMeshEnvelopeTransport();
      final backend = PhoneSocialBackend(
        persona: persona,
        transport: transport,
        wanSearch: ({topic, interests, peerId, maxResults = 20}) async {
          return [
            MeshPeerHit(
              nodeId: '12D3KooWan',
              ownerId: 'envoy:owner:wan',
              displayName: 'Wan',
              multiaddrs: const ['/p2p/r/p2p-circuit/p2p/12D3KooWan'],
            ),
          ];
        },
      );
      await backend.rememberPeer(const PhonePeerRecord(
        ownerId: 'envoy:owner:local',
        libp2pPeerId: '12D3KooLocal',
        displayName: 'Local',
      ));
      final hits = await backend.searchPeers(maxResults: 10);
      expect(hits.map((h) => h.ownerId), contains('envoy:owner:local'));
      expect(hits.map((h) => h.ownerId), contains('envoy:owner:wan'));
    });

    test('replaceWanSearch(null) restores local-only', () async {
      final persona = PhonePersona(
        owner: generateOwnerIdentity(),
        device: generateDeviceIdentity(),
      );
      final backend = PhoneSocialBackend(
        persona: persona,
        transport: FakeMeshEnvelopeTransport(),
        wanSearch: ({topic, interests, peerId, maxResults = 20}) async => [
          const MeshPeerHit(
            nodeId: '12D3KooWan',
            ownerId: 'envoy:owner:wan',
          ),
        ],
      );
      expect((await backend.searchPeers()).length, 1);
      backend.replaceWanSearch(null);
      expect(await backend.searchPeers(), isEmpty);
    });

    test('searchPeers merges WAN multiaddrs into known local peer', () async {
      final persona = PhonePersona(
        owner: generateOwnerIdentity(),
        device: generateDeviceIdentity(),
      );
      final backend = PhoneSocialBackend(
        persona: persona,
        transport: FakeMeshEnvelopeTransport(),
        wanSearch: ({topic, interests, peerId, maxResults = 20}) async => [
          const MeshPeerHit(
            nodeId: '12D3KooLocal',
            ownerId: 'envoy:owner:local',
            displayName: 'Updated',
            multiaddrs: ['/ip4/10.0.0.2/tcp/4001/p2p/12D3KooLocal'],
          ),
        ],
      );
      await backend.rememberPeer(const PhonePeerRecord(
        ownerId: 'envoy:owner:local',
        libp2pPeerId: '12D3KooLocal',
        displayName: 'Local',
        devicePeerId: 'envoy_devicekey',
        multiaddrs: ['/ip4/10.0.0.1/tcp/4001/p2p/12D3KooLocal'],
      ));
      final hits = await backend.searchPeers(maxResults: 10);
      expect(hits, hasLength(1));
      expect(hits.single.displayName, 'Updated');
      expect(hits.single.multiaddrs, contains('/ip4/10.0.0.2/tcp/4001/p2p/12D3KooLocal'));
      expect(hits.single.multiaddrs, contains('/ip4/10.0.0.1/tcp/4001/p2p/12D3KooLocal'));
      final stored = backend.store.peerFor('envoy:owner:local');
      expect(stored?.devicePeerId, 'envoy_devicekey');
    });
  });

  group('upsertPeer merge', () {
    test('preserves devicePeerId when discovery refreshes addrs', () {
      final store = PhoneSocialStore();
      store.upsertPeer(const PhonePeerRecord(
        ownerId: 'envoy:owner:x',
        libp2pPeerId: '12D3KooX',
        devicePeerId: 'envoy_dev',
        displayName: 'X',
        profile: {'bio': 'hi'},
      ));
      store.upsertPeer(const PhonePeerRecord(
        ownerId: 'envoy:owner:x',
        libp2pPeerId: '12D3KooX',
        multiaddrs: ['/ip4/1.2.3.4/tcp/4001/p2p/12D3KooX'],
      ));
      final p = store.peerFor('envoy:owner:x')!;
      expect(p.devicePeerId, 'envoy_dev');
      expect(p.displayName, 'X');
      expect(p.profile['bio'], 'hi');
      expect(p.multiaddrs, isNotEmpty);
    });

    test('real owner removes provisional lan: placeholder for same peer', () {
      final store = PhoneSocialStore();
      final libp2p = '12D3KooLanPeer';
      store.upsertPeer(PhonePeerRecord(
        ownerId: provisionalLanOwnerId(libp2p),
        libp2pPeerId: libp2p,
        displayName: 'Nearby',
        multiaddrs: const ['/ip4/10.0.0.9/tcp/4001/p2p/12D3KooLanPeer'],
      ));
      expect(store.peersByOwner.keys, contains(provisionalLanOwnerId(libp2p)));
      store.upsertPeer(PhonePeerRecord(
        ownerId: 'envoy:owner:real',
        libp2pPeerId: libp2p,
        displayName: 'Real',
      ));
      expect(store.peerFor(provisionalLanOwnerId(libp2p)), isNull);
      expect(store.peerFor('envoy:owner:real')?.displayName, 'Real');
    });
  });

  group('relay lookup response gate', () {
    test('accepts placeholder only when dialed trusted relay', () {
      final placeholder = <String, Object?>{
        'intent': 'relay.lookup.response',
        'signature': relayControlResponsePlaceholder,
        'senderPublicKey': relayControlResponsePlaceholder,
        'payload': {'peers': []},
      };
      expect(
        isAcceptableRelayLookupResponse(
          placeholder,
          dialedTrustedRelay: true,
        ),
        isTrue,
      );
      expect(
        isAcceptableRelayLookupResponse(
          placeholder,
          dialedTrustedRelay: false,
        ),
        isFalse,
      );
      expect(
        isAcceptableRelayLookupResponse(
          {...placeholder, 'intent': 'chat.message'},
          dialedTrustedRelay: true,
        ),
        isFalse,
      );
    });
  });
}
