/// Social context: Home (paired thin-client) vs On this phone (mesh SDK).
library;

import 'dart:async';

import 'package:envoy_mesh/envoy_mesh.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../mesh/home_social_backend.dart';
import '../mesh/libp2p_mesh_envelope_transport.dart';
import '../mesh/phone_discovery_session.dart';
import '../mesh/phone_mesh_session.dart';
import '../mesh/phone_social_local_db.dart';
import '../services/node_service_client.dart';
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
    _bootstrap();
  }

  final Ref _ref;
  static const _prefsKey = 'social_context_kind';

  Future<void> _bootstrap() async {
    final storage = SecureStorage();
    final saved = await storage.read(_prefsKey);
    final node = _ref.read(nodeProvider).activeNode;
    if (saved == 'home' && node != null) {
      state = SocialContextState(
        kind: SocialContextKind.home,
        homeNodeId: node.id,
      );
    } else if (node != null && saved != 'phone') {
      // Paired users default to Home until they explicitly choose phone.
      state = SocialContextState(
        kind: SocialContextKind.home,
        homeNodeId: node.id,
      );
    } else {
      state = const SocialContextState(kind: SocialContextKind.phone);
    }
  }

  Future<void> selectPhone() async {
    state = const SocialContextState(kind: SocialContextKind.phone);
    await SecureStorage().write(_prefsKey, 'phone');
  }

  Future<void> selectHome(String nodeId) async {
    state = SocialContextState(kind: SocialContextKind.home, homeNodeId: nodeId);
    await SecureStorage().write(_prefsKey, 'home');
  }
}

class _PhoneBackendState {
  const _PhoneBackendState({this.backend});
  final PhoneSocialBackend? backend;
}

final _phoneBackendHolderProvider =
    StateNotifierProvider<_PhoneBackendHolderNotifier, _PhoneBackendState>(
        (ref) {
  return _PhoneBackendHolderNotifier();
});

class _PhoneBackendHolderNotifier extends StateNotifier<_PhoneBackendState> {
  _PhoneBackendHolderNotifier() : super(const _PhoneBackendState()) {
    _ensure();
  }

  static const _snapshotKey = 'phone_social_store_v1';
  bool _starting = false;

  Future<void> _ensure() async {
    if (state.backend != null || _starting) return;
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
      state = _PhoneBackendState(backend: backend);
    } finally {
      _starting = false;
    }
  }
}

