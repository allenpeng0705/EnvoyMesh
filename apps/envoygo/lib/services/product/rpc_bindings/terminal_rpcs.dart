import '../../../models/terminal_session.dart';
import '../../home_rpc_session.dart';

/// Terminal bindings: sessions, PTY I/O and Terminal Agent assist.
mixin TerminalRpcs on HomeRpcSession {
  Future<List<TerminalSession>> listTerminalSessions() async {
    final result = await homeClient.call('listTerminalSessions');
    final list = result as List<dynamic>;
    return list
        .map((e) => TerminalSession.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<Map<String, dynamic>> createTerminalSession({
    String? cwd,
    String? command,
  }) async {
    return await homeClient.call('createTerminalSession', {
          if (cwd != null) 'cwd': cwd,
          if (command != null) 'title': command,
        })
        as Map<String, dynamic>;
  }

  Future<void> closeTerminalSession(String sessionId) async {
    await homeClient.call('closeTerminalSession', {'sessionId': sessionId});
  }

  // -- Inbox / Intro proposals --

  /// Execute a command in a terminal session and return output.
  /// Uses `writeStdin` + `getScrollbackTail` — no persistent
  /// WebSocket sub-channel needed.  For quick commands (ls, pwd, cd)
  /// the 500 ms wait inside the node is ample; for longer commands
  /// call this again later to poll.
  Future<Map<String, dynamic>> terminalExec(
    String sessionId,
    String command,
  ) async {
    return await homeClient.call('terminalExec', {
          'sessionId': sessionId,
          'command': command,
        })
        as Map<String, dynamic>;
  }

  /// Request a terminal attach URL from the home node.
  /// Returns `{ sessionId, token, wsUrl, cols, rows }`.
  Future<Map<String, dynamic>> terminalAttach(
    String sessionId, {
    int? cols,
    int? rows,
  }) async {
    return await homeClient.call('terminalAttach', {
          'sessionId': sessionId,
          if (cols != null) 'cols': cols,
          if (rows != null) 'rows': rows,
        })
        as Map<String, dynamic>;
  }

  // -- Terminal Agent assist (shell sessions; Social TerminalAgentBar parity) --

  Future<Map<String, dynamic>> terminalGetAssistState(String sessionId) async {
    return await homeClient.call('terminalGetAssistState', {
          'sessionId': sessionId,
        })
        as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> terminalRunFromNaturalLanguage({
    required String sessionId,
    required String prompt,
  }) async {
    return await homeClient.call('terminalRunFromNaturalLanguage', {
          'sessionId': sessionId,
          'prompt': prompt,
        }, const Duration(seconds: 120))
        as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> terminalExecuteProposal({
    required String sessionId,
    required String proposalId,
    bool? confirmed,
  }) async {
    return await homeClient.call('terminalExecuteProposal', {
          'sessionId': sessionId,
          'proposalId': proposalId,
          if (confirmed != null) 'confirmed': confirmed,
        })
        as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> terminalSetAssistModelOverride({
    required String sessionId,
    required String modelName,
  }) async {
    return await homeClient.call('terminalSetAssistModelOverride', {
          'sessionId': sessionId,
          'modelName': modelName,
        })
        as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> terminalExplainScrollback({
    required String sessionId,
    String? topic,
  }) async {
    return await homeClient.call('terminalExplainScrollback', {
          'sessionId': sessionId,
          if (topic != null) 'topic': topic,
        }, const Duration(seconds: 120))
        as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> terminalSetInlineSuggestEnabled({
    required String sessionId,
    required bool enabled,
  }) async {
    return await homeClient.call('terminalSetInlineSuggestEnabled', {
          'sessionId': sessionId,
          'enabled': enabled,
        })
        as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> terminalObserveStep({
    required String sessionId,
    required String goal,
  }) async {
    return await homeClient.call('terminalObserveStep', {
          'sessionId': sessionId,
          'goal': goal,
        }, const Duration(seconds: 180))
        as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> terminalOpenClawPlan({
    required String sessionId,
    required String prompt,
  }) async {
    return await homeClient.call('terminalOpenClawPlan', {
          'sessionId': sessionId,
          'prompt': prompt,
        }, const Duration(seconds: 180))
        as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> terminalRunPlanStep({
    required String sessionId,
    required String planId,
    required int stepIndex,
  }) async {
    return await homeClient.call('terminalRunPlanStep', {
          'sessionId': sessionId,
          'planId': planId,
          'stepIndex': stepIndex,
        }, const Duration(seconds: 120))
        as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> terminalEnablePrepareMode({
    required String sessionId,
    required bool enabled,
  }) async {
    return await homeClient.call('terminalEnablePrepareMode', {
          'sessionId': sessionId,
          'enabled': enabled,
        })
        as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> terminalWatchStep({
    required String sessionId,
    required String goal,
  }) async {
    return await homeClient.call('terminalWatchStep', {
          'sessionId': sessionId,
          'goal': goal,
        }, const Duration(seconds: 120))
        as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> terminalPinContextSession({
    required String sessionId,
    String? contextSessionId,
  }) async {
    return await homeClient.call('terminalPinContextSession', {
          'sessionId': sessionId,
          if (contextSessionId != null) 'contextSessionId': contextSessionId,
        })
        as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> terminalStartGoalLoop({
    required String sessionId,
    required String goal,
  }) async {
    return await homeClient.call('terminalStartGoalLoop', {
          'sessionId': sessionId,
          'goal': goal,
        }, const Duration(seconds: 180))
        as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> terminalAdvanceGoalLoop({
    required String sessionId,
  }) async {
    return await homeClient.call('terminalAdvanceGoalLoop', {
          'sessionId': sessionId,
        }, const Duration(seconds: 180))
        as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> terminalCancelGoalLoop({
    required String sessionId,
  }) async {
    return await homeClient.call('terminalCancelGoalLoop', {
          'sessionId': sessionId,
        })
        as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> terminalClearResumeGoal(String sessionId) async {
    return await homeClient.call('terminalClearResumeGoal', {
          'sessionId': sessionId,
        })
        as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> terminalEnableExecPane({
    required String sessionId,
    required bool enabled,
  }) async {
    return await homeClient.call('terminalEnableExecPane', {
          'sessionId': sessionId,
          'enabled': enabled,
        })
        as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> terminalSetBackgroundWatch({
    required String sessionId,
    required String goal,
  }) async {
    return await homeClient.call('terminalSetBackgroundWatch', {
          'sessionId': sessionId,
          'goal': goal,
        })
        as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> terminalClearBackgroundWatch({
    required String sessionId,
  }) async {
    return await homeClient.call('terminalClearBackgroundWatch', {
          'sessionId': sessionId,
        })
        as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> terminalUpdatePlanProgress({
    required String sessionId,
    required String planId,
    int? skippedStepIndex,
  }) async {
    return await homeClient.call('terminalUpdatePlanProgress', {
          'sessionId': sessionId,
          'planId': planId,
          if (skippedStepIndex != null) 'skippedStepIndex': skippedStepIndex,
        })
        as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> terminalSuggestFixFromFailure({
    required String sessionId,
  }) async {
    return await homeClient.call('terminalSuggestFixFromFailure', {
          'sessionId': sessionId,
        }, const Duration(seconds: 120))
        as Map<String, dynamic>;
  }

  /// Open a PTY WebSocket sub-channel using the path from terminalAttach.
  Future<Map<String, dynamic>> homeTerminalWsOpen(String sessionId) async {
    // terminalAttach returns a full URL like:
    // ws://127.0.0.1:3032/ws/terminal/<id>?token=<t>
    // homeTerminalWsOpen expects just the path+query portion.
    final attachResult = await terminalAttach(sessionId);
    final wsUrl = attachResult['wsUrl'] as String?;
    if (wsUrl == null || wsUrl.isEmpty) {
      throw Exception('terminalAttach did not return wsUrl');
    }
    final uri = Uri.parse(wsUrl);
    final pathWithQuery = '${uri.path}${uri.hasQuery ? '?${uri.query}' : ''}';
    return await homeClient.call('homeTerminalWsOpen', {
          'pathWithQuery': pathWithQuery,
        })
        as Map<String, dynamic>;
  }

  /// Send keystrokes (base64-encoded) through the PTY WebSocket.
  /// [sessionId] routes the frame to the right per-session sub-channel
  /// when multiple sessions are open on the same companion.
  Future<Map<String, dynamic>> homeTerminalWsSend(
    String dataBase64, {
    String? sessionId,
  }) async {
    return await homeClient.call('homeTerminalWsSend', {
          'dataBase64': dataBase64,
          if (sessionId != null) 'sessionId': sessionId,
        })
        as Map<String, dynamic>;
  }

  /// Close the PTY WebSocket sub-channel.  If [sessionId] is given,
  /// only that session's sub-channel is torn down; otherwise the
  /// home closes all sub-channels for this companion.
  Future<void> homeTerminalWsClose({String? sessionId}) async {
    await homeClient.call('homeTerminalWsClose', {
      if (sessionId != null) 'sessionId': sessionId,
    });
  }

  // -- Profile --
}
