import 'package:envoygo/models/contact.dart';
import 'package:envoygo/providers/contact_provider.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('filterSelfBonds', () {
    test('drops the owner’s own self-bond', () {
      final bonds = [
        const Contact(
          ownerId: 'envoy:owner:self',
          displayName: 'Self',
          bondLevel: 'direct',
        ),
        const Contact(
          ownerId: 'envoy:owner:alice',
          displayName: 'Alice',
          bondLevel: 'direct',
        ),
      ];
      final filtered = filterSelfBonds(bonds, 'envoy:owner:self');
      expect(filtered.map((c) => c.ownerId), ['envoy:owner:alice']);
    });

    test('drops envoy_device_ bonds even when selfOwnerId is null', () {
      // Regression: shared-identity devices appear as `envoy_device_<...>`
      // bonds. If `selfOwnerId` is somehow null (e.g. before
      // _syncAllData populates it), we still must not show the user
      // themselves in the contacts list.
      final bonds = [
        const Contact(
          ownerId: 'envoy_device_local',
          displayName: 'This phone',
          bondLevel: 'direct',
        ),
        const Contact(
          ownerId: 'envoy:owner:alice',
          displayName: 'Alice',
          bondLevel: 'direct',
        ),
      ];
      final filtered = filterSelfBonds(bonds, null);
      expect(filtered.map((c) => c.ownerId), ['envoy:owner:alice']);
    });

    test('drops envoy_device_ bonds when selfOwnerId is set', () {
      // Regression: a previous version of syncBonds only checked
      // selfOwnerId, so the device-keyed self contact leaked through
      // every time a bond:established event fired.
      final bonds = [
        const Contact(
          ownerId: 'envoy_device_local',
          displayName: 'This phone',
          bondLevel: 'direct',
        ),
        const Contact(
          ownerId: 'envoy:owner:self',
          displayName: 'Self',
          bondLevel: 'direct',
        ),
        const Contact(
          ownerId: 'envoy:owner:alice',
          displayName: 'Alice',
          bondLevel: 'direct',
        ),
      ];
      final filtered = filterSelfBonds(bonds, 'envoy:owner:self');
      expect(filtered.map((c) => c.ownerId), ['envoy:owner:alice']);
    });

    test('keeps contacts that merely share a prefix but are not self',
        () {
      // Sanity: a contact whose id happens to contain the substring
      // "envoy_device_" (e.g. an owner id that includes it) should
      // only be dropped if it actually starts with the prefix.
      final bonds = [
        const Contact(
          ownerId: 'envoy:owner:not_envoy_device_alice',
          displayName: 'Alice',
          bondLevel: 'direct',
        ),
      ];
      final filtered = filterSelfBonds(bonds, 'envoy:owner:self');
      expect(filtered, hasLength(1));
      expect(filtered.first.displayName, 'Alice');
    });
  });
}
