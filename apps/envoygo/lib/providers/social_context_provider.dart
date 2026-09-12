/// Social context: Home (paired thin-client) vs On this phone (mesh SDK).
library;

import 'dart:async';
import 'package:envoy_mesh/envoy_mesh.dart';
import 'package:envoy_mesh/envoy_mesh_social.dart';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../mesh/home_social_backend.dart';
import '../mesh/phone_social_local_db.dart';
import '../services/feature_flags.dart';
import '../services/product/node_service_client.dart';
import '../storage/local_database.dart';
import '../storage/secure_storage.dart';
import 'node_provider.dart';

/// Which Social persona is active in the Social tab.
enum SocialContextKind { home, phone }

class SocialContextState {
  const SocialContextState({
    required this.kind,
    this.homeNodeId,
  });

  final SocialContextKind kind;
  final String? homeNodeId;

  bool get isPhone => kind == SocialContextKind.phone;
  bool get isHome => kind == SocialContextKind.home;
}

final socialContextProvider =
    StateNotifierProvider<SocialContextNotifier, SocialContextState>((ref) {
  return SocialContextNotifier(ref);
});

class SocialContextNotifier extends StateNotifier<SocialContextState> {
  SocialContextNotifier(this._ref)
      : super(const SocialContextState(kind: SocialContextKind.phone)) {
    _ref.listen(nodeProvider, (_, __) {
      unawaited(_syncFromPairing());
    });
    unawaited(_syncFromPairing());
  }

  final Ref _ref;
  static const _prefsKey = 'social_context_kind';

  /// Pairing drives the Discover / Feed plane — no manual switcher.
  /// Paired → Home search/content; unpaired → phone mesh.
  Future<void> _syncFromPairing() async {
    final node = _ref.read(nodeProvider).activeNode;
    if (node != null) {
      if (state.kind == SocialContextKind.home && state.homeNodeId == node.id) {
        return;
      }
      state = SocialContextState(
        kind: SocialContextKind.home,
        homeNodeId: node.id,
      );
      await SecureStorage().write(_prefsKey, 'home');
    } else {
      if (state.kind == SocialContextKind.phone && state.homeNodeId == null) {
        return;
      }
      state = const SocialContextState(kind: SocialContextKind.phone);
      await SecureStorage().write(_prefsKey, 'phone');
    }
  }

  /// Kept for tests / deep-links; preference is overwritten by pairing sync.
  Future<void> selectPhone() async {
    state = const SocialContextState(kind: SocialContextKind.phone);
    await SecureStorage().write(_prefsKey, 'phone');
  }

  Future<void> selectHome(String nodeId) async {
    state = SocialContextState(kind: SocialContextKind.home, homeNodeId: nodeId);
    await SecureStorage().write(_prefsKey, 'home');
  }
}

class PhoneBackendHolderState {
  const PhoneBackendHolderState({this.backend});
  final PhoneSocialBackend? backend;
}

final phoneBackendHolderProvider =
    StateNotifierProvider<PhoneBackendHolderNotifier, PhoneBackendHolderState>(
        (ref) {
  return PhoneBackendHolderNotifier(ref);
});

class PhoneBackendHolderNotifier extends StateNotifier<PhoneBackendHolderState> {
  PhoneBackendHolderNotifier(this._ref) : super(const PhoneBackendHolderState()) {
    if (_ref.read(mobileNodeEnabledProvider)) {
      _ensure();
    } else {
      debugPrint(
        '[PhoneBackendHolder] mobile node disabled — persona not loaded, '
        'no identity minted, no local DB opened',
      );
    }
    // Turning the feature on loads the persona then; turning it off stops
    // serving the backend. The instance is kept (not disposed) so a quick flip
    // back does not re-open the keychain/DB, and nothing on disk is touched.
    _ref.listen(featureFlagsProvider, (prev, next) {
      if (next.mobileNodeEnabled) {
        unawaited(_ensure());
      } else {
        state = const PhoneBackendHolderState();
      }
    });
  }

  final Ref _ref;
  static const _snapshotKey = 'phone_social_store_v1';
  bool _starting = false;

  /// Last load failure, kept for diagnostics (the runtime retries this).
  Object? lastLoadError;

  /// Retry a failed persona/store load.
  ///
  /// `_ensure()` used to be fire-and-forget from the constructor: a transient
  /// keychain / local-db failure left `backend == null` forever, which the
  /// phone-mesh runtime can only report as an unexplained "not ready".
  void retryEnsure() {
    if (state.backend != null) return;
    if (!_ref.read(mobileNodeEnabledProvider)) return;
    unawaited(_ensure());
  }

