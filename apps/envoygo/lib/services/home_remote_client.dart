import 'dart:async';
import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';
import 'web_socket_like.dart';
import 'exceptions.dart';

// -- Wire protocol (mirrors packages/api/src/terminal-wire.ts v1) --

/// Binary PTY wire protocol type tags. Must match the TypeScript
/// `TerminalWireType` in `@envoymesh/api/terminal-wire.ts` (version 1).
class TerminalWireType {
  static const int stdin = 0;
  static const int stdout = 1;
  static const int resize = 2;
  static const int exit = 3;
  static const int ping = 4;
  static const int pong = 5;
}

const int _terminalWireVersion = 1;

/// Encode a PTY wire-protocol frame: `[version(1)][type(1)][payload(N)]`.
/// Mirrors `encodeTerminalFrame` in `@envoymesh/api/terminal-wire.ts`.
Uint8List encodeTerminalFrame(int type, Uint8List payload) {
  final out = Uint8List(2 + payload.length);
  out[0] = _terminalWireVersion;
  out[1] = type;
  out.setRange(2, 2 + payload.length, payload);
  return out;
}

/// Encode a `resize` frame: `[version(1)][type(1)][cols u16 BE][rows u16 BE]`.
Uint8List encodeTerminalResize(int cols, int rows) {
  final bd = ByteData(4);
  bd.setUint16(0, cols, Endian.big);
  bd.setUint16(2, rows, Endian.big);
  return encodeTerminalFrame(TerminalWireType.resize, bd.buffer.asUint8List());
}

// -- Types --

typedef EventHandler = void Function(dynamic data);

/// A transport candidate for reaching the home node.
///
/// The [url] format determines which transport is used:
///   - `ws://` / `wss://`  → standard WebSocket
///   - contains `?peer=`        → relay proxy WebSocket
///     (requires [homePeerId] and [sessionToken])
class HomeRemoteCandidate {
  final String name;
  final String url;

  /// Required for relay (?peer=) candidates. The home node's libp2p peer ID.
  /// When non-null, _createTransportForCandidate routes to ClientProxyTransport.
  final String? homePeerId;

  /// Required for relay candidates. The session token for authentication.
  final String? sessionToken;

  /// For libp2p circuit relay candidates. The relay's libp2p multiaddr
  /// to dial through, e.g. /ip4/47.93.11.212/tcp/4001/p2p/12D3KooWLNR...
  /// When non-null, _createTransportForCandidate routes to Libp2pTransport.
  final String? libp2pRelayAddr;

  const HomeRemoteCandidate({
    required this.name,
    required this.url,
    this.homePeerId,
    this.sessionToken,
    this.libp2pRelayAddr,
  });
}

class HomeRemoteClientOptions {
  /// Returns the candidate transports to try, in priority order.
  final Future<List<HomeRemoteCandidate>> Function() resolveCandidates;

  /// Factory that opens a transport given a candidate.
  final FutureOr<WebSocketLike> Function(HomeRemoteCandidate candidate)?
      createTransport;

  /// Called when the home-online state changes.
  final void Function(bool online)? onHomeOnlineChange;

  /// Called whenever the active transport is established or replaced.
  final void Function(HomeRemoteCandidate? candidate)?
      onActiveTransportChange;

  /// Called whenever a reconnection succeeds (after initial connect).
  /// Use this to resync data after network recovery.
  final void Function()? onReconnect;

  /// Per-candidate connect timeout in ms. Default: 8000.
  final int perCandidateTimeoutMs;

  /// Background upgrade sweep interval in ms. Default: 30000. 0 to disable.
  final int upgradeSweepMs;

  /// Initial reconnect delay in ms. Doubles on each failure. Default: 1000.
  final int initialReconnectDelayMs;

  const HomeRemoteClientOptions({
    required this.resolveCandidates,
    this.createTransport,
    this.onHomeOnlineChange,
    this.onActiveTransportChange,
    this.onReconnect,
    this.perCandidateTimeoutMs = 8000,
    this.upgradeSweepMs = 30000,
    this.initialReconnectDelayMs = 1000,
  });
}

