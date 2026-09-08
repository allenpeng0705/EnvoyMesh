/// Social context: Home (paired thin-client) vs On this phone (mesh SDK).
library;

import 'dart:async';

import 'package:envoy_mesh_libp2p/envoy_mesh_libp2p.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../mesh/home_social_backend.dart';
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

/// Keep phone mesh session ticking while Social UI is mounted.
final phoneMeshKeepAliveProvider = Provider<PhoneMeshRuntimeState>((ref) {
  return ref.watch(phoneMeshRuntimeProvider);
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

/// Enables phone mesh handlers (+ WAN/LAN discovery when unpaired or foreground).
///
/// Runs whenever the phone persona exists — not gated on a Social switcher.
/// Discovery advertise stays on while the app is foregrounded so phone DMs
/// remain reachable; Discover *search* still uses Home when paired.
final phoneMeshRuntimeProvider =
    StateNotifierProvider<PhoneMeshRuntimeNotifier, PhoneMeshRuntimeState>(
        (ref) {
  return PhoneMeshRuntimeNotifier(ref);
});

class PhoneMeshRuntimeNotifier extends StateNotifier<PhoneMeshRuntimeState> {
  PhoneMeshRuntimeNotifier(this._ref) : super(const PhoneMeshRuntimeState()) {
    _ref.listen(_phoneBackendHolderProvider, (_, __) {
      unawaited(_apply());
    });
    _ref.listen(nodeProvider, (_, __) {
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
  bool _disposed = false;

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
        final backend = _ref.read(phoneSocialBackendProvider);
        if (backend == null) {
          await _teardown();
          continue;
        }

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

        // Publish Connected as soon as handlers are up — discovery/WAN is async.
        state = PhoneMeshRuntimeState(
          sessionActive: _session!.isActive,
          discoveryActive: _discovery?.isActive ?? false,
          lastError: null,
        );

        if (_foreground) {
          _discovery ??= PhoneDiscoverySession(node: node, backend: backend);
          if (!_discovery!.isActive) {
            final discovery = _discovery!;
            unawaited(() async {
              try {
                await discovery.start();
              } catch (e) {
                debugPrint('[PhoneMeshRuntime] discovery start: $e');
              }
              if (_disposed || _discovery != discovery) return;
              state = PhoneMeshRuntimeState(
                sessionActive: _session?.isActive ?? false,
                discoveryActive: discovery.isActive,
                lastError: null,
              );
            }());
          }
        } else {
          await _stopDiscovery();
          state = PhoneMeshRuntimeState(
            sessionActive: _session!.isActive,
            discoveryActive: false,
            lastError: null,
          );
        }
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
    _disposed = true;
    final discovery = _discovery;
    _discovery = null;
    unawaited(discovery?.stop() ?? Future.value());
    final session = _session;
    _session = null;
    session?.disable();
    super.dispose();
  }
}
