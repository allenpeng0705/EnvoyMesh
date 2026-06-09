import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/contact.dart';
import '../services/node_service_client.dart';
import '../storage/local_database.dart';
import 'node_provider.dart';

/// State for the contacts subsystem.
class ContactState {
  final List<Contact> bonds;
  final bool isLoading;

  const ContactState({
    this.bonds = const [],
    this.isLoading = false,
  });

  ContactState copyWith({List<Contact>? bonds, bool? isLoading}) {
    return ContactState(
      bonds: bonds ?? this.bonds,
      isLoading: isLoading ?? this.isLoading,
    );
  }
}

/// Provider for contacts/bonds state.
final contactProvider =
    StateNotifierProvider<ContactNotifier, ContactState>((ref) {
  return ContactNotifier(ref);
});

class ContactNotifier extends StateNotifier<ContactState> {
  final Ref _ref;
  final LocalDatabase _localDb = LocalDatabase();

  ContactNotifier(this._ref) : super(const ContactState());

  /// Sync bonded contacts from the home node via RPC.
  Future<void> syncBonds() async {
    final nodeProviderNotifier = _ref.read(nodeProvider.notifier);
    final nodeState = _ref.read(nodeProvider);

    final client = nodeProviderNotifier.client;
    if (client == null || nodeState.activeNode == null) return;

    try {
      state = state.copyWith(isLoading: true);
      final bonds = await _ref
          .read(nodeServiceProvider)!
          .getBonds();

      // Cache in local DB.
      await _localDb.upsertContacts(
        nodeState.activeNode!.id,
        bonds.map((c) => c.toJson()).toList(),
      );

      // Filter out self-identity "Mobile" shared-identity contact.
      final selfOwnerId = nodeState.ownerId;
      final filtered = selfOwnerId != null
          ? bonds.where((c) => c.ownerId != selfOwnerId).toList()
          : bonds;

      state = state.copyWith(bonds: filtered, isLoading: false);
    } catch (e) {
      state = state.copyWith(isLoading: false);
    }
  }

  /// Handle a bond:established push event.
  void onBondEstablished() {
    syncBonds();
  }

  /// Handle a bond:revoked push event.
  void onBondRevoked(String ownerId) {
    final activeNode = _ref.read(nodeProvider).activeNode;
    if (activeNode != null) {
      _localDb.deleteContact(activeNode.id, ownerId);
    }
    state = state.copyWith(
      bonds: state.bonds.where((c) => c.ownerId != ownerId).toList(),
    );
  }

  /// Get a contact by owner ID.
  Contact? getContact(String ownerId) {
    return state.bonds
        .where((c) => c.ownerId == ownerId)
        .firstOrNull;
  }
}

/// Typed access to NodeServiceClient via the connected HomeRemoteClient.
///
/// Returns null if not connected.
final nodeServiceProvider = Provider<NodeServiceClient?>((ref) {
  final nodeState = ref.watch(nodeProvider);
  final client = nodeState.activeNode != null
      ? ref.read(nodeProvider.notifier).client
      : null;
  if (client == null) return null;
  return NodeServiceClient(client);
});