class _PendingRpc {
  final Completer<dynamic> completer;
  final Timer timer;

  _PendingRpc(this.completer, this.timer);
}

class _ProbeCooldown {
  final int lastAttemptAt;
  final int failures;

  _ProbeCooldown({required this.lastAttemptAt, required this.failures});
}

// -- Client --

/// Persistent transport to the paired home node.
///
/// Supports multiple candidate transport URLs (LAN, libp2p, relay tunnel)
/// with automatic fallback. The first candidate that opens becomes the
/// active transport. A background sweep periodically re-tries
/// higher-priority candidates.
///
/// Multiplexes JSON-RPC calls and push events over whichever transport
/// is currently active. Transport-agnostic — works over WebSocket,
/// libp2p streams, or any custom duplex that satisfies [WebSocketLike].
class HomeRemoteClient {
  WebSocketLike? _ws;
  Completer<void>? _connectCompleter;
  final Map<String, _PendingRpc> _pending = {};
  final Map<String, Set<EventHandler>> _eventHandlers = {};
  Timer? _reconnectTimer;
  Timer? _upgradeSweepTimer;
  late int _reconnectDelayMs;
  bool _disposed = false;
  bool _homeOnline = false;
  HomeRemoteCandidate? _activeCandidate;
  bool _upgrading = false;
  final Map<String, _ProbeCooldown> _probeCooldown = {};

  final HomeRemoteClientOptions _options;

  HomeRemoteClient(this._options)
      : _reconnectDelayMs = _options.initialReconnectDelayMs {
    final sweepMs = _options.upgradeSweepMs;
    if (sweepMs > 0) {
      _upgradeSweepTimer = Timer.periodic(
        Duration(milliseconds: sweepMs),
        (_) => _maybeUpgradeTransport(),
      );
    }
  }

  // -- Public properties --

  bool get homeOnline => _homeOnline;

  HomeRemoteCandidate? get activeCandidate => _activeCandidate;

  bool get isConnected {
    final ws = _ws;
    return ws != null && ws.readyState == wsOpen;
  }

  // -- Event system --

  /// Subscribe to a push event. Returns an unsubscribe function.
  void Function() on(String event, EventHandler handler) {
    _eventHandlers.putIfAbsent(event, () => <EventHandler>{});
    _eventHandlers[event]!.add(handler);
    return () => _eventHandlers[event]?.remove(handler);
  }

  void _emit(String event, dynamic data) {
    final handlers = _eventHandlers[event];
    if (handlers == null) return;
    for (final handler in handlers) {
      try {
        handler(data);
      } catch (_) {
        // Swallow handler errors.
      }
    }
  }

  // -- Connection lifecycle --

  /// Ensure the client is connected. Reuses an in-flight connection attempt.
  Future<void> ensureConnected() {
    if (_disposed) return Future.error(Exception('homeRemote.disposed'));
    if (_ws?.readyState == wsOpen) return Future.value();
    if (_connectCompleter != null) return _connectCompleter!.future;
    final completer = Completer<void>();
    _connectCompleter = completer;
    _connectInternal().then((_) {
      completer.complete();
      _connectCompleter = null;
    }).catchError((Object e) {
      completer.completeError(e);
      _connectCompleter = null;
    });
    return completer.future;
  }

