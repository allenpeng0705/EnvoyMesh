import 'dart:typed_data';

import 'package:envoy_thin_client/services/home_remote_client.dart';

import '../models/terminal_session.dart';
import 'node_service_client.dart';

/// Terminal PTY service — manages terminal lifecycle and I/O.
///
/// Keystrokes are sent through the [HomeRemoteClient] which frames
/// them as `[version(1)][type(0=stdin)][payload(utf8)]` per the
/// PTY wire protocol (`packages/api/src/terminal-wire.ts`). Output is
/// received via the `homeTerminalWs:rx` push event from the home node
/// (see `terminal_detail_screen.dart`).
class TerminalService {
  final NodeServiceClient _client;
  final HomeRemoteClient _remote;
  String? _activeSessionId;

  /// Callback for terminal output (decoded from base64 push events).
  void Function(String text)? onOutput;

  TerminalService(this._client, this._remote);

  /// List active terminal sessions on the home node.
  Future<List<TerminalSession>> listSessions() async {
    return _client.listTerminalSessions();
  }

  /// Create a new terminal session.
  Future<Map<String, dynamic>> createSession(
      {String? cwd, String? command}) async {
    return _client.createTerminalSession(cwd: cwd, command: command);
  }

  /// Open a persistent PTY WebSocket sub-channel for real-time I/O.
  /// After this returns, the home will forward `homeTerminalWs:rx`
  /// push events with `dataBase64` frames.
  Future<void> attach(String sessionId) async {
    final result = await _client.homeTerminalWsOpen(sessionId);
    if (result['ok'] != true) {
      final err = result['error'] as String? ?? 'Unknown error';
      throw Exception('Terminal stream attach failed: $err');
    }
    _activeSessionId = sessionId;
    _wsAttached = true;
  }

  /// Set the active session for simple RPC commands only.
  void setActiveSession(String sessionId) {
    _activeSessionId = sessionId;
  }

  /// Send raw bytes to the active session's stdin.
  ///
  /// In streaming mode (WS attached) this is fire-and-forget — the
  /// output arrives as `homeTerminalWs:rx` push events. Returns
  /// `true` if the bytes were queued, `false` if the stream
  /// rejected the write (the service internally marks itself as
  /// disconnected; the caller should treat subsequent `sendKey`
  /// calls as best-effort).
  ///
  /// Falls back to nothing if no stream is attached — there is no
  /// useful "sendCommand" semantics in that mode. Use the
  /// `terminalExec` RPC at the NodeServiceClient level for
  /// one-shot "run this command and get the result" use cases.
  bool sendKey(String command) {
    final sessionId = _activeSessionId;
    if (sessionId == null) return false;
    final result = _remote.sendTerminalInput(command, sessionId: sessionId);
    if (!result.ok) _wsAttached = false;
    return result.ok;
  }

  bool _wsAttached = false;

  /// Whether the WS sub-channel is currently attached.
  bool get isAttached => _wsAttached;

  /// Send a control byte (e.g. `0x03` for Ctrl-C) as a stdin frame.
  bool sendControlByte(int byte) {
    final sessionId = _activeSessionId;
    if (sessionId == null) return false;
    final result = _remote.sendTerminalFrame(
      encodeTerminalFrame(
        TerminalWireType.stdin,
        Uint8List.fromList([byte]),
      ),
      sessionId: sessionId,
    );
    if (!result.ok) _wsAttached = false;
    return result.ok;
  }

  /// Send arbitrary raw bytes to the PTY stdin. Used for
  /// terminal-to-host responses (e.g. DSR cursor-position report).
  bool sendRaw(Uint8List bytes) {
    final sessionId = _activeSessionId;
    if (sessionId == null) return false;
    final result = _remote.sendTerminalFrame(
      encodeTerminalFrame(TerminalWireType.stdin, bytes),
      sessionId: sessionId,
    );
    if (!result.ok) _wsAttached = false;
    return result.ok;
  }

  /// Send a pty resize event. `cols` and `rows` must be > 0; otherwise
  /// the call is ignored.
  void sendResize(int cols, int rows) {
    final sessionId = _activeSessionId;
    if (sessionId == null) return;
    _remote.sendTerminalResize(cols, rows, sessionId: sessionId);
  }

  /// Detach from the PTY sub-channel. The session itself stays alive
  /// on the home; this only tears down the live I/O channel.
  Future<void> detach() async {
    final sessionId = _activeSessionId;
    _activeSessionId = null;
    _wsAttached = false;
    if (sessionId != null) {
      _remote.closeTerminalTunnel(sessionId: sessionId);
    } else {
      _remote.closeTerminalTunnel();
    }
  }

  /// Close a terminal session on the home.
  Future<void> closeSession(String sessionId) async {
    if (_activeSessionId == sessionId) {
      await detach();
    }
    await _client.closeTerminalSession(sessionId);
  }
}
