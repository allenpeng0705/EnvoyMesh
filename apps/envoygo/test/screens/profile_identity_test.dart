import 'package:envoygo/screens/profile/profile_screen.dart';
import 'package:flutter_test/flutter_test.dart';

/// After pairing, the phone persona is the same human on the mesh: an unset
/// phone name must read as the home name (not the "EnvoyGo" placeholder), and
/// a name the user explicitly set on the phone still wins.
void main() {
  group('effectivePhoneDisplayName', () {
    test('falls back to the home name when the phone has none', () {
      expect(
        effectivePhoneDisplayName(phoneName: null, homeName: 'Alice'),
        'Alice',
      );
      expect(
        effectivePhoneDisplayName(phoneName: '   ', homeName: 'Alice'),
        'Alice',
      );
    });

    test('an explicit phone name wins', () {
      expect(
        effectivePhoneDisplayName(phoneName: 'Alice Phone', homeName: 'Alice'),
        'Alice Phone',
      );
    });

    test('unpaired (no home name) stays empty rather than inventing one', () {
      expect(effectivePhoneDisplayName(phoneName: null, homeName: null), '');
      expect(effectivePhoneDisplayName(phoneName: '', homeName: '  '), '');
    });
  });
}