  /// Connect to the home node, trying candidates in priority order.
  Future<void> _connectInternal() async {
    final candidates = await _options.resolveCandidates();
    if (_disposed) throw Exception('homeRemote.disposed');
    if (candidates.isEmpty) throw Exception('homeRemote.notConfigured');

    // Prefer the same candidate on reconnect.
    var startIndex = 0;
    if (_activeCandidate != null) {
      final idx = candidates.indexWhere(
        (c) =>
            c.name == _activeCandidate!.name &&
            c.url == _activeCandidate!.url,
      );
      if (idx >= 0) startIndex = idx;
    }

    // Close any existing transport.
    if (_ws != null) {
      try {
        _ws!.close();
      } catch (_) {}
      _ws = null;
    }

    final perTimeout = _options.perCandidateTimeoutMs;
    Object? lastError;

    // Fast-fail threshold: if a candidate rejects the connection (TCP RST,
    // ICMP unreachable, or immediate WS close) within this window, it is
    // almost certainly unreachable and we should try the next candidate
    // without waiting for the full perTimeout. 500 ms is long enough to
    // rule out a transient ARP/DNS delay but short enough that we don't
    // waste significant time on a truly unreachable host.
    const fastFailMs = 500;

    for (var i = startIndex; i < candidates.length; i++) {
      final candidate = candidates[i];
      try {
        await _openSocket(candidate, perTimeout, fastFailMs: fastFailMs);
        _probeCooldown.remove(candidate.name);
        _setActiveCandidate(candidate);
        return;
      } catch (err) {
        lastError = err;
        // Clean up failed transport so no RPC races onto it.
        _ws = null;
        _recordProbeFailure(candidate.name);
      }
    }

    final tried = candidates.map((c) => '${c.name}=${c.url}').join(', ');
    throw Exception(
        'homeRemote.connectFailed — tried: [$tried] — last error: $lastError');
  }

  /// Open a WebSocket to a candidate with timeout.
  ///
  /// [perTimeoutMs] — total connect timeout. [fastFailMs] — if the socket
  /// errors/closes within this window, abort immediately and throw instead
  /// of waiting for [perTimeoutMs]. This avoids wasting 8 seconds on a
  /// candidate that is unreachable (e.g. LAN IP when on mobile data).
  Future<void> _openSocket(
    HomeRemoteCandidate candidate,
    int perTimeoutMs, {
    int fastFailMs = 0,
  }) async {
    final ws = await _createTransportFor(candidate);
    _ws = ws;

    final completer = Completer<void>();
    Timer? fastFailTimer;
    Timer? slowTimer;

    if (fastFailMs > 0) {
      fastFailTimer = Timer(Duration(milliseconds: fastFailMs), () {
        if (!completer.isCompleted) {
          try {
            ws.close();
          } catch (_) {}
          // Fast-fail: candidate is unreachable — abort immediately.
          completer.completeError(Exception('homeRemote.unreachable'));
        }
      });
    }

    slowTimer = Timer(Duration(milliseconds: perTimeoutMs), () {
      if (!completer.isCompleted) {
        try {
          ws.close();
        } catch (_) {}
        completer.completeError(Exception('homeRemote.connectTimeout'));
      }
    });

    ws.onOpen = () {
      if (!completer.isCompleted) {
        fastFailTimer?.cancel();
        slowTimer?.cancel();
        completer.complete();
      }
    };

    ws.onError = () {
      if (!completer.isCompleted) {
        fastFailTimer?.cancel();
        slowTimer?.cancel();
        try {
          ws.close();
        } catch (_) {}
        completer.completeError(Exception('homeRemote.connectFailed'));
      }
    };

    await completer.future;

    // Socket opened — install message handler.
    ws.onMessage = (event) {
      try {
        final msg = jsonDecode(event.data) as Map<String, dynamic>?;
        if (msg == null) return;

        // Push event.
        if (msg.containsKey('event')) {
          if (msg['event'] == 'connected') {
            _setHomeOnline(true);
            _reconnectDelayMs = _options.initialReconnectDelayMs;
          }
          _emit(msg['event'] as String, msg['data']);
          return;
        }

        // RPC response.
        final id = msg['id'] as String?;
        if (id == null) return;
        final pending = _pending.remove(id);
        if (pending == null) return;

        pending.timer.cancel();
        if (msg.containsKey('error')) {
          final err = msg['error'] as Map<String, dynamic>?;
          if (!pending.completer.isCompleted) {
            pending.completer.completeError(
              _decodeRpcError(err),
            );
          }
        } else {
          if (!pending.completer.isCompleted) {
            pending.completer.complete(msg['result']);
          }
        }
      } catch (_) {
        // Swallow malformed messages.
      }
    };

    ws.onClose = () {
      _setHomeOnline(false);
      _ws = null;
      for (final entry in _pending.entries) {
        if (!entry.value.completer.isCompleted) {
          entry.value.completer
              .completeError(Exception('homeRemote.disconnected'));
        }
      }
      _pending.clear();
      _scheduleReconnect();
    };

    ws.onError = () {
      _setHomeOnline(false);
    };
  }

