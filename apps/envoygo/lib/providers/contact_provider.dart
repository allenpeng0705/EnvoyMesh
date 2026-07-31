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

/// Filter out self-identity bonds from a list returned by the home.
///
/// The home node returns a self-bond for the multi-device shared
/// identity, in two shapes:
///   - `envoy:owner:<sha256(ownerPub)>` (the owner's own ID)
///   - `envoy_device_<...>` (a device key tied to the same owner)
///
/// The mobile contacts list must never include the user themselves,
/// so drop both. Pure function, exported so `NodeNotifier._syncBondsDirect`
/// can share the exact same rule.
List<Contact> filterSelfBonds(List<Contact> bonds, String? selfOwnerId) {
  return bonds.where((c) {
    if (selfOwnerId != null && c.ownerId == selfOwnerId) return false;
    if (c.ownerId.startsWith('envoy_device_')) return false;
    return true;
  }).toList();
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
      // See [filterSelfBonds] for the rule; this must stay in sync
      // with the equivalent filter in `NodeNotifier._syncBondsDirect`.
      final filtered = filterSelfBonds(bonds, nodeState.ownerId);

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

  /// Update bonds directly (used by NodeProvider after fetching).
  void setBonds(List<Contact> bonds) {
    state = state.copyWith(bonds: bonds, isLoading: false);
  }

  /// Clear all contacts (used on unpair).
  void clear() {
    state = const ContactState();
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
/// Returns null if not connected. Always reads the live client from
/// [NodeNotifier] on each invalidate — do not cache a null from a
/// reconnect gap (callers that need extra safety can use
/// `ref.read(nodeProvider.notifier).client` directly).
final nodeServiceProvider = Provider<NodeServiceClient?>((ref) {
  ref.watch(nodeProvider);
  final client = ref.read(nodeProvider.notifier).client;
  if (client == null) return null;
  return NodeServiceClient(client);
});
