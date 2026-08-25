import 'package:envoygo/models/stored_node.dart';
import 'package:envoygo/providers/node_provider.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

void main() {
  group('NodeNotifier', () {
    test('starts in disconnected state', () {
      final container = ProviderContainer();
      addTearDown(container.dispose);
      final state = container.read(nodeProvider);
      expect(state.connectionState, NodeConnectionState.disconnected);
      expect(state.activeNode, isNull);
      expect(state.pairedNodes, isEmpty);
      expect(state.reconnectAttempt, 0);
      expect(state.homeNodeErrorCode, isNull);
      expect(state.lastConnectAttemptAt, isNull);
    });

    test('NodeState.copyWith preserves unset fields', () {
      const initial = NodeState(
        activeNode: null,
        pairedNodes: [],
        connectionState: NodeConnectionState.connected,
        errorMessage: 'first',
        reconnectAttempt: 3,
        homeNodeErrorCode: 'offline',
      );
      final updated = initial.copyWith(
        connectionState: NodeConnectionState.disconnected,
        clearHomeNodeErrorCode: true,
      );
      expect(updated.connectionState, NodeConnectionState.disconnected);
      expect(updated.errorMessage, 'first');
      expect(updated.reconnectAttempt, 3);
      expect(updated.homeNodeErrorCode, isNull);
    });

    test('NodeState.copyWith clears activeNode and ownerId when flagged', () {
      final node = StoredNode(
        id: 'n1',
        name: 'Home',
        ownerId: 'owner-1',
        homePeerId: 'peer-1',
        pairedAt: DateTime.utc(2026, 1, 1),
      );
      final initial = NodeState(
        activeNode: node,
        pairedNodes: [node],
        ownerId: 'owner-1',
        familyProfileId: 'mom',
        isOwnerProfile: false,
        connectionState: NodeConnectionState.connected,
      );
      final cleared = initial.copyWith(
        clearActiveNode: true,
        clearOwnerId: true,
        clearFamilyProfileId: true,
        pairedNodes: const [],
        isOwnerProfile: true,
        familyProfiles: const [],
        connectionState: NodeConnectionState.disconnected,
      );
      expect(cleared.activeNode, isNull);
      expect(cleared.ownerId, isNull);
      expect(cleared.familyProfileId, isNull);
      expect(cleared.pairedNodes, isEmpty);
      expect(cleared.isOwnerProfile, isTrue);
      expect(cleared.connectionState, NodeConnectionState.disconnected);
    });

    test('NodeState.copyWith restores familyProfileId when clear is false', () {
      const initial = NodeState(isOwnerProfile: true);
      final restored = initial.copyWith(
        familyProfileId: 'mom',
        clearFamilyProfileId: false,
        isOwnerProfile: false,
      );
      expect(restored.familyProfileId, 'mom');
      expect(restored.isOwnerProfile, isFalse);
    });

    test('effectiveFamilyProfileId prefers pairing intent over corrupted owner', () {
      const corrupted = NodeState(
        familyProfileId: 'owner',
        pairedFamilyProfileId: 'mom',
        isOwnerProfile: true,
      );
      expect(corrupted.effectiveFamilyProfileId, 'mom');

      const ownerPair = NodeState(
        familyProfileId: 'owner',
        pairedFamilyProfileId: 'owner',
        isOwnerProfile: true,
      );
      expect(ownerPair.effectiveFamilyProfileId, 'owner');

      const legacyMom = NodeState(
        familyProfileId: 'mom',
        isOwnerProfile: false,
      );
      expect(legacyMom.effectiveFamilyProfileId, 'mom');
    });

    test('NodeState.copyWith sets homeNodeErrorCode when provided', () {
      const initial = NodeState(
        homeNodeErrorCode: 'offline',
      );
      final updated = initial.copyWith(homeNodeErrorCode: 'unauthorized');
      expect(updated.homeNodeErrorCode, 'unauthorized');
    });

    test('mayUseCoding is owner-only unless codingEnabled on family profile', () {
      const owner = NodeState(isOwnerProfile: true);
      expect(owner.mayUseCoding, isTrue);

      const denied = NodeState(
        isOwnerProfile: false,
        familyProfileId: 'kid',
        pairedFamilyProfileId: 'kid',
        familyProfiles: [
          {'id': 'kid', 'codingEnabled': false},
        ],
      );
      expect(denied.mayUseCoding, isFalse);

      const allowed = NodeState(
        isOwnerProfile: false,
        familyProfileId: 'kid',
        pairedFamilyProfileId: 'kid',
        familyProfiles: [
          {'id': 'kid', 'codingEnabled': true},
        ],
      );
      expect(allowed.mayUseCoding, isTrue);

      const corruptedOwnerId = NodeState(
        familyProfileId: 'owner',
        pairedFamilyProfileId: 'kid',
        isOwnerProfile: false,
        familyProfiles: [
          {'id': 'kid', 'codingEnabled': true},
        ],
      );
      expect(corruptedOwnerId.mayUseCoding, isTrue);
    });
  });
}
