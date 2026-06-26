import 'package:envoygo/models/peer_connection_info.dart';
import 'package:envoygo/utils/contact_reachability_label.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('contactReachabilityLabel', () {
    test('returns checking when info is null', () {
      expect(contactReachabilityLabel(null), 'Checking…');
      expect(contactReachabilityLabel(null, checking: true), 'Checking…');
    });

    test('returns offline when not connected', () {
      expect(
        contactReachabilityLabel(PeerConnectionInfo.offline),
        'Offline',
      );
    });

    test('returns direct and relay labels', () {
      expect(
        contactReachabilityLabel(
          const PeerConnectionInfo(connected: true, direct: true),
        ),
        'Online · Direct',
      );
      expect(
        contactReachabilityLabel(
          const PeerConnectionInfo(connected: true, direct: false),
        ),
        'Online · Relay',
      );
    });
  });
}
