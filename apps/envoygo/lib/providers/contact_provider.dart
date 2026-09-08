import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../mesh/social_model_adapters.dart';
import '../models/contact.dart';
import '../services/node_service_client.dart';
import '../storage/local_database.dart';
import 'node_provider.dart';
import 'social_context_provider.dart';

/// State for the contacts subsystem (Home + phone sections).
class ContactState {
  final List<Contact> homeBonds;
  final List<Contact> phoneBonds;
  final bool isLoading;

  const ContactState({
    this.homeBonds = const [],
    this.phoneBonds = const [],
    this.isLoading = false,
  });

  /// Combined list (Home first). Prefer [homeBonds] / [phoneBonds] for UI sections.
  List<Contact> get bonds => [...homeBonds, ...phoneBonds];

  ContactState copyWith({
    List<Contact>? homeBonds,
    List<Contact>? phoneBonds,
    bool? isLoading,
  }) {
    return ContactState(
      homeBonds: homeBonds ?? this.homeBonds,
      phoneBonds: phoneBonds ?? this.phoneBonds,
      isLoading: isLoading ?? this.isLoading,
    );
  }
}

/// Filter out self-identity bonds from a list returned by the home.
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

  /// Sync Home and/or phone bonds (both when paired).
  /// When a backend is unreachable, keep the last known list (and fall back
  /// to SQLite for Home) instead of wiping the section blank.
  /// Phone and Home updates are applied independently so a home failure
  /// cannot discard a successful phone fetch (and vice versa).
  Future<void> syncBonds() async {
    final nodeProviderNotifier = _ref.read(nodeProvider.notifier);
    final nodeState = _ref.read(nodeProvider);

    state = state.copyWith(isLoading: true);

    List<Contact>? phoneBonds;
    try {
      final phoneBackend = _ref.read(phoneSocialBackendProvider);
      if (phoneBackend != null) {
        phoneBonds =
            (await phoneBackend.getBonds()).map(contactFromBond).toList();
      }
    } catch (_) {
      // Keep prior phoneBonds.
    }

    List<Contact>? homeBonds;
    try {
      if (nodeState.activeNode != null) {
        final homeId = nodeState.activeNode!.id;
        final homeBackend = _ref.read(homeSocialBackendProvider);
        if (homeBackend != null) {
          homeBonds =
              (await homeBackend.getBonds()).map(contactFromBond).toList();
        } else {
          final client = nodeProviderNotifier.client;
          if (client != null) {
            homeBonds = await _ref.read(nodeServiceProvider)!.getBonds();
          }
        }
        if (homeBonds != null) {
          homeBonds = filterSelfBonds(homeBonds, nodeState.ownerId);
          await _localDb.upsertContacts(
            homeId,
            homeBonds.map((c) => c.toJson()).toList(),
          );
        } else if (state.homeBonds.isEmpty) {
          final rows = await _localDb.getContacts(homeId);
          homeBonds = filterSelfBonds(
            rows.map(Contact.fromJson).toList(),
            nodeState.ownerId,
          );
        }
      }
    } catch (_) {
      // Keep prior homeBonds.
    }

    state = state.copyWith(
      homeBonds: homeBonds ?? state.homeBonds,
      phoneBonds: phoneBonds ?? state.phoneBonds,
      isLoading: false,
    );
  }

  void onBondEstablished() {
    syncBonds();
  }

  /// Home-node revoke only — phone mesh bonds are independent.
  void onBondRevoked(String ownerId) {
    final activeNode = _ref.read(nodeProvider).activeNode;
    if (activeNode != null) {
      _localDb.deleteContact(activeNode.id, ownerId);
    }
    state = state.copyWith(
      homeBonds: state.homeBonds.where((c) => c.ownerId != ownerId).toList(),
    );
  }

  /// Home reconnect updates Home section only (never clobbers phone bonds).
  void setBonds(List<Contact> bonds) {
    state = state.copyWith(homeBonds: bonds, isLoading: false);
  }

  /// Clear Home bonds on unpair — phone mesh contacts stay.
  void clear() {
    state = state.copyWith(homeBonds: const [], isLoading: false);
  }

  Contact? getContact(String ownerId) {
    return state.bonds.where((c) => c.ownerId == ownerId).firstOrNull;
  }
}

final nodeServiceProvider = Provider<NodeServiceClient?>((ref) {
  ref.watch(nodeProvider);
  final client = ref.read(nodeProvider.notifier).client;
  if (client == null) return null;
  return NodeServiceClient(client);
});

/// Sync contacts when pairing / phone backend changes (not a mode switcher).
final socialContextContactSyncProvider = Provider<void>((ref) {
  ref.listen(socialContextProvider, (prev, next) {
    if (prev != next) {
      ref.read(contactProvider.notifier).syncBonds();
    }
  });
  ref.listen(phoneSocialBackendProvider, (prev, next) {
    if (prev != next) {
      ref.read(contactProvider.notifier).syncBonds();
    }
  });
  ref.listen(homeSocialBackendProvider, (prev, next) {
    if (prev != next) {
      ref.read(contactProvider.notifier).syncBonds();
    }
  });
});