  // -- RPC --

  /// Send a JSON-RPC call and wait for the response.
  Future<dynamic> call(String method,
      [Map<String, dynamic>? params]) async {
    await ensureConnected();
    final ws = _ws;
    if (ws == null || ws.readyState != wsOpen) {
      throw Exception('homeRemote.notConnected');
    }

    final id = _generateId();
    final completer = Completer<dynamic>();
    final timer = Timer(const Duration(seconds: 30), () {
      _pending.remove(id);
      if (!completer.isCompleted) {
        completer.completeError(
            Exception('homeRemote.${method}Timeout'));
      }
    });

    _pending[id] = _PendingRpc(completer, timer);
    ws.send(jsonEncode({
      'id': id,
      'method': method,
      if (params != null) 'params': params,
    }));

    return completer.future;
  }

  // -- Disconnect & cleanup --

  /// Disconnect and release all resources. After calling this, the
  /// client must not be reused.
  void dispose() {
    _disposed = true;
    _reconnectTimer?.cancel();
    _reconnectTimer = null;
    _upgradeSweepTimer?.cancel();
    _upgradeSweepTimer = null;
    _probeCooldown.clear();
    _upgrading = false;
    for (final pending in _pending.values) {
      if (!pending.completer.isCompleted) {
        pending.completer
            .completeError(Exception('homeRemote.disposed'));
      }
    }
    _pending.clear();
    if (_connectCompleter != null && !_connectCompleter!.isCompleted) {
      _connectCompleter!.completeError(Exception('homeRemote.disposed'));
    }
    _connectCompleter = null;
    try {
      _ws?.close();
    } catch (_) {}
    _ws = null;
    _setHomeOnline(false);
  }

  // -- Internal state helpers --

  void _setHomeOnline(bool online) {
    if (_homeOnline == online) return;
    // Suppress offline during transport upgrade to avoid UI flicker.
    if (!online && _upgrading) return;
    _homeOnline = online;
    _options.onHomeOnlineChange?.call(online);
  }

  void _setActiveCandidate(HomeRemoteCandidate? candidate) {
    if (_activeCandidate?.name == candidate?.name &&
        _activeCandidate?.url == candidate?.url) {
      return;
    }
    _activeCandidate = candidate;
    _options.onActiveTransportChange?.call(candidate);
  }

  // -- Reconnection --

  void _scheduleReconnect() {
    if (_disposed || _reconnectTimer != null) return;
    _reconnectTimer = Timer(Duration(milliseconds: _reconnectDelayMs), () {
      _reconnectTimer = null;
      ensureConnected().then((_) {
        // Connected — backoff resets in _openSocket on 'connected' event.
        // Notify listener so it can resync data after reconnection.
        _options.onReconnect?.call();
      }).catchError((_) {
        _reconnectDelayMs = min(_reconnectDelayMs * 2, 30000);
        _scheduleReconnect();
      });
    });
  }

  // -- Transport upgrade sweep --

