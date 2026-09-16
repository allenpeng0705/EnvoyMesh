import 'dart:convert';

import 'package:archive/archive.dart';
import 'package:envoy_thin_client/envoy_thin_client.dart';
import 'package:test/test.dart';

/// Build the compact code exactly as the node does: gzip a payload, base64url it, and
/// put it in `envoy://pair?pairing=…`. This is the form a QR actually carries, so the
/// test has to exercise *this* path rather than the legacy query one.
String compactPairingUri(Map<String, Object?> payload) {
  final compressed = GZipEncoder().encode(utf8.encode(jsonEncode(payload)))!;
  final token = base64Url.encode(compressed).replaceAll('=', '');
  return 'envoy://pair?pairing=$token';
}

/// Which app a pairing code belongs to — the Dart half of "one app per pairing code".
///
/// This is the *only* enforcement point for that rule: the pairing token inside the code
/// is opaque and app-local, so another product's node never validates it, and the node
/// this phone talks to sees only its own token. Without the check below, the outcome of
/// scanning the wrong QR code is that the app dutifully dials the `wsUrl` inside it.
void main() {
  group('parsePairingUri reads the app claim', () {
    test('from the legacy query form', () {
      final data = parsePairingUri(
        'envoy://pair?wsUrl=${Uri.encodeComponent("ws://127.0.0.1:3030/ws")}'
        '&token=t&app=EnvoyDev',
      );
      expect(data, isNotNull);
      expect(data!.app, 'EnvoyDev');
    });

    test('from the compact code a QR actually carries', () {
      final uri = compactPairingUri({
        'v': 1,
        'ws': 'ws://127.0.0.1:3030/ws',
        'tok': 't',
        'oid': 'envoy:owner:alice',
        'app': 'EnvoyDev',
      });
      final data = parsePairingUri(uri);
      expect(data, isNotNull);
      expect(data!.app, 'EnvoyDev');
    });

    test('and leaves it null when the code predates the field', () {
      final data = parsePairingUri(
        'envoy://pair?wsUrl=${Uri.encodeComponent("ws://127.0.0.1:3030/ws")}&token=t',
      );
      expect(data, isNotNull);
      expect(data!.app, isNull);
    });
  });

  group('pairingAppMismatch', () {
    test('accepts its own app, and a code that names none', () {
      expect(pairingAppMismatch('EnvoyDev', 'EnvoyDev'), isNull);
      // Codes minted before the field existed must keep working: refusing them would
      // break every QR already printed, and the phone still has to authenticate.
      expect(pairingAppMismatch(null, 'EnvoyDev'), isNull);
      expect(pairingAppMismatch('   ', 'EnvoyDev'), isNull);
    });

    test('refuses another app, in words the user can act on', () {
      final message = pairingAppMismatch('EnvoyMesh', 'EnvoyDev');
      expect(message, isNotNull);
      expect(message, contains('EnvoyMesh'));
      expect(message, contains('EnvoyDev'));
      expect(message, anyOf(contains('show its pairing code'), contains('install')));
      // The user is the audience: no wire vocabulary.
      expect(message, isNot(contains('token')));
      expect(message, isNot(contains('scope')));
    });

    test('does not let a scanned code put arbitrary text in the dialog', () {
      final message = pairingAppMismatch('${'x' * 200}\u001b[31mEVIL', 'EnvoyDev');
      expect(message, isNotNull);
      expect(message, isNot(contains('\u001b')));
      // The label is capped (the sentence around it is fixed prose).
      expect(RegExp(r'x{41,}').hasMatch(message!), isFalse);
      expect(message, contains('\u2026'));
    });
  });

  test('the default app name matches the node side', () {
    // `@envoymesh/protocol`'s DEFAULT_APP_NAME — the two must agree or every code
    // minted on one side looks foreign to the other.
    expect(kDefaultAppName, 'EnvoyMesh');
  });
}
