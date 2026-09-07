import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// Ensures EnvoyGo golden copies stay byte-identical to packages/identity.
void main() {
  test('mesh fixtures match packages/identity companion goldens', () {
    final root = Directory.current.path;
    // flutter test cwd is apps/envoygo
    final identityFixtures = Directory('$root/../../packages/identity/test/fixtures');
    expect(identityFixtures.existsSync(), isTrue,
        reason: 'Run tests from apps/envoygo in the monorepo');

    for (final name in [
      'companion_identity_golden.json',
      'companion_envelope_interop_golden.json',
    ]) {
      final src = File('${identityFixtures.path}/$name');
      final copy = File('$root/test/mesh/fixtures/$name');
      expect(src.existsSync(), isTrue, reason: 'missing source $name');
      expect(copy.existsSync(), isTrue, reason: 'missing copy $name');
      expect(
        copy.readAsBytesSync(),
        src.readAsBytesSync(),
        reason: '$name drifted from packages/identity — re-copy the fixture',
      );
    }
  });
}