  /// Periodically try to upgrade to a higher-priority candidate.
  void _maybeUpgradeTransport() {
    if (_disposed) return;
    if (_ws?.readyState != wsOpen) return;

    _options.resolveCandidates().then((candidates) {
      if (_disposed) return;
      final currentIdx = candidates.indexWhere(
        (c) =>
            c.name == _activeCandidate?.name &&
            c.url == _activeCandidate?.url,
      );
      if (currentIdx <= 0) return;

      // Skip candidates in cooldown.
      final now = DateTime.now().millisecondsSinceEpoch;
      var firstEligible = 0;
      while (firstEligible < currentIdx) {
        final c = candidates[firstEligible];
        final entry = _probeCooldown[c.name];
        if (entry != null) {
          final cooldown = entry.lastAttemptAt + _backoffMs(entry.failures);
          if (cooldown > now) {
            firstEligible++;
            continue;
          }
        }
        break;
      }
      if (firstEligible >= currentIdx) return;
      _tryUpgradeTo(candidates, firstEligible, currentIdx);
    }).catchError((_) {
      // Ignore — next sweep will retry.
    });
  }

  /// Backoff schedule: 1s, 2s, 4s, ..., capped at 5min.
  int _backoffMs(int failures) {
    return min(1000 * pow(2, min(failures, 9)).toInt(), 5 * 60 * 1000);
  }

  Future<void> _tryUpgradeTo(
    List<HomeRemoteCandidate> candidates,
    int from,
    int currentIdx,
  ) async {
    final perTimeout = _options.perCandidateTimeoutMs;
    for (var i = from; i < currentIdx; i++) {
      final candidate = candidates[i];
      final reachable = await _probeCandidate(candidate, perTimeout);
      if (reachable) {
        _probeCooldown.remove(candidate.name);
        _upgrading = true;
        try {
          try {
            _ws?.close();
          } catch (_) {}
          _ws = null;
          try {
            await _openSocket(candidate, perTimeout);
            _setActiveCandidate(candidate);
            _reconnectDelayMs = 1000;
          } catch (_) {
            _recordProbeFailure(candidate.name);
            _upgrading = false;
            _scheduleReconnect();
          }
        } finally {
          _upgrading = false;
        }
        return;
      }
      _recordProbeFailure(candidate.name);
    }
  }

  /// One-shot probe: open a transport to check reachability, then close.
  Future<bool> _probeCandidate(
      HomeRemoteCandidate candidate, int timeoutMs) async {
    WebSocketLike ws;
    try {
      ws = await _createTransportFor(candidate);
    } catch (_) {
      return false;
    }
    final completer = Completer<bool>();
    final timer = Timer(Duration(milliseconds: timeoutMs), () {
      try {
        ws.close();
      } catch (_) {}
      if (!completer.isCompleted) completer.complete(false);
    });
    ws.onOpen = () {
      timer.cancel();
      try {
        ws.close();
      } catch (_) {}
      if (!completer.isCompleted) completer.complete(true);
    };
    ws.onError = () {
      timer.cancel();
      if (!completer.isCompleted) completer.complete(false);
    };
    ws.onClose = () {
      timer.cancel();
      if (!completer.isCompleted) completer.complete(false);
    };
    return completer.future;
  }

  void _recordProbeFailure(String candidateName) {
    final existing = _probeCooldown[candidateName];
    _probeCooldown[candidateName] = _ProbeCooldown(
      lastAttemptAt: DateTime.now().millisecondsSinceEpoch,
      failures: (existing?.failures ?? 0) + 1,
    );
  }

  // -- Transport factory --

  FutureOr<WebSocketLike> _createTransportFor(
      HomeRemoteCandidate candidate) {
    final factory = _options.createTransport;
    if (factory != null) return factory(candidate);
    throw UnsupportedError(
        'No createTransport provided — use PlatformWebSocket from '
        'the web_socket_channel package or a mock for tests.');
  }

  // -- Terminal PTY wire frames --
  //
  // The mobile-remote path rides the JSON-RPC channel: we send a
  // `homeTerminalWsSend` RPC carrying the base64-encoded frame bytes
  // (i.e. `[version(1)][type(1)][payload(N)]`). The home forwards the
  // raw bytes to the loopback `/ws/terminal/...` WS, which decodes the
  // frame and writes stdin / resizes the pty. The TS reference lives
  // in `packages/mobile-node/src/home-remote-client.ts`.

