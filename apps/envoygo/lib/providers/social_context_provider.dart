/// Social context: Home (paired thin-client) vs On this phone (mesh SDK).
library;

import 'dart:async';

import 'package:envoy_mesh_libp2p/envoy_mesh_libp2p.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../mesh/home_social_backend.dart';
import '../mesh/phone_social_local_db.dart';
import '../services/feature_flags.dart';
import '../services/mdns_multicast_lock.dart';
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
  return _PhoneBackendHolderNotifier(ref);
});

class _PhoneBackendHolderNotifier extends StateNotifier<_PhoneBackendState> {
  _PhoneBackendHolderNotifier(this._ref) : super(const _PhoneBackendState()) {
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
        state = const _PhoneBackendState();
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
      state = _PhoneBackendState(backend: backend);
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
    this.lanActive = false,
    this.starting = false,
    this.lastError,
    this.attempts = 0,
    this.diagnostics,
  });

  final bool sessionActive;
  final bool discoveryActive;
  /// LAN (mDNS) plane up. Independent of WAN: relay discovery works without it.
  final bool lanActive;
  /// True while cold-start / ensureLibp2p is in flight (UI "Connecting…").
  final bool starting;
  final String? lastError;

  /// Consecutive self-healing attempts since the last fully-up state.
  final int attempts;

  /// One-line developer detail (host / session / discovery / mDNS), shown at the
  /// bottom of the status sheet so a bug report does not need `flutter logs`.
  final String? diagnostics;

  /// True when both the mesh session and WAN/LAN discovery are up.
  bool get fullyUp => sessionActive && discoveryActive;
}

