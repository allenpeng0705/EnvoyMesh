/// Phone-mesh **runtime** — the connection half of EnvoyGo's Social plane.
///
/// **Workstream A5 decision (provider split by concern).** This code lived in
/// `lib/providers/social_context_provider.dart`, a file *named* social that in
/// fact held the libp2p host session, WAN/LAN discovery, the mDNS multicast
/// lock, the foreground/background policy and the self-healing retry loop. The
/// name and the content disagreed (plan §2.6), so the runtime is classified as
/// a **connection** concern and lives in the connection layer; `social_context`
/// keeps the persona/store state and the Social tab's Home-vs-phone choice.
///
/// Reusable in shape (plan §2.6): everything above `PhoneMeshRuntimeState` is
/// transport work over `envoy_mesh_libp2p` + `envoy_thin_client`.
///
/// The runtime drives the phone social backend through
/// [PhoneMeshBackendBridge] (`phone_mesh_bridge.dart`), implemented by the
/// product layer in `lib/providers/phone_mesh_bridge.dart` — so this file
/// imports no product module.
library;

import 'dart:async';

import 'package:envoy_mesh_libp2p/envoy_mesh_libp2p.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../services/feature_flags.dart';
import '../services/mdns_multicast_lock.dart';
import 'node_connection_provider.dart';
import 'phone_mesh_bridge.dart';

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
    _ref.listen(phoneMeshBridgeRegistryProvider, (_, __) {
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
  PhoneMeshDiscoveryBridge? _discovery;

  /// Product-plane backend bridge (persona-owned). `null` until the product
  /// layer installs it at app start.
  PhoneMeshBackendBridge? get _backend =>
      _ref.read(phoneMeshBridgeRegistryProvider).bridge;
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
        final backend = _backend;
        if (backend == null || !backend.isReady) {
          // Persona/store load may have failed or still be running: nudge the
          // loader and keep retrying instead of waiting for a lifecycle event.
          backend?.retryLoad();
          await _teardown();
          final loadError = backend?.lastLoadError;
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

        backend.attachTransport(node);
        _session ??= PhoneMeshSession(node);
        if (!_session!.isActive) {
          await _session!.enable(
            onStream: (stream, peer, protocolId) async {
              final bridge = _backend;
              if (bridge == null || !bridge.isReady) return;
              await bridge.handleInboundStream(
                stream: stream,
                remotePeer: peer,
                protocolId: protocolId,
              );
            },
          );
        }

        // Handlers first, then await discovery start so wanSearch is attached
        // before we clear `starting` — avoids Discover racing a Connected UI.
        if (_foreground) {
          _discovery ??= backend.createDiscovery(node);
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

/// Keep phone mesh session ticking while Social UI is mounted.
final phoneMeshKeepAliveProvider = Provider<PhoneMeshRuntimeState>((ref) {
  return ref.watch(phoneMeshRuntimeProvider);
});
