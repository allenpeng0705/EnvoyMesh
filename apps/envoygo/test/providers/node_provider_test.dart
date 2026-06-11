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

    test('NodeState.copyWith sets homeNodeErrorCode when provided', () {
      const initial = NodeState(
        homeNodeErrorCode: 'offline',
      );
      final updated = initial.copyWith(homeNodeErrorCode: 'unauthorized');
      expect(updated.homeNodeErrorCode, 'unauthorized');
    });
  });
}
