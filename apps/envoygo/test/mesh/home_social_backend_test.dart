import 'package:envoy_mesh/envoy_mesh.dart';
import 'package:envoy_thin_client/services/home_remote_client.dart';
import 'package:envoygo/mesh/home_social_backend.dart';
import 'package:envoygo/models/chat_message.dart';
import 'package:envoygo/models/contact.dart';
import 'package:envoygo/models/peer_search_result.dart';
import 'package:envoygo/services/node_service_client.dart';
import 'package:flutter_test/flutter_test.dart';

class _StubClient extends NodeServiceClient {
  _StubClient()
      : super(HomeRemoteClient(const HomeRemoteClientOptions(
          resolveCandidates: _emptyCandidates,
        )));

  static Future<List<HomeRemoteCandidate>> _emptyCandidates() async =>
      const [];

  List<Contact> bonds = const [];
  final List<Map<String, dynamic>> hellos = [];

  @override
  Future<List<Contact>> getBonds() async => bonds;

  @override
  Future<List<PeerSearchResult>> searchPeers({
    String? topic,
    List<String>? topics,
    List<String>? interests,
    int maxResults = 20,
  }) async =>
      const [];

  @override
  Future<Map<String, dynamic>> sendHello({
    required String targetOwnerId,
    required Map<String, dynamic> profile,
    required String message,
  }) async {
    hellos.add({
      'targetOwnerId': targetOwnerId,
      'message': message,
    });
    return {'ok': true, 'decision': 'sent'};
  }

  @override
  Future<Map<String, dynamic>> getHumanProfile() async =>
      {'ownerId': 'envoy:owner:home', 'displayName': 'Home'};

  @override
  Future<Map<String, dynamic>> updateHumanProfile(
    Map<String, dynamic> patch,
  ) async =>
      {'ownerId': 'envoy:owner:home', ...patch};

  @override
  Future<Map<String, dynamic>> getPeerProfile(String ownerId) async =>
      {'ownerId': ownerId};

  @override
  Future<Map<String, dynamic>> sendChat(
    String targetOwnerId,
    String text, {
    List<Map<String, dynamic>>? attachments,
    String? listingId,
  }) async =>
      {'ok': true, 'messageId': 'm1'};

  @override
  Future<List<ChatMessage>> listChatHistory(
    String peerOwnerId, {
    String? before,
    int? limit,
    String? threadId,
    String? selfOwnerId,
    String? selfFamilyProfileId,
  }) async =>
      [
        ChatMessage(
          id: 'm1',
          threadId: peerOwnerId,
          senderOwnerId: 'envoy:owner:home',
          text: 'hi',
          createdAt: '2026-09-07T00:00:00.000Z',
          isOutbound: true,
        ),
      ];

  @override
  void Function() on(String event, void Function(dynamic) handler) => () {};
}

void main() {
  test('HomeSocialBackend maps RPC bonds to BondContact', () async {
    final client = _StubClient()
      ..bonds = [
        const Contact(
          ownerId: 'envoy:owner:friend',
          displayName: 'Friend',
          bondLevel: 'direct',
        ),
      ];
    final backend = HomeSocialBackend(
      nodeId: 'home-1',
      client: client,
      ownerIdReader: () => 'envoy:owner:home',
    );
    expect(backend.contextId, 'home-1');
    expect(backend.ownerId, 'envoy:owner:home');
    final bonds = await backend.getBonds();
    expect(bonds.single, isA<BondContact>());
    expect(bonds.single.ownerId, 'envoy:owner:friend');

    final hello = await backend.sendHello(
      targetOwnerId: 'envoy:owner:friend',
      profile: {'displayName': 'Home'},
      message: 'hi',
    );
    expect(hello['ok'], true);
    expect(client.hellos, hasLength(1));

    final history = await backend.listChatHistory('envoy:owner:friend');
    expect(history.single.text, 'hi');
    await backend.dispose();
  });
}
