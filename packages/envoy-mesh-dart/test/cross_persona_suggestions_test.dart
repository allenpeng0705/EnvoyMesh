import 'package:envoy_mesh/envoy_mesh.dart';
import 'package:test/test.dart';

void main() {
  group('buildCrossPersonaSuggestions', () {
    test('suggests source bonds not yet on target, by ownerId only', () {
      final source = [
        const BondContact(
          ownerId: 'envoy:owner:alice',
          displayName: 'Alice',
          bondLevel: 'direct',
        ),
        const BondContact(
          ownerId: 'envoy:owner:bob',
          displayName: 'Bob',
          bondLevel: 'direct',
        ),
      ];
      final suggestions = buildCrossPersonaSuggestions(
        sourceBonds: source,
        source: CrossPersonaSource.home,
        targetBondedOwnerIds: {'envoy:owner:bob'},
      );
      expect(suggestions, hasLength(1));
      expect(suggestions.single.ownerId, 'envoy:owner:alice');
      expect(suggestions.single.source, CrossPersonaSource.home);
    });

    test('skips dismissed, self, and device ids', () {
      final source = [
        const BondContact(
          ownerId: 'envoy:owner:me',
          displayName: 'Me',
          bondLevel: 'direct',
        ),
        const BondContact(
          ownerId: 'envoy_device_abc',
          displayName: 'Device',
          bondLevel: 'direct',
        ),
        const BondContact(
          ownerId: 'envoy:owner:carol',
          displayName: 'Carol',
          bondLevel: 'direct',
        ),
      ];
      final suggestions = buildCrossPersonaSuggestions(
        sourceBonds: source,
        source: CrossPersonaSource.phone,
        targetBondedOwnerIds: {},
        dismissedOwnerIds: {'envoy:owner:carol'},
        selfOwnerIdOnTarget: 'envoy:owner:me',
      );
      expect(suggestions, isEmpty);
    });

    test('never auto-merges — already bonded on target excluded', () {
      final source = [
        const BondContact(
          ownerId: 'envoy:owner:alice',
          displayName: 'Alice',
          bondLevel: 'direct',
        ),
      ];
      final suggestions = buildCrossPersonaSuggestions(
        sourceBonds: source,
        source: CrossPersonaSource.home,
        targetBondedOwnerIds: {'envoy:owner:alice'},
      );
      expect(suggestions, isEmpty);
    });
  });
}
