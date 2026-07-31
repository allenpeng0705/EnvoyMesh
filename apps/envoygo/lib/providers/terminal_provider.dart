import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/terminal_session.dart';
import 'contact_provider.dart';

/// State for terminal sessions.
class TerminalState {
  final List<TerminalSession> sessions;
  final bool isLoading;

  const TerminalState({
    this.sessions = const [],
    this.isLoading = false,
  });

  TerminalState copyWith(
      {List<TerminalSession>? sessions, bool? isLoading}) {
    return TerminalState(
      sessions: sessions ?? this.sessions,
      isLoading: isLoading ?? this.isLoading,
    );
  }
}

/// Provider for terminal session state.
final terminalProvider =
    StateNotifierProvider<TerminalNotifier, TerminalState>((ref) {
  return TerminalNotifier(ref);
});

class TerminalNotifier extends StateNotifier<TerminalState> {
  final Ref _ref;

  TerminalNotifier(this._ref) : super(const TerminalState());

  /// Load active terminal sessions from the home node.
  Future<void> loadSessions() async {
    final nodeService = _ref.read(nodeServiceProvider);
    if (nodeService == null) return;

    try {
      state = state.copyWith(isLoading: true);
      final sessions = await nodeService.listTerminalSessions();
      state = state.copyWith(sessions: sessions, isLoading: false);
    } catch (_) {
      state = state.copyWith(isLoading: false);
    }
  }

  /// Set sessions directly (used during sync).
  void setSessions(List<TerminalSession> sessions) {
    state = state.copyWith(sessions: sessions, isLoading: false);
  }

  /// Clear all sessions (used on unpair).
  void clear() {
    state = const TerminalState();
  }

  /// Create a new terminal session.
  Future<void> createSession({String? cwd, String? command}) async {
    final nodeService = _ref.read(nodeServiceProvider);
    if (nodeService == null) return;
    await nodeService.createTerminalSession(cwd: cwd, command: command);
    await loadSessions();
  }

  /// Close a terminal session.
  Future<void> closeSession(String sessionId) async {
    final nodeService = _ref.read(nodeServiceProvider);
    if (nodeService == null) return;
    await nodeService.closeTerminalSession(sessionId);
    state = state.copyWith(
      sessions:
          state.sessions.where((s) => s.id != sessionId).toList(),
    );
  }
}
