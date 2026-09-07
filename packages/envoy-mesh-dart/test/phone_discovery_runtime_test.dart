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
        wanSearch: ({topic, interests, maxResults = 20}) async {
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
        wanSearch: ({topic, interests, maxResults = 20}) async => [
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
  });
}
