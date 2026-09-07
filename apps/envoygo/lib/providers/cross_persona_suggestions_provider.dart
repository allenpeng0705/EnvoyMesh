/// Riverpod: Home ↔ phone bonded-contact suggestions (S5).
library;

import 'dart:convert';

import 'package:envoy_mesh/envoy_mesh.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../mesh/social_model_adapters.dart';
import '../storage/secure_storage.dart';
import 'contact_provider.dart';
import 'node_provider.dart';
import 'social_context_provider.dart';

class CrossPersonaSuggestionsState {
  const CrossPersonaSuggestionsState({
    this.suggestions = const [],
    this.isLoading = false,
    this.error,
  });

  final List<CrossPersonaSuggestion> suggestions;
  final bool isLoading;
  final String? error;

  CrossPersonaSuggestionsState copyWith({
    List<CrossPersonaSuggestion>? suggestions,
    bool? isLoading,
    String? error,
  }) {
    return CrossPersonaSuggestionsState(
      suggestions: suggestions ?? this.suggestions,
      isLoading: isLoading ?? this.isLoading,
      error: error,
    );
  }
}

final crossPersonaSuggestionsProvider = StateNotifierProvider<
    CrossPersonaSuggestionsNotifier, CrossPersonaSuggestionsState>((ref) {
  final n = CrossPersonaSuggestionsNotifier(ref);
  ref.listen(socialContextProvider, (_, __) => n.refresh());
  ref.listen(contactProvider, (_, __) => n.refresh());
  ref.listen(phoneSocialBackendProvider, (_, __) => n.refresh());
  ref.listen(nodeProvider, (_, __) => n.refresh());
  return n;
});

