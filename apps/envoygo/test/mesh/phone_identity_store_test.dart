import 'package:envoy_mesh/envoy_mesh.dart';
import 'package:envoy_mesh/envoy_mesh_social.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('PhoneIdentityStore', () {
    test('load returns null when empty', () async {
      final store = PhoneIdentityStore.memory();
      expect(await store.load(), isNull);
    });

    test('create persists owner and device with stable ids', () async {
      final backing = <String, String>{};
      final store = PhoneIdentityStore.memory(backing);
      final persona = await store.create();

      expect(persona.ownerId.startsWith('envoy:owner:'), isTrue);
      expect(persona.devicePeerId.startsWith('envoy_'), isTrue);
      expect(persona.device.peerId, derivePeerId(persona.device.publicKeyPem));
      expect(persona.owner.ownerId, deriveOwnerId(persona.owner.publicKeyPem));

      // Four PEM keys stored
      expect(backing.keys, containsAll([
        PhoneIdentityStore.ownerPublicKey,
        PhoneIdentityStore.ownerPrivateKey,
        PhoneIdentityStore.devicePublicKey,
        PhoneIdentityStore.devicePrivateKey,
      ]));

      final loaded = await store.load();
      expect(loaded, isNotNull);
      expect(loaded!.ownerId, persona.ownerId);
      expect(loaded.devicePeerId, persona.devicePeerId);
      expect(loaded.owner.privateKeyPem, persona.owner.privateKeyPem);
      expect(loaded.device.privateKeyPem, persona.device.privateKeyPem);
    });

    test('loadOrCreate is idempotent', () async {
      final store = PhoneIdentityStore.memory();
      final first = await store.loadOrCreate();
      final second = await store.loadOrCreate();
      expect(second.ownerId, first.ownerId);
      expect(second.devicePeerId, first.devicePeerId);
    });

    test('clear removes persona; loadOrCreate makes a new one', () async {
      final store = PhoneIdentityStore.memory();
      final first = await store.loadOrCreate();
      await store.clear();
      expect(await store.load(), isNull);
      final second = await store.loadOrCreate();
      expect(second.ownerId, isNot(first.ownerId));
      expect(second.devicePeerId, isNot(first.devicePeerId));
    });

    test('corrupt partial keys yield null load', () async {
      final backing = <String, String>{
        PhoneIdentityStore.ownerPublicKey: 'only-owner-pub',
      };
      final store = PhoneIdentityStore.memory(backing);
      expect(await store.load(), isNull);
    });

    test('owner and device keys are distinct keypairs', () async {
      final persona = await PhoneIdentityStore.memory().create();
      expect(persona.owner.publicKeyPem, isNot(persona.device.publicKeyPem));
      expect(persona.ownerId, isNot(persona.devicePeerId));
    });
  });

  group('bootstrap_addrs', () {
    test('community relay constants match packages/api default-bootstrap', () {
      expect(
        defaultEnvoyCommunityRelayBootstrapAddr,
        '/ip4/47.93.11.212/tcp/4001/p2p/12D3KooWLNR4WYWHBswe8ux5zWsy6cuGywnYPJbdbaAbbpmJMjbo',
      );
      expect(
        defaultEnvoyUsRelayBootstrapAddr,
        '/ip4/47.251.91.97/tcp/4001/p2p/12D3KooWAWiVSpsCjpjauz83ijLugxwScRJi89N4PA1VQ1Czsncb',
      );
      expect(defaultEnvoyCommunityRelayBootstrapAddrs, hasLength(2));
    });

    test('peerIdFromBootstrapMultiaddr extracts p2p id', () {
      expect(
        peerIdFromBootstrapMultiaddr(defaultEnvoyCommunityRelayBootstrapAddr),
        '12D3KooWLNR4WYWHBswe8ux5zWsy6cuGywnYPJbdbaAbbpmJMjbo',
      );
      expect(peerIdFromBootstrapMultiaddr('/ip4/1.2.3.4/tcp/1'), isNull);
      expect(peerIdFromBootstrapMultiaddr('/ip4/1.2.3.4/tcp/1/p2p/'), isNull);
    });
  });
}