/// Phone social-lite backend from `envoy_mesh` SDK.
final phoneSocialBackendProvider = Provider<PhoneSocialBackend?>((ref) {
  return ref.watch(_phoneBackendHolderProvider).backend;
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
    _ref.listen<SocialContextState>(socialContextProvider, (_, next) {
      _sync(next);
    });
    _ref.listen(nodeProvider, (_, __) {
      _sync(_ref.read(socialContextProvider));
    });
    _sync(_ref.read(socialContextProvider));
  }

  final Ref _ref;
  String? _wiredNodeId;
  HomeRemoteClientKey? _wiredClientKey;

  void _sync(SocialContextState ctx) {
    if (!ctx.isHome) {
      _disposeCurrent();
      return;
    }
    final nodeState = _ref.read(nodeProvider);
    final remote = _ref.read(nodeProvider.notifier).client;
    if (remote == null || nodeState.activeNode == null) {
      _disposeCurrent();
      return;
    }
    final nodeId = ctx.homeNodeId ?? nodeState.activeNode!.id;
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

class PhoneMeshRuntimeState {
  const PhoneMeshRuntimeState({
    this.sessionActive = false,
    this.discoveryActive = false,
    this.lastError,
  });

  final bool sessionActive;
  final bool discoveryActive;
  final String? lastError;
}

/// Enables/disables [PhoneMeshSession] + live dial when Social is phone.
final phoneMeshRuntimeProvider =
    StateNotifierProvider<PhoneMeshRuntimeNotifier, PhoneMeshRuntimeState>(
        (ref) {
  return PhoneMeshRuntimeNotifier(ref);
});

class PhoneMeshRuntimeNotifier extends StateNotifier<PhoneMeshRuntimeState> {
  PhoneMeshRuntimeNotifier(this._ref) : super(const PhoneMeshRuntimeState()) {
    _ref.listen<SocialContextState>(socialContextProvider, (_, __) {
      unawaited(_apply());
    });
    _ref.listen(phoneSocialBackendProvider, (_, __) {
      unawaited(_apply());
    });
    unawaited(_apply());
  }

  final Ref _ref;
  PhoneMeshSession? _session;
  PhoneDiscoverySession? _discovery;
  bool _busy = false;
  bool _pending = false;
  bool _foreground = true;

  /// Pause WAN advertise/lookup when the app backgrounds (S6).
  void setForeground(bool foreground) {
    if (_foreground == foreground) return;
    _foreground = foreground;
    unawaited(_apply());
  }

  Future<void> _apply() async {
    if (_busy) {
      _pending = true;
      return;
    }
    _busy = true;
    try {
      do {
        _pending = false;
        final ctx = _ref.read(socialContextProvider);
        if (!ctx.isPhone) {
          await _teardown();
          continue;
        }
        final backend = _ref.read(phoneSocialBackendProvider);
        if (backend == null) continue;

        final node = await _ref.read(nodeProvider.notifier).ensureLibp2pStarted();
        if (node == null) {
          state = const PhoneMeshRuntimeState(
            sessionActive: false,
            lastError: 'Could not start mesh host',
          );
          continue;
        }

        backend.replaceTransport(Libp2pMeshEnvelopeTransport(node));
        _session ??= PhoneMeshSession(node);
        if (!_session!.isActive) {
          await _session!.enable(
            onStream: (stream, peer, protocolId) async {
              final b = _ref.read(phoneSocialBackendProvider);
              if (b == null) return;
              await handleInboundPhoneMeshStream(
                stream: stream,
                remotePeer: peer,
                protocolId: protocolId,
                backend: b,
              );
            },
          );
        }

        if (_foreground) {
          _discovery ??= PhoneDiscoverySession(node: node, backend: backend);
          if (!_discovery!.isActive) {
            try {
              await _discovery!.start();
            } catch (e) {
              debugPrint('[PhoneMeshRuntime] discovery start: $e');
            }
          }
        } else {
          await _stopDiscovery();
        }

        state = PhoneMeshRuntimeState(
          sessionActive: _session!.isActive,
          discoveryActive: _discovery?.isActive ?? false,
          lastError: _session!.reservedRelayPeerId == null
              ? 'Mesh online (relay reserve pending)'
              : null,
        );
      } while (_pending);
    } catch (e) {
      debugPrint('[PhoneMeshRuntime] $e');
      state = PhoneMeshRuntimeState(
        sessionActive: false,
        lastError: e.toString(),
      );
    } finally {
      _busy = false;
      if (_pending) {
        _pending = false;
        unawaited(_apply());
      }
    }
  }

  Future<void> _stopDiscovery() async {
    final discovery = _discovery;
    _discovery = null;
    if (discovery != null) {
      try {
        await discovery.stop();
      } catch (e) {
        debugPrint('[PhoneMeshRuntime] discovery stop: $e');
      }
    }
  }

  Future<void> _teardown() async {
    await _stopDiscovery();
    final session = _session;
    _session = null;
    if (session != null) {
      try {
        await session.disable();
      } catch (e) {
        debugPrint('[PhoneMeshRuntime] teardown: $e');
      }
    }
    if (state.sessionActive ||
        state.discoveryActive ||
        state.lastError != null) {
      state = const PhoneMeshRuntimeState();
    }
  }

  @override
  void dispose() {
    final discovery = _discovery;
    _discovery = null;
    unawaited(discovery?.stop() ?? Future.value());
    final session = _session;
    _session = null;
    session?.disable();
    super.dispose();
  }
}

/// Active [SocialBackend] for the Social tab (Home RPC or phone mesh).
final socialBackendProvider = Provider<SocialBackend?>((ref) {
  final ctx = ref.watch(socialContextProvider);
  if (ctx.isHome) {
    return ref.watch(_homeBackendHolderProvider).backend;
  }
  // Keep mesh runtime synced while phone backend is observed.
  ref.watch(phoneMeshRuntimeProvider);
  return ref.watch(phoneSocialBackendProvider);
});
