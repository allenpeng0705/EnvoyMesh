/// Riverpod: Home ↔ phone bonded-contact suggestions (S5).
library;

import 'dart:convert';
import '../services/feature_flags.dart';

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
    // Suggestions are always Home→phone Hello; refresh() loads the 'phone' key.
    const kind = 'phone';
    final dismissed = await _loadDismissed(kind);
    dismissed.add(ownerId);
    await _saveDismissed(kind, dismissed);
    await refresh();
  }

  Future<void> refresh() async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      final nodeState = _ref.read(nodeProvider);
      final phoneBackend = _ref.read(phoneSocialBackendProvider);

      // These suggestions all end in a phone-persona Hello, so they only exist
      // while the mobile node feature is on (otherwise every home bond would be
      // suggested with an action that cannot work).
      if (!_ref.read(mobileNodeEnabledProvider)) {
        state = const CrossPersonaSuggestionsState();
        return;
      }

      // Suggestions live on Discover while paired: Home bonds → Hello on phone.
      if (nodeState.activeNode == null) {
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

      List<BondContact> homeBonds =
          _ref.read(contactProvider).homeBonds.map(bondFromContact).toList();
      if (homeBonds.isEmpty) {
        final client = _ref.read(nodeServiceProvider);
        if (client != null) {
          try {
            homeBonds =
                (await client.getBonds()).map(bondFromContact).toList();
          } catch (_) {
            homeBonds = const [];
          }
        }
      }

      final dismissed = await _loadDismissed('phone');
      final targetIds = phoneBonds.map((b) => b.ownerId).toSet();
      final suggestions = buildCrossPersonaSuggestions(
        sourceBonds: homeBonds,
        source: CrossPersonaSource.home,
        targetBondedOwnerIds: targetIds,
        dismissedOwnerIds: dismissed,
        selfOwnerIdOnTarget: phoneBackend?.ownerId,
        libp2pPeerIdByOwner: phonePeerIds,
      );
      state = CrossPersonaSuggestionsState(suggestions: suggestions);
    } catch (e) {
      state = CrossPersonaSuggestionsState(error: e.toString());
    }
  }

  /// Say Hello on the **phone** persona (Discover is Home when paired).
  Future<Map<String, dynamic>> sayHello(CrossPersonaSuggestion suggestion) async {
    final backend = _ref.read(phoneSocialBackendProvider);
    if (backend == null) {
      return {'ok': false, 'error': 'Phone social is not ready yet'};
    }
    final profile = await backend.getHumanProfile() ??
        {'displayName': 'EnvoyGo', 'ownerId': backend.ownerId};
    final message =
        'Hello from my phone — we already know each other on Home.';

    final peer = backend.store.peerFor(suggestion.ownerId);
    if (peer == null) {
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

    return backend.sendHello(
      targetOwnerId: suggestion.ownerId,
      message: message,
      profile: profile,
    ).then((result) async {
      if (result['ok'] == true) {
        await refresh();
      }
      return result;
    });
  }
}
