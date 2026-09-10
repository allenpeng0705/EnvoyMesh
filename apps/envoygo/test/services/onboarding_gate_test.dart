import 'package:envoygo/services/onboarding_gate.dart';
import 'package:flutter_test/flutter_test.dart';

/// With the mobile node off (the default) every feature runs on a home node, so
/// pairing is offered up front — but it must never *block* the user: choosing
/// "Pair later" opens the shell exactly as before.
void main() {
  group('needsPairingGate', () {
    test('unpaired + mobile node off → guide first', () {
      expect(
        needsPairingGate(
          mobileNodeEnabled: false,
          hasActiveNode: false,
          pairingDeferred: false,
        ),
        isTrue,
      );
    });

    test('"Pair later" opens the shell and stays open', () {
      expect(
        needsPairingGate(
          mobileNodeEnabled: false,
          hasActiveNode: false,
          pairingDeferred: true,
        ),
        isFalse,
      );
    });

    test('paired → no gate', () {
      expect(
        needsPairingGate(
          mobileNodeEnabled: false,
          hasActiveNode: true,
          pairingDeferred: false,
        ),
        isFalse,
      );
    });

    test('mobile node on → unpaired use is a supported mode', () {
      expect(
        needsPairingGate(
          mobileNodeEnabled: true,
          hasActiveNode: false,
          pairingDeferred: false,
        ),
        isFalse,
      );
    });
  });

  group('shouldSayPairingRequired', () {
    test('true while unpaired with the mobile node off — even after deferring', () {
      expect(
        shouldSayPairingRequired(
          mobileNodeEnabled: false,
          hasActiveNode: false,
        ),
        isTrue,
      );
    });

    test('false once paired or when the phone mesh is available', () {
      expect(
        shouldSayPairingRequired(
          mobileNodeEnabled: false,
          hasActiveNode: true,
        ),
        isFalse,
      );
      expect(
        shouldSayPairingRequired(
          mobileNodeEnabled: true,
          hasActiveNode: false,
        ),
        isFalse,
      );
    });
  });
}