  Future<void> _ensure() async {
    if (state.backend != null || _starting) return;
    // Never mint or load a phone identity while the mobile node is off.
    if (!_ref.read(mobileNodeEnabledProvider)) return;
    _starting = true;
    try {
      final storage = SecureStorage();
      final idStore = PhoneIdentityStore(
        read: storage.read,
        write: storage.write,
        delete: storage.delete,
      );
      final persona = await idStore.loadOrCreate();
      final store = PhoneSocialStore();
      final snap = await storage.read(_snapshotKey);
      if (snap != null && snap.isNotEmpty) {
        try {
          store.loadSnapshot(snap);
        } catch (_) {}
      }
      store.profile = {
        ...store.profile,
        'ownerId': persona.ownerId,
      };

      final localDb = LocalDatabase();
      await localDb.initialize();

      final backend = PhoneSocialBackend(
        persona: persona,
        // Starts on fake; [phoneMeshRuntimeProvider] swaps in live dial.
        transport: FakeMeshEnvelopeTransport(),
        store: store,
        onPersist: (s) async {
          await storage.write(_snapshotKey, s.encodeSnapshot());
          try {
            await PhoneSocialLocalDb(localDb).syncFromStore(s);
          } catch (_) {}
        },
      );
      state = PhoneBackendHolderState(backend: backend);
      lastLoadError = null;
    } catch (e) {
      lastLoadError = e;
      debugPrint('[PhoneBackendHolder] load failed: $e');
    } finally {
      _starting = false;
    }
  }
}

/// Phone social-lite backend from `envoy_mesh` SDK.
///
/// The persona/store loads are driven by [phoneBackendHolderProvider], which the
/// connection-layer phone-mesh runtime (`lib/connection/phone_mesh_runtime.dart`)
/// observes and can nudge via
/// [PhoneBackendHolderNotifier.retryEnsure].
final phoneSocialBackendProvider = Provider<PhoneSocialBackend?>((ref) {
  return ref.watch(phoneBackendHolderProvider).backend;
});

/// Home Social backend when paired (always available alongside phone).
final homeSocialBackendProvider = Provider<HomeSocialBackend?>((ref) {
  return ref.watch(_homeBackendHolderProvider).backend;
});

/// Discover / default SocialBackend: Home when paired, phone when unpaired.
final socialBackendProvider = Provider<SocialBackend?>((ref) {
  final ctx = ref.watch(socialContextProvider);
  if (ctx.isHome) {
    return ref.watch(homeSocialBackendProvider);
  }
  return ref.watch(phoneSocialBackendProvider);
});


class _HomeBackendHolderState {
  const _HomeBackendHolderState({this.backend});
  final HomeSocialBackend? backend;
}

final _homeBackendHolderProvider =
    StateNotifierProvider<_HomeBackendHolderNotifier, _HomeBackendHolderState>(
        (ref) {
  return _HomeBackendHolderNotifier(ref);
});

class _HomeBackendHolderNotifier extends StateNotifier<_HomeBackendHolderState> {
  _HomeBackendHolderNotifier(this._ref) : super(const _HomeBackendHolderState()) {
    _ref.listen(nodeProvider, (_, __) {
      _sync();
    });
    _sync();
  }

  final Ref _ref;
  String? _wiredNodeId;
  HomeRemoteClientKey? _wiredClientKey;

  void _sync() {
    final nodeState = _ref.read(nodeProvider);
    final remote = _ref.read(nodeProvider.notifier).client;
    if (remote == null || nodeState.activeNode == null) {
      _disposeCurrent();
      return;
    }
    final nodeId = nodeState.activeNode!.id;
    final key = HomeRemoteClientKey(identityHashCode(remote), nodeId);
    if (state.backend != null &&
        _wiredNodeId == nodeId &&
        _wiredClientKey == key) {
      return;
    }
    _disposeCurrent();
    final backend = HomeSocialBackend(
      nodeId: nodeId,
      client: NodeServiceClient(remote),
      ownerIdReader: () => _ref.read(nodeProvider).ownerId ?? '',
    );
    _wiredNodeId = nodeId;
    _wiredClientKey = key;
    state = _HomeBackendHolderState(backend: backend);
  }

  void _disposeCurrent() {
    final prev = state.backend;
    if (prev != null) {
      prev.dispose();
    }
    _wiredNodeId = null;
    _wiredClientKey = null;
    if (state.backend != null) {
      state = const _HomeBackendHolderState();
    }
  }

  @override
  void dispose() {
    _disposeCurrent();
    super.dispose();
  }
}

/// Identity for HomeRemoteClient instance + node (avoid leaking push handlers).
class HomeRemoteClientKey {
  const HomeRemoteClientKey(this.clientIdentity, this.nodeId);
  final int clientIdentity;
  final String nodeId;

  @override
  bool operator ==(Object other) =>
      other is HomeRemoteClientKey &&
      other.clientIdentity == clientIdentity &&
      other.nodeId == nodeId;

  @override
  int get hashCode => Object.hash(clientIdentity, nodeId);
}
