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

  /// Attach to a terminal session (opens PTY channel).
  Future<void> attach(String sessionId) async {
    await _client.homeTerminalWsOpen(sessionId);
    _activeSessionId = sessionId;
  }

  /// Send a command to the terminal (appends newline).
  Future<void> sendCommand(String command) async {
    if (_activeSessionId == null) return;
    // Append newline so the shell executes the command.
    final data = '$command\n';
    final base64 = base64Encode(utf8.encode(data));
    await _client.homeTerminalWsSend(base64);
  }

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
