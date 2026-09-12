import 'package:envoy_mesh/envoy_mesh.dart';
import 'package:envoy_mesh/envoy_mesh_social.dart';
import 'package:envoygo/mesh/social_model_adapters.dart';
import 'package:envoygo/providers/chat_provider.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('chatContextNodeId helpers: phoneDmThreadId matches namespace', () {
    const peer = 'envoy:owner:abc';
    expect(phoneDmThreadId(peer), '$phoneLocalContextId:$peer');
    expect(
      threadPeerSuffix(phoneDmThreadId(peer), phoneLocalContextId),
      peer,
    );
  });

  test('chatFromMesh maps outbound flag for phone history merge', () {
    final mesh = MeshChatMessage(
      id: 'm1',
      threadId: phoneDmThreadId('envoy:owner:peer'),
      senderOwnerId: 'envoy:owner:me',
      text: 'hi',
      createdAt: '2026-09-07T00:00:00.000Z',
      isOutbound: true,
    );
    final ui = chatFromMesh(mesh);
    expect(ui.id, 'm1');
    expect(ui.isOutbound, isTrue);
    expect(ui.threadId, phoneDmThreadId('envoy:owner:peer'));
  });
}
