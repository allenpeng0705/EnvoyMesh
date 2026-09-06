import 'package:envoy_thin_client/models/stored_node.dart';
import 'package:envoy_thin_client/services/candidate_resolver.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('CandidateResolver', () {
    test('does not emit a relay candidate whose base equals the LAN ws URL', () {
      CandidateResolver.setCommunityHomePeerId('12D3KooWHomeNode');
      final resolver = CandidateResolver();
      final node = StoredNode(
        id: 'n1',
        name: 'home',
        ownerId: 'envoy:owner:test',
        homePeerId: '12D3KooWHomeNode',
        lanIp: 'ws://192.168.3.85:3030/ws',
        // QR fallback when no relay was configured: relayWsUrl ?? wsUrl where
        // wsUrl == lanWsUrl. This is NOT a real relay.
        relayWsUrl: 'ws://192.168.3.85:3030/ws',
        pairedAt: DateTime.now(),
      );
      final candidates =
          resolver.resolve(node, sessionToken: 'tok', isOnWifi: false);

      final names = candidates.map((c) => c.name).toList();
      // The fake relay (same base as LAN) is not tried as a relay — it would
      // dial the home's own /ws server (which does not speak the proxy
      // protocol) and can only burn time.
      expect(names.where((n) => n == 'relay'), isEmpty);
      // LAN + the built-in community relay fallback remain.
      expect(names, contains('lan'));
      expect(names, contains('community-relay'));
    });

    test('keeps a real relay candidate when its base differs from LAN', () {
      CandidateResolver.setCommunityHomePeerId('12D3KooWHomeNode');
      final resolver = CandidateResolver();
      final node = StoredNode(
        id: 'n2',
        name: 'home',
        ownerId: 'envoy:owner:test',
        homePeerId: '12D3KooWHomeNode',
        lanIp: 'ws://192.168.3.85:3030/ws',
        relayWsUrl: 'wss://relay.example.com/ws',
        pairedAt: DateTime.now(),
      );
      final candidates =
          resolver.resolve(node, sessionToken: 'tok', isOnWifi: false);

      final names = candidates.map((c) => c.name).toList();
      expect(names, contains('relay'));
    });
  });
}