  /// Send a framed PTY wire-protocol chunk to the active session.
  ///
  /// If [sessionId] is provided, the home routes the frame to the
  /// correct per-session sub-channel (multiple terminals may be
  /// open on a single companion).  Without [sessionId] the home
  /// falls back to the only-open-session rule (back-compat).
  ///
  /// Returns `{ ok: false, error: ... }` if the transport isn't open.
  /// Mirrors `sendTerminalFrame` in the TS HomeRemoteClient.
  ({bool ok, String? error}) sendTerminalFrame(
    Uint8List frame, {
    String? sessionId,
  }) {
    final ws = _ws;
    if (ws == null || ws.readyState != wsOpen) {
      return (ok: false, error: 'homeRemote.notConnected');
    }
    final dataBase64 = base64Encode(frame);
    final id = _generateId();
    // Fire-and-forget — terminal frames are not RPCs. The home ACKs
    // stdin writes but we don't care; if the WS is open, we trust the
    // write succeeded. (Matches the TS implementation.)
    ws.send(jsonEncode({
      'id': id,
      'method': 'homeTerminalWsSend',
      'params': {
        'dataBase64': dataBase64,
        if (sessionId != null) 'sessionId': sessionId,
      },
    }));
    return (ok: true, error: null);
  }

  /// Encode `text` as UTF-8 and send it as a PTY stdin frame.
  ({bool ok, String? error}) sendTerminalInput(
    String text, {
    String? sessionId,
  }) {
    final bytes = Uint8List.fromList(utf8.encode(text));
    return sendTerminalFrame(
      encodeTerminalFrame(TerminalWireType.stdin, bytes),
      sessionId: sessionId,
    );
  }

  /// Send a PTY resize frame. `cols` and `rows` must be > 0.
  ({bool ok, String? error}) sendTerminalResize(
    int cols,
    int rows, {
    String? sessionId,
  }) {
    if (cols <= 0 || rows <= 0) {
      return (ok: false, error: 'homeRemote.invalidDimensions');
    }
    return sendTerminalFrame(
      encodeTerminalResize(cols, rows),
      sessionId: sessionId,
    );
  }

  /// Send a best-effort `homeTerminalWsClose` RPC so the home frees
  /// the per-session state promptly. The session itself stays alive
  /// on the home; the WS sub-channel is just torn down.  If
  /// [sessionId] is given, only that session is closed.
  void closeTerminalTunnel({String? sessionId}) {
    final ws = _ws;
    if (ws == null || ws.readyState != wsOpen) return;
    final id = _generateId();
    ws.send(jsonEncode({
      'id': id,
      'method': 'homeTerminalWsClose',
      'params': {
        if (sessionId != null) 'sessionId': sessionId,
      },
    }));
  }

  // -- Helpers --

  static int _idCounter = 0;

  String _generateId() {
    _idCounter++;
    return 'rpc_${DateTime.now().millisecondsSinceEpoch}_$_idCounter';
  }
}

/// Translate a JSON-RPC error object into a typed Dart exception.
///
/// Recognises the auth-required shapes sent by the home node's
/// `ws-server.ts` and surfaces them as [UnauthorizedException] so
/// callers can take a specific action (delete session token, stop
/// reconnect supervisor, show re-pair UI). Any other error is
/// preserved as a generic [Exception] for back-compat.
Exception _decodeRpcError(Map<String, dynamic>? err) {
  if (err == null) {
    return Exception('homeRemote.rpcFailed');
  }
  final code = err['code'] as String?;
  final message = err['message'] as String? ?? 'homeRemote.rpcFailed';
  final isUnauthorized = code == 'UNAUTHORIZED' ||
      (code == 'ERROR' && message == 'Authentication required');
  if (isUnauthorized) {
    return UnauthorizedException(message);
  }
  return Exception(message);
}
