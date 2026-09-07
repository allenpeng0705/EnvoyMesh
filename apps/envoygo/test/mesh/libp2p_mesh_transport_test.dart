import 'package:envoy_mesh/envoy_mesh.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('FakeMeshEnvelopeTransport returns chat.delivered when expectReply',
      () async {
    final fake = FakeMeshEnvelopeTransport();
    final result = await fake.sendEnvelope(
      dialTarget: '/p2p/12D3',
      protocolId: envoyChatProtocol,
      envelope: {'intent': 'chat.message'},
      expectReply: true,
    );
    expect(result.ok, isTrue);
    expect(result.replyEnvelope?['intent'], 'chat.delivered');
    expect(fake.sent.single['protocolId'], envoyChatProtocol);
  });
}