class CrossPersonaSuggestionsNotifier
    extends StateNotifier<CrossPersonaSuggestionsState> {
  CrossPersonaSuggestionsNotifier(this._ref)
      : super(const CrossPersonaSuggestionsState()) {
    refresh();
  }

  final Ref _ref;
  static const _dismissKey = 'cross_persona_dismissed_v1';

  Future<Set<String>> _loadDismissed(String targetKind) async {
    final raw = await SecureStorage().read(_dismissKey);
    if (raw == null || raw.isEmpty) return {};
    try {
      final map = jsonDecode(raw) as Map<String, dynamic>;
      final list = map[targetKind];
      if (list is! List) return {};
      return list.map((e) => e.toString()).where((e) => e.isNotEmpty).toSet();
    } catch (_) {
      return {};
    }
  }

  Future<void> _saveDismissed(String targetKind, Set<String> ids) async {
    final storage = SecureStorage();
    Map<String, dynamic> map = {};
    final raw = await storage.read(_dismissKey);
    if (raw != null && raw.isNotEmpty) {
      try {
        map = Map<String, dynamic>.from(jsonDecode(raw) as Map);
      } catch (_) {}
    }
    map[targetKind] = ids.toList();
    await storage.write(_dismissKey, jsonEncode(map));
  }

  Future<void> dismiss(String ownerId) async {
    final ctx = _ref.read(socialContextProvider);
    final kind = ctx.isPhone ? 'phone' : 'home';
    final dismissed = await _loadDismissed(kind);
    dismissed.add(ownerId);
    await _saveDismissed(kind, dismissed);
    await refresh();
  }

  Future<void> refresh() async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      final ctx = _ref.read(socialContextProvider);
      final nodeState = _ref.read(nodeProvider);
      final phoneBackend = _ref.read(phoneSocialBackendProvider);

      // Need a paired home to suggest across personas.
      if (nodeState.activeNode == null && nodeState.pairedNodes.isEmpty) {
        state = const CrossPersonaSuggestionsState();
        return;
      }

      final phoneBonds = phoneBackend == null
          ? const <BondContact>[]
          : await phoneBackend.getBonds();
      final phonePeerIds = <String, String>{};
      if (phoneBackend != null) {
        for (final peer in phoneBackend.store.peersByOwner.values) {
          phonePeerIds[peer.ownerId] = peer.libp2pPeerId;
        }
      }

      List<BondContact> homeBonds = const [];
      if (ctx.isPhone) {
        // Active phone: pull Home bonds via RPC if connected.
        final client = _ref.read(nodeServiceProvider);
        if (client != null) {
          try {
            homeBonds = (await client.getBonds())
                .map(bondFromContact)
                .toList();
          } catch (_) {
            homeBonds = const [];
          }
        }
      } else {
        // Active Home: use current contact list (already Home bonds).
        homeBonds =
            _ref.read(contactProvider).bonds.map(bondFromContact).toList();
      }

      final dismissed =
          await _loadDismissed(ctx.isPhone ? 'phone' : 'home');

      if (ctx.isPhone) {
        final targetIds = phoneBonds.map((b) => b.ownerId).toSet();
        final suggestions = buildCrossPersonaSuggestions(
          sourceBonds: homeBonds,
          source: CrossPersonaSource.home,
          targetBondedOwnerIds: targetIds,
          dismissedOwnerIds: dismissed,
          selfOwnerIdOnTarget: phoneBackend?.ownerId,
        );
        state = CrossPersonaSuggestionsState(suggestions: suggestions);
      } else {
        final targetIds = homeBonds.map((b) => b.ownerId).toSet();
        final suggestions = buildCrossPersonaSuggestions(
          sourceBonds: phoneBonds,
          source: CrossPersonaSource.phone,
          targetBondedOwnerIds: targetIds,
          dismissedOwnerIds: dismissed,
          selfOwnerIdOnTarget: nodeState.ownerId,
          libp2pPeerIdByOwner: phonePeerIds,
        );
        state = CrossPersonaSuggestionsState(suggestions: suggestions);
      }
    } catch (e) {
      state = CrossPersonaSuggestionsState(error: e.toString());
    }
  }

  /// Say Hello on the *active* persona for [suggestion] (no auto-bond).
  Future<Map<String, dynamic>> sayHello(CrossPersonaSuggestion suggestion) async {
    final backend = _ref.read(socialBackendProvider);
    if (backend == null) {
      return {'ok': false, 'error': 'Social backend not ready'};
    }
    final profile = await backend.getHumanProfile() ??
        {'displayName': 'EnvoyGo', 'ownerId': backend.ownerId};
    final message =
        'Hello from ${suggestion.source == CrossPersonaSource.home ? 'my phone' : 'my home'} — we already know each other on the other identity.';

    if (_ref.read(socialContextProvider).isPhone &&
        backend is PhoneSocialBackend) {
      // Ensure dial map has an entry before sendHello.
      final peer = backend.store.peerFor(suggestion.ownerId);
      if (peer == null) {
        // Try local discover by name / owner id.
        final hits = await backend.searchPeers(
          topic: suggestion.displayName ?? suggestion.ownerId,
          maxResults: 10,
        );
        final hit = hits.where((h) => h.ownerId == suggestion.ownerId).firstOrNull;
        if (hit != null) {
          await backend.rememberPeer(PhonePeerRecord(
            ownerId: hit.ownerId,
            libp2pPeerId: hit.nodeId,
            displayName: hit.displayName ?? suggestion.displayName,
          ));
        } else if (suggestion.libp2pPeerId != null &&
            suggestion.libp2pPeerId!.isNotEmpty) {
          await backend.rememberPeer(PhonePeerRecord(
            ownerId: suggestion.ownerId,
            libp2pPeerId: suggestion.libp2pPeerId!,
            displayName: suggestion.displayName,
          ));
        } else {
          return {
            'ok': false,
            'error':
                'Find this person on Discover first so this phone can reach them on the mesh.',
          };
        }
      }
    }

    final result = await backend.sendHello(
      targetOwnerId: suggestion.ownerId,
      profile: profile,
      message: message,
    );
    if (result['ok'] == true) {
      await refresh();
    }
    return result;
  }
}