/// Backoff for the phone-mesh self-healing retry loop (pure; unit-tested).
///
/// Every prerequisite (persona/store load, libp2p host boot, discovery start)
/// can finish *after* the first `_apply()` attempt. Without a retry loop a
/// missed edge left the app grey/offline until the user backgrounded and
/// resumed — which is exactly the workaround reported on device.
Duration phoneMeshRetryDelay(int attempt) {
  const capMs = 30 * 1000;
  final clamped = attempt < 1 ? 1 : (attempt > 5 ? 5 : attempt);
  final ms = 2000 * (1 << (clamped - 1));
  return Duration(milliseconds: ms > capMs ? capMs : ms);
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
    // Turning the mobile node on/off takes effect immediately.
    _ref.listen(featureFlagsProvider, (_, __) {
      unawaited(_apply());
    });
    // Do not re-run on every home connection state change — that used to
    // re-enter ensureTcpListen while addrs were still settling and restart
    // the host (endless "Starting phone mesh…").
    _ref.listen(nodeProvider, (prev, next) {
      if (state.sessionActive && (_session?.isActive ?? false)) return;
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

  static const _libp2pStartTimeout = Duration(seconds: 12);
  bool _awaitingSlowStart = false;

  /// Self-healing retry: keeps re-applying while foregrounded and not fully up.
  Timer? _retryTimer;
  int _attempts = 0;

  /// Bounded window for LAN-only retries (≈2 min at the 30s cap).
  static const _maxLanRetries = 6;

  /// Manual escape hatch (status sheet "Retry now").
  void retryNow() {
    _attempts = 0;
    _cancelRetry();
    debugPrint('[PhoneMeshRuntime] manual retry requested');
    unawaited(_apply());
  }

  void _cancelRetry() {
    _retryTimer?.cancel();
    _retryTimer = null;
  }

  void _scheduleRetry(String why) {
    if (_disposed || !_foreground) return;
    if (_retryTimer != null) return;
    _attempts += 1;
    final delay = phoneMeshRetryDelay(_attempts);
    _retryTimer = Timer(delay, () {
      _retryTimer = null;
      unawaited(_apply());
    });
    debugPrint(
      '[PhoneMeshRuntime] retry #$_attempts in ${delay.inSeconds}s ($why)',
    );
  }

  void _clearRetry() {
    _cancelRetry();
    _attempts = 0;
  }

  /// Compact one-line state for the status sheet / bug reports.
  String _diagnostics({Libp2pNode? node}) {
    final host = node ?? _ref.read(nodeProvider.notifier).libp2pNode;
    return 'host=${host?.isStarted == true ? 'up' : 'down'}'
        ' epoch=${host?.hostEpoch ?? '-'}'
        ' session=${_session?.isActive == true ? 'on' : 'off'}'
        ' discovery=${_discovery?.isActive == true ? 'on' : 'off'}'
        ' mdns=${_discovery?.mdnsActive == true ? 'on' : 'off'}'
        ' relays=${host?.relayAdvertisedMultiaddrs().length ?? 0}'
        ' attempts=$_attempts'
        ' foreground=${_foreground ? 'yes' : 'no'}';
  }

  /// Pause WAN advertise/lookup when the app backgrounds (S6).
  void setForeground(bool foreground) {
    if (_foreground == foreground) return;
    _foreground = foreground;
    debugPrint(
      '[PhoneMeshRuntime] foreground=${foreground ? 'yes' : 'no'} '
      '(${_diagnostics()})',
    );
    if (foreground) {
      // Resume: always give it a fresh, immediate attempt.
      _clearRetry();
    } else {
      // Backgrounded: stop self-healing so we do not burn battery.
      _cancelRetry();
    }
    unawaited(_apply());
  }

  Future<void> _apply() async {
    // Mobile node disabled (default): no phone mesh session, no discovery, no
    // retry loop. The persona's data stays on disk for when it is re-enabled.
    if (!_ref.read(mobileNodeEnabledProvider)) {
      _cancelRetry();
      await _teardown();
      if (!_disposed) {
        state = const PhoneMeshRuntimeState(
          diagnostics: 'mobile node disabled (feature flag)',
        );
      }
      return;
    }
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
          // Persona/store load may have failed or still be running: nudge the
          // loader and keep retrying instead of waiting for a lifecycle event.
          final holder = _ref.read(_phoneBackendHolderProvider.notifier);
          holder.retryEnsure();
          await _teardown();
          final loadError = holder.lastLoadError;
          state = PhoneMeshRuntimeState(
            attempts: _attempts,
            diagnostics:
                'backend=loading${loadError == null ? '' : ' lastError=$loadError'}',
          );
          _scheduleRetry('phone backend not loaded');
          continue;
        }

        if (!(state.sessionActive && (_session?.isActive ?? false))) {
          state = PhoneMeshRuntimeState(
            sessionActive: false,
            discoveryActive: _discovery?.isActive ?? false,
            starting: true,
            lastError: null,
          );
        }

        final nodeNotifier = _ref.read(nodeProvider.notifier);
        final startFuture = nodeNotifier.ensureLibp2pStarted();
        Libp2pNode? node;
        try {
          node = await startFuture.timeout(_libp2pStartTimeout);
        } on TimeoutException {
          // Host may still be booting (warm start shares the same future).
          // Prefer an already-ready node; otherwise wait for the slow start
          // to finish and re-apply — without requiring app background/resume.
          final maybe = nodeNotifier.libp2pNode;
          if (maybe != null && maybe.isStarted) {
            node = maybe;
          } else {
            debugPrint(
              '[PhoneMeshRuntime] ensureLibp2pStarted timed out '
              'after ${_libp2pStartTimeout.inSeconds}s — will retry when ready',
            );
            state = PhoneMeshRuntimeState(
              sessionActive: false,
              starting: true,
              lastError: null,
              attempts: _attempts,
              diagnostics: _diagnostics(),
            );
            if (!_awaitingSlowStart) {
              _awaitingSlowStart = true;
              unawaited(startFuture.whenComplete(() {
                _awaitingSlowStart = false;
                if (_disposed) return;
                if (state.sessionActive && (_session?.isActive ?? false)) {
                  return;
                }
                unawaited(_apply());
              }));
            }
            // Belt and braces: the follow-up covers a slow-but-successful host
            // boot, the retry timer covers a boot that never completes.
            _scheduleRetry('libp2p host still starting');
            // Don't spin the do-while on the same hung start — follow-up
            // above re-applies when the host finishes (or lifecycle does).
            break;
          }
        }
        if (node == null) {
          state = const PhoneMeshRuntimeState(
            sessionActive: false,
            starting: false,
            lastError: 'Could not start mesh host',
          );
          _scheduleRetry('ensureLibp2pStarted returned null');
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

        // Handlers first, then await discovery start so wanSearch is attached
        // before we clear `starting` — avoids Discover racing a Connected UI.
        if (_foreground) {
          _discovery ??= PhoneDiscoverySession(node: node, backend: backend);
          if (!_discovery!.isActive) {
            // Android needs an app-held multicast lock for inbound mDNS.
            await MdnsMulticastLock.acquire();
            try {
              await _discovery!.start();
            } catch (e) {
              debugPrint('[PhoneMeshRuntime] discovery start: $e');
            }
          }
          if (_disposed) return;
          final sessionUp = _session!.isActive;
          final discoveryUp = _discovery?.isActive ?? false;
          // LAN plane: the first attempt can lose a race (host TCP addrs still
          // settling) or hit the unanswered iOS Local Network prompt. Retry it
          // on the same backoff loop instead of leaving LAN discovery dead.
          if (discoveryUp && !(_discovery!.mdnsActive)) {
            await _discovery!.ensureMdns();
          }
          if (_disposed) return;
          final lanUp = _discovery?.mdnsActive ?? false;
          state = PhoneMeshRuntimeState(
            sessionActive: sessionUp,
            discoveryActive: discoveryUp,
            lanActive: lanUp,
            starting: false,
            lastError: null,
            attempts: _attempts,
            diagnostics: _diagnostics(node: node),
          );
          debugPrint(
            '[PhoneMeshRuntime] ${sessionUp && discoveryUp ? 'up' : 'partial'} '
            '(${state.diagnostics})',
          );
          if (sessionUp && discoveryUp && lanUp) {
            _clearRetry();
          } else if (sessionUp && discoveryUp) {
            // WAN/discovery is fine, LAN is not: retry mDNS for a bounded window
            // (covers the iOS Local Network prompt and late-settling listen
            // addrs), then stop chasing a plane this network may never offer.
            if (_attempts < _maxLanRetries) {
              _scheduleRetry('mDNS/LAN not active');
            }
          } else {
            _scheduleRetry(
              sessionUp ? 'discovery not active' : 'session not active',
            );
          }
        } else {
          await _stopDiscovery();
          state = PhoneMeshRuntimeState(
            sessionActive: _session!.isActive,
            discoveryActive: false,
            starting: false,
            lastError: null,
            attempts: _attempts,
            diagnostics: _diagnostics(node: node),
          );
        }
      } while (_pending);
    } catch (e) {
      debugPrint('[PhoneMeshRuntime] $e');
      state = PhoneMeshRuntimeState(
        sessionActive: false,
        starting: false,
        lastError: e.toString(),
        attempts: _attempts,
        diagnostics: _diagnostics(),
      );
      _scheduleRetry('apply threw: $e');
    } finally {
      _busy = false;
      if (_pending) {
        _pending = false;
        unawaited(_apply());
      }
    }
  }

  Future<void> _stopDiscovery() async {
    await MdnsMulticastLock.release();
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
    _cancelRetry();
    final discovery = _discovery;
    _discovery = null;
    unawaited(discovery?.stop() ?? Future.value());
    final session = _session;
    _session = null;
    session?.disable();
    super.dispose();
  }
}
