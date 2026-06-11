import 'dart:convert';
import 'node_service_client.dart';
import '../models/terminal_session.dart';

/// Terminal PTY service — manages terminal lifecycle and I/O.
///
/// Commands are sent through the main JSON-RPC channel via
/// `homeTerminalWsSend` (base64-encoded keystrokes). Output is
/// received via the `terminal:rx` push event from the home node.
class TerminalService {
  final NodeServiceClient _client;
  String? _activeSessionId;

  /// Callback for terminal output (decoded from base64 push events).
  void Function(String text)? onOutput;

  TerminalService(this._client);

  /// List active terminal sessions on the home node.
  Future<List<TerminalSession>> listSessions() async {
    return _client.listTerminalSessions();
  }

  /// Create a new terminal session.
  Future<Map<String, dynamic>> createSession(
      {String? cwd, String? command}) async {
    return _client.createTerminalSession(cwd: cwd, command: command);
  }

  /// Try to open a persistent WebSocket sub-channel for real-time PTY I/O.
  /// If this succeeds, subsequent output arrives via `terminal:rx` push
  /// events.  Commands can still use `terminalExec` as a fallback.
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

  /// Send a command and return output.
  ///
  /// Tries the persistent WebSocket path first; falls back to the
  /// simple `terminalExec` RPC if no stream is attached.
  Future<String> sendCommand(String command) async {
    final sessionId = _activeSessionId;
    if (sessionId == null) {
      throw Exception('Terminal not attached');
    }

    // If we have a live WS stream, send through it for real-time output.
    if (_wsAttached) {
      try {
        final data = '$command\r';
        final b64 = base64Encode(utf8.encode(data));
        final result = await _client.homeTerminalWsSend(b64);
        if (result['ok'] != true) {
          // Stream dropped — mark disconnected and fall through.
          _wsAttached = false;
        } else {
          return ''; // Output arrives via push events.
        }
      } catch (_) {
        _wsAttached = false;
      }
    }

    // Fallback: simple RPC for instant output.
    final result = await _client.terminalExec(sessionId, command);
    return result['output'] as String? ?? '';
  }

  bool _wsAttached = false;

  /// Send raw keystrokes (base64-encoded) to the terminal.
  Future<void> sendKeystrokes(String dataBase64) async {
    if (_activeSessionId == null) return;
    await _client.homeTerminalWsSend(dataBase64);
  }

  /// Detach from the PTY channel.
  Future<void> detach() async {
    _activeSessionId = null;
    await _client.homeTerminalWsClose();
  }

  /// Close a terminal session.
  Future<void> closeSession(String sessionId) async {
    if (_activeSessionId == sessionId) {
      await detach();
    }
    await _client.closeTerminalSession(sessionId);
  }
}
