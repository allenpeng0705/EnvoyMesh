import 'dart:typed_data';
import '../models/terminal_session.dart';

/// Terminal PTY tunnel service.
///
/// Manages terminal session lifecycle: list, create, attach, send
/// keystrokes, detach, close. Uses JSON-RPC calls for session
/// management and a binary channel for PTY I/O.
class TerminalService {
  final Future<dynamic> Function(String method,
      [Map<String, dynamic>? params]) _call;

  TerminalService(this._call);

  /// List active terminal sessions on the home node.
  Future<List<TerminalSession>> listSessions() async {
    final result = await _call('listTerminalSessions');
    final list = result as List<dynamic>;
    return list
        .map((e) =>
            TerminalSession.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// Create a new terminal session.
  Future<Map<String, dynamic>> createSession(
      {String? cwd, String? command}) async {
    return await _call('createTerminalSession', {
      if (cwd != null) 'cwd': cwd,
      if (command != null) 'command': command,
    }) as Map<String, dynamic>;
  }

  /// Attach to a terminal PTY (returns the WS sub-channel path).
  Future<Map<String, dynamic>> attach(String sessionId) async {
    return await _call('homeTerminalWsOpen', {
      'pathWithQuery': '/attach?sessionId=$sessionId',
    }) as Map<String, dynamic>;
  }

  /// Send keystrokes (base64-encoded) to the PTY.
  Future<void> sendKeystrokes(String dataBase64) async {
    await _call('homeTerminalWsSend', {'dataBase64': dataBase64});
  }

  /// Send raw text input to the terminal.
  Future<void> sendInput(String text) async {
    final bytes = Uint8List.fromList(text.codeUnits);
    final dataBase64 = _base64Encode(bytes);
    await sendKeystrokes(dataBase64);
  }

  /// Detach from the PTY.
  Future<void> detach() async {
    await _call('homeTerminalWsClose', {});
  }

  /// Close a terminal session.
  Future<void> closeSession(String sessionId) async {
    await _call('closeTerminalSession', {'sessionId': sessionId});
  }

  /// Rename a terminal session.
  Future<void> renameSession(String sessionId, String name) async {
    await _call('renameTerminalSession', {
      'sessionId': sessionId,
      'name': name,
    });
  }

  // Simple base64 encoder (no external dep needed for terminal input).
  static String _base64Encode(Uint8List bytes) {
    const chars =
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    final buffer = StringBuffer();
    var i = 0;
    while (i < bytes.length) {
      final b0 = bytes[i];
      final b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
      final b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
      buffer.write(chars[(b0 >> 2) & 63]);
      buffer.write(chars[((b0 << 4) | (b1 >> 4)) & 63]);
      buffer.write(
          i + 1 < bytes.length ? chars[((b1 << 2) | (b2 >> 6)) & 63] : '=');
      buffer.write(i + 2 < bytes.length ? chars[b2 & 63] : '=');
      i += 3;
    }
    return buffer.toString();
  }
}
