import 'package:envoy_mesh/envoy_mesh.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  late EnvoyDeviceIdentity device;

  setUp(() async {
    device = (await PhoneIdentityStore.memory().create()).device;
  });

  test('bond request payload includes HELLO prefix and requesterOwnerId', () {
    final p = buildBondRequestPayload(
      requesterOwnerId: 'envoy:owner:abc',
      requesterDisplayName: 'Ada',
      message: 'hi',
    );
    expect(p['message'], '[HELLO] hi');
    expect(p['requestedLevel'], 'direct');
    expect(p['proofOfContext'], 'displayName:Ada');
  });

  test('unsigned chat envelope has human roles', () {
    final env = buildUnsignedEnvelope(
      device: device,
      intent: 'chat.message',
      payload: buildChatMessagePayload(
        senderOwnerId: 'envoy:owner:x',
        text: 'yo',
      ),
    );
    expect(env['senderRole'], 'human');
    expect(env['recipientRole'], 'human');
    expect(env['senderPeerId'], device.peerId);
    expect(env['version'], '0.1');
  });

  test('chat.delivered payload includes deliveredAt', () {
    final p = buildChatDeliveredPayload(
      messageId: 'm1',
      recipientOwnerId: 'envoy:owner:y',
    );
    expect(p['messageId'], 'm1');
    expect(p['deliveredAt'], isNotEmpty);
  });
}
