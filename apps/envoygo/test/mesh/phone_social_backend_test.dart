import 'dart:async';

import 'package:envoy_mesh/envoy_mesh.dart';
import 'package:envoy_mesh/envoy_mesh_social.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  late PhonePersona alice;
  late PhonePersona bob;
  late FakeMeshEnvelopeTransport transport;
  late PhoneSocialBackend backend;

  setUp(() async {
    alice = await PhoneIdentityStore.memory().create();
    bob = await PhoneIdentityStore.memory().create();
    transport = FakeMeshEnvelopeTransport();
    backend = PhoneSocialBackend(persona: alice, transport: transport);
  });

  tearDown(() async {
    await backend.dispose();
  });

  group('profile', () {
    test('default profile has ownerId', () async {
      final p = await backend.getHumanProfile();
      expect(p!['ownerId'], alice.ownerId);
      expect(p['displayName'], 'EnvoyGo');
    });

    test('updateHumanProfile persists displayName', () async {
      await backend.updateHumanProfile({'displayName': 'Alice Phone'});
      final p = await backend.getHumanProfile();
      expect(p!['displayName'], 'Alice Phone');
      expect(backend.store.profile['displayName'], 'Alice Phone');
    });
  });

  group('discover (local directory MVP)', () {
    test('searchPeers returns remembered peers matching topic', () async {
      await backend.rememberPeer(PhonePeerRecord(
        ownerId: bob.ownerId,
        libp2pPeerId: '12D3KooWBobPeerIdxxxxxxxxxxxxxxxxxxxxxx',
        devicePeerId: bob.devicePeerId,
        displayName: 'Bob Desktop',
        multiaddrs: ['/ip4/1.2.3.4/tcp/4001/p2p/12D3KooWBobPeerIdxxxxxxxxxxxxxxxxxxxxxx'],
        profile: {
          'interests': ['music'],
        },
      ));
      final hits = await backend.searchPeers(topic: 'bob');
      expect(hits, hasLength(1));
      expect(hits.first.ownerId, bob.ownerId);
      expect(hits.first.displayName, 'Bob Desktop');

      final byInterest = await backend.searchPeers(interests: ['music']);
      expect(byInterest, hasLength(1));

      final miss = await backend.searchPeers(topic: 'zzz-nope');
      expect(miss, isEmpty);
    });
  });

  group('hello / bonds', () {
    test('sendHello signs bond.request on message protocol', () async {
      await backend.rememberPeer(PhonePeerRecord(
        ownerId: bob.ownerId,
        libp2pPeerId: '12D3KooWBob',
        devicePeerId: bob.devicePeerId,
        displayName: 'Bob',
        multiaddrs: ['/p2p/12D3KooWBob'],
      ));
      await backend.updateHumanProfile({'displayName': 'Alice'});

      final result = await backend.sendHello(
        targetOwnerId: bob.ownerId,
        profile: {'displayName': 'Alice'},
        message: 'Hi from phone',
      );
      expect(result['ok'], true);
      expect(transport.sent, hasLength(1));
      expect(transport.sent.first['protocolId'], envoyMessageProtocol);

      final env = Map<String, Object?>.from(
        transport.sent.first['envelope'] as Map,
      );
      expect(verifyEnvoyEnvelope(env), isTrue);
      expect(env['intent'], 'bond.request');
      expect(env['senderPeerId'], alice.devicePeerId);
      final payload = env['payload'] as Map;
      expect(payload['requesterOwnerId'], alice.ownerId);
      expect(payload['message'], contains('[HELLO]'));
    });

    test('acceptBond sends bond.accept and upgrades to direct', () async {
      await backend.rememberPeer(PhonePeerRecord(
        ownerId: bob.ownerId,
        libp2pPeerId: '12D3KooWBob',
        devicePeerId: bob.devicePeerId,
        multiaddrs: ['/p2p/12D3KooWBob'],
      ));

      final established = Completer<SocialPushEvent>();
      backend.events.listen((e) {
        if (e.type == 'bond:established') established.complete(e);
      });

      final result = await backend.acceptBond(peerOwnerId: bob.ownerId);
      expect(result['ok'], true);
      expect(transport.sent.last['protocolId'], envoyMessageProtocol);
      final env = Map<String, Object?>.from(
        transport.sent.last['envelope'] as Map,
      );
      expect(env['intent'], 'bond.accept');
      expect(verifyEnvoyEnvelope(env), isTrue);

      final bonds = await backend.getBonds();
      expect(bonds.single.ownerId, bob.ownerId);
      expect(bonds.single.bondLevel, 'direct');

      final ev = await established.future.timeout(const Duration(seconds: 1));
      expect(ev.data['peerOwnerId'], bob.ownerId);
    });

    test('inbound bond.request queues pending hello', () async {
      final bobBackend = PhoneSocialBackend(
        persona: bob,
        transport: FakeMeshEnvelopeTransport(),
      );
      final unsigned = buildUnsignedEnvelope(
        device: alice.device,
        intent: 'bond.request',
        recipientPeerId: bob.devicePeerId,
        payload: buildBondRequestPayload(
          requesterOwnerId: alice.ownerId,
          requesterDisplayName: 'Alice',
          message: 'Hello',
        ),
      );
      final signed = signEnvoyEnvelope(unsigned, alice.device.privateKeyPem);

      await bobBackend.handleInboundEnvelope(
        protocolId: envoyMessageProtocol,
        envelope: signed,
        remoteLibp2pPeerId: '12D3KooWAliceLibp2p',
      );

      expect(bobBackend.store.pendingHellos, hasLength(1));
      expect(bobBackend.store.pendingHellos.first.fromOwnerId, alice.ownerId);
      expect(bobBackend.store.peerFor(alice.ownerId)?.libp2pPeerId,
          '12D3KooWAliceLibp2p');
      await bobBackend.dispose();
    });
  });

  group('1:1 chat', () {
    test('sendChat expects chat.delivered and persists outbound', () async {
      await backend.rememberPeer(PhonePeerRecord(
        ownerId: bob.ownerId,
        libp2pPeerId: '12D3KooWBob',
        devicePeerId: bob.devicePeerId,
        multiaddrs: ['/p2p/12D3KooWBob'],
      ));

      transport.onSend = (dial, protocol, envelope) {
        expect(protocol, envoyChatProtocol);
        expect(envelope['intent'], 'chat.message');
        final ackUnsigned = buildUnsignedEnvelope(
          device: bob.device,
          intent: 'chat.delivered',
          recipientPeerId: alice.devicePeerId,
          payload: buildChatDeliveredPayload(
            messageId: envelope['messageId'] as String,
            recipientOwnerId: bob.ownerId,
          ),
        );
        return MeshSendResult(
          ok: true,
          replyEnvelope:
              signEnvoyEnvelope(ackUnsigned, bob.device.privateKeyPem),
        );
      };

      final result = await backend.sendChat(bob.ownerId, 'ping');
      expect(result['ok'], true);
      expect(result['delivered'], true);

      final history = await backend.listChatHistory(bob.ownerId);
      expect(history, hasLength(1));
      expect(history.first.text, 'ping');
      expect(history.first.isOutbound, true);
      expect(history.first.threadId, phoneDmThreadId(bob.ownerId));
    });

    test('inbound chat.message persists and returns chat.delivered ack',
        () async {
      final unsigned = buildUnsignedEnvelope(
        device: bob.device,
        intent: 'chat.message',
        recipientPeerId: alice.devicePeerId,
        payload: buildChatMessagePayload(
          senderOwnerId: bob.ownerId,
          text: 'hello alice',
        ),
      );
      final signed = signEnvoyEnvelope(unsigned, bob.device.privateKeyPem);

      final chatEvents = <SocialPushEvent>[];
      backend.events.listen(chatEvents.add);

      final ack = await backend.handleInboundEnvelope(
        protocolId: envoyChatProtocol,
        envelope: signed,
        remoteLibp2pPeerId: '12D3KooWBob',
      );

      expect(ack, isNotNull);
      expect(ack!['intent'], 'chat.delivered');
      expect(verifyEnvoyEnvelope(ack), isTrue);
      final ackPayload = ack['payload'] as Map;
      expect(ackPayload['messageId'], signed['messageId']);
      expect(ackPayload['recipientOwnerId'], alice.ownerId);

      final history = await backend.listChatHistory(bob.ownerId);
      expect(history.single.text, 'hello alice');
      expect(history.single.isOutbound, false);

      await Future<void>.delayed(Duration.zero);
      expect(
        chatEvents.any((e) => e.type == 'chat:message'),
        isTrue,
      );
    });

    test('rejects tampered inbound envelope', () async {
      final unsigned = buildUnsignedEnvelope(
        device: bob.device,
        intent: 'chat.message',
        payload: buildChatMessagePayload(
          senderOwnerId: bob.ownerId,
          text: 'x',
        ),
      );
      final signed = signEnvoyEnvelope(unsigned, bob.device.privateKeyPem);
      signed['payload'] = {'senderOwnerId': bob.ownerId, 'text': 'tampered'};

      final ack = await backend.handleInboundEnvelope(
        protocolId: envoyChatProtocol,
        envelope: signed,
        remoteLibp2pPeerId: '12D3KooWBob',
      );
      expect(ack, isNull);
      expect(await backend.listChatHistory(bob.ownerId), isEmpty);
    });
  });

  group('store snapshot', () {
    test('encode/loadSnapshot round-trips bonds and messages', () async {
      await backend.rememberPeer(PhonePeerRecord(
        ownerId: bob.ownerId,
        libp2pPeerId: '12D3',
        displayName: 'Bob',
      ));
      backend.store.upsertBond(BondContact(
        ownerId: bob.ownerId,
        displayName: 'Bob',
        bondLevel: 'direct',
      ));
      backend.store.appendMessage(MeshChatMessage(
        id: 'm1',
        threadId: phoneDmThreadId(bob.ownerId),
        senderOwnerId: alice.ownerId,
        text: 'hi',
        createdAt: '2026-09-07T00:00:00.000Z',
        isOutbound: true,
      ));

      final raw = backend.store.encodeSnapshot();
      final restored = PhoneSocialStore()..loadSnapshot(raw);
      expect(restored.bonds[bob.ownerId]?.bondLevel, 'direct');
      expect(restored.peerFor(bob.ownerId)?.displayName, 'Bob');
      expect(restored.history(bob.ownerId).single.text, 'hi');
    });
  });

  group('context isolation', () {
    test('contextId is phone-local and owner is phone persona', () {
      expect(backend.contextId, phoneLocalContextId);
      expect(backend.ownerId, isNot(bob.ownerId));
      expect(backend.ownerId, alice.ownerId);
    });
  });
}
