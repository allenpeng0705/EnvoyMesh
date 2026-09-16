import 'package:envoy_thin_client/services/pairing_uri.dart' as pairing;
import 'package:flutter_test/flutter_test.dart';

import 'package:envoygo/services/product/pairing_service.dart';

/// **The phone half of "my app pairs only with my desktop app".**
///
/// `PairingService.appMismatch` is where EnvoyGo applies the shared rule. Without it the
/// scan screen dials whatever `wsUrl` the scanned code contains, so an EnvoyDev QR
/// would pair this phone with the wrong product's desktop app — and no other side can
/// catch it, because the token inside the code is opaque and app-local.
void main() {
  PairingData dataWith(String? app) => PairingData(
        token: 't',
        wsUrl: 'ws://127.0.0.1:3030/ws',
        relayWsUrl: 'ws://127.0.0.1:3030/ws',
        ownerId: 'envoy:owner:alice',
        app: app,
      );

  test('accepts a code from this product', () {
    expect(PairingService.appMismatch(dataWith('EnvoyMesh')), isNull);
  });

  test('accepts a code that names no app', () {
    // Codes minted before the field existed must keep working: refusing them would break
    // every QR already printed, and the phone still has to authenticate afterwards.
    expect(PairingService.appMismatch(dataWith(null)), isNull);
  });

  test('refuses another product, and says what to do', () {
    final message = PairingService.appMismatch(dataWith('EnvoyDev'));
    expect(message, isNotNull);
    expect(message, contains('EnvoyDev'));
    expect(message, contains('EnvoyMesh'));
    expect(message, anyOf(contains('show its pairing code'), contains('install')));
  });

  test('the app name it compares against is the family default', () {
    // If this drifts from `@envoymesh/protocol`'s DEFAULT_APP_NAME, every code the
    // desktop mints looks foreign to the phone.
    expect(pairing.kDefaultAppName, 'EnvoyMesh');
  });
}
