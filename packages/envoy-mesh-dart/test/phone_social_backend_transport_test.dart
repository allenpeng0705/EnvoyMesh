import 'package:envoy_mesh/envoy_mesh.dart';
import 'package:envoy_mesh/envoy_mesh_social.dart';
import 'package:test/test.dart';

void main() {
  test('PhoneSocialBackend.replaceTransport swaps dial path', () async {
    final persona = await PhoneIdentityStore.memory().create();
    final first = FakeMeshEnvelopeTransport();
    final second = FakeMeshEnvelopeTransport();
    final backend = PhoneSocialBackend(persona: persona, transport: first);

    await backend.rememberPeer(PhonePeerRecord(
      ownerId: 'envoy:owner:peer',
      libp2pPeerId: '12D3KooWPeer',
      displayName: 'Peer',
    ));

    await backend.sendHello(
      targetOwnerId: 'envoy:owner:peer',
      profile: {'displayName': 'Me'},
      message: 'hi',
    );
    expect(first.sent, hasLength(1));
    expect(second.sent, isEmpty);

    backend.replaceTransport(second);
    await backend.sendHello(
      targetOwnerId: 'envoy:owner:peer',
      profile: {'displayName': 'Me'},
      message: 'hi again',
    );
    expect(first.sent, hasLength(1));
    expect(second.sent, hasLength(1));
  });
}
