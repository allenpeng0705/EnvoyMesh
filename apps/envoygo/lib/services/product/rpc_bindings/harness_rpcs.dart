import '../../../coding/coding_heartbeat.dart';
import '../../home_rpc_session.dart';

/// Coding-harness bindings: Envoy Harness chats/turns, coding heartbeats.
mixin HarnessRpcs on HomeRpcSession {
  Future<List<Map<String, dynamic>>> listEnvoyHarnessChats() async {
    final result = await homeClient.call('listEnvoyHarnessChats');
    return (result as List<dynamic>)
        .map((e) => (e as Map).cast<String, dynamic>())
        .toList();
  }

  Future<Map<String, dynamic>> createEnvoyHarnessChat({
    required String cwd,
    String? title,
  }) async {
    return await homeClient.call('createEnvoyHarnessChat', {
          'cwd': cwd,
          if (title != null) 'title': title,
        }, const Duration(seconds: 30))
        as Map<String, dynamic>;
  }

  /// Phase 68-C2 — build peer-review invite text. Caller must
  /// [sendChat] with the returned `messageText`.
  Future<Map<String, dynamic>> createCodingReviewInvite({
    required String chatId,
    required String peerOwnerId,
    String? turnId,
  }) async {
    return await homeClient.call('createCodingReviewInvite', {
          'chatId': chatId,
          'peerOwnerId': peerOwnerId,
          if (turnId != null) 'turnId': turnId,
        }, const Duration(seconds: 30))
        as Map<String, dynamic>;
  }

  /// Phase 68-C6 — list Coding heartbeats (cron wakes existing workspace).
  Future<List<CodingHeartbeat>> listCodingHeartbeats() async {
    final result = await homeClient.call('listCodingHeartbeats');
    final list = (result as List<dynamic>?) ?? const [];
    return list
        .whereType<Map>()
        .map((e) => CodingHeartbeat.fromJson(Map<String, dynamic>.from(e)))
        .toList(growable: false);
  }

  /// Phase 68-C6 — create a Coding heartbeat for an existing workspace.
  Future<CodingHeartbeat> createCodingHeartbeat(
    CreateCodingHeartbeatInput input,
  ) async {
    final result = await homeClient.call(
      'createCodingHeartbeat',
      input.toJson(),
      const Duration(seconds: 30),
    );
    return CodingHeartbeat.fromJson(
      Map<String, dynamic>.from(result as Map),
    );
  }

  /// Phase 68-C6 — update name / cron / prompt / enabled.
  Future<CodingHeartbeat> updateCodingHeartbeat({
    required String id,
    bool? enabled,
    String? cron,
    String? prompt,
    String? name,
  }) async {
    final result = await homeClient.call(
      'updateCodingHeartbeat',
      {
        'id': id.trim(),
        if (enabled != null) 'enabled': enabled,
        if (cron != null) 'cron': cron,
        if (prompt != null) 'prompt': prompt,
        if (name != null) 'name': name,
      },
      const Duration(seconds: 30),
    );
    return CodingHeartbeat.fromJson(
      Map<String, dynamic>.from(result as Map),
    );
  }

  /// Phase 68-C6 — delete a Coding heartbeat.
  Future<bool> deleteCodingHeartbeat(String id) async {
    final result = await homeClient.call('deleteCodingHeartbeat', {
      'id': id.trim(),
    });
    if (result is Map && result['deleted'] == true) return true;
    return result == true;
  }

  /// Phase 68-C6 — force-fire a heartbeat (still skips if turn busy).
  Future<CodingHeartbeat> runCodingHeartbeatNow(String id) async {
    final result = await homeClient.call(
      'runCodingHeartbeatNow',
      {'id': id.trim()},
      const Duration(seconds: 60),
    );
    return CodingHeartbeat.fromJson(
      Map<String, dynamic>.from(result as Map),
    );
  }

  Future<Map<String, dynamic>> openEnvoyHarnessChat(String chatId) async {
    return await homeClient.call('openEnvoyHarnessChat', {
          'chatId': chatId,
        }, const Duration(seconds: 30))
        as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> removeEnvoyHarnessChat(String chatId) async {
    return await homeClient.call('removeEnvoyHarnessChat', {'chatId': chatId})
        as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> deleteEnvoyHarnessChatTurn({
    required String turnId,
    String? chatId,
  }) async {
    return await homeClient.call('deleteEnvoyHarnessChatTurn', {
          'turnId': turnId,
          if (chatId != null) 'chatId': chatId,
        }, const Duration(seconds: 30))
        as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>?> getEnvoyHarnessTurnReview(String turnId) async {
    final result = await homeClient.call('getEnvoyHarnessTurnReview', {
      'turnId': turnId,
    }, const Duration(seconds: 30));
    return result is Map ? Map<String, dynamic>.from(result) : null;
  }

  Future<Map<String, dynamic>> revertEnvoyHarnessTurn(String turnId) async {
    return await homeClient.call('revertEnvoyHarnessTurn', {
          'turnId': turnId,
        }, const Duration(seconds: 30))
        as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> acceptEnvoyHarnessTurnReview(
    String turnId, {
    List<String>? paths,
  }) async {
    return await homeClient.call(
      'acceptEnvoyHarnessTurnReview',
      {
        'turnId': turnId,
        if (paths != null) 'paths': paths,
      },
      const Duration(seconds: 30),
    ) as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> revertEnvoyHarnessTurnFiles(
    String turnId,
    List<String> paths,
  ) async {
    return await homeClient.call(
      'revertEnvoyHarnessTurnFiles',
      {
        'turnId': turnId,
        'paths': paths,
      },
      const Duration(seconds: 30),
    ) as Map<String, dynamic>;
  }

  Future<void> openEnvoyHarnessFile(String path, {String? chatId}) async {
    await homeClient.call('openEnvoyHarnessFile', {
      'path': path,
      if (chatId != null) 'chatId': chatId,
    }, const Duration(seconds: 30));
  }

  Future<Map<String, dynamic>> getEnvoyHarnessCommandCatalog() async {
    return await homeClient.call('getEnvoyHarnessCommandCatalog')
        as Map<String, dynamic>;
  }

  Future<void> recordEnvoyHarnessUxEvent(Map<String, dynamic> event) async {
    await homeClient.call('recordEnvoyHarnessUxEvent', event);
  }

  Future<Map<String, dynamic>> startEnvoyHarnessTurn(
    String text, {
    String? chatId,
    List<Map<String, String>>? attachments,
  }) async {
    return await homeClient.call('startEnvoyHarnessTurn', {
          'text': text,
          if (chatId != null) 'chatId': chatId,
          if (attachments != null && attachments.isNotEmpty)
            'attachments': attachments,
        }, const Duration(seconds: 120))
        as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> getEnvoyHarnessChatHistory({
    String? chatId,
    int? sinceRevision,
  }) async {
    return await homeClient.call(
          'getEnvoyHarnessChatHistory',
          {
            if (chatId != null) 'chatId': chatId,
            if (sinceRevision != null) 'sinceRevision': sinceRevision,
          },
          const Duration(seconds: 30),
        )
        as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> cancelEnvoyHarnessTurn({String? chatId}) async {
    return await homeClient.call(
          'cancelEnvoyHarnessTurn',
          chatId != null ? {'chatId': chatId} : {},
        )
        as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> getEnvoyHarnessStatus() async {
    return await homeClient.call('getEnvoyHarnessStatus') as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> setEnvoyHarnessAutoRunPolicy(
    String policy,
  ) async {
    return await homeClient.call('setEnvoyHarnessAutoRunPolicy', {
          'policy': policy,
        })
        as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> ehRespondToPermission({
    required String requestId,
    required bool allowed,
  }) async {
    return await homeClient.call('ehRespondToPermission', {
          'requestId': requestId,
          'allowed': allowed,
        })
        as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> ehRespondToUserQuestion({
    required String requestId,
    required String value,
    int? optionIndex,
    bool? cancelled,
  }) async {
    return await homeClient.call('ehRespondToUserQuestion', {
          'requestId': requestId,
          'value': value,
          if (optionIndex != null) 'optionIndex': optionIndex,
          if (cancelled != null) 'cancelled': cancelled,
        })
        as Map<String, dynamic>;
  }

  Future<dynamic> invokeEnvoyHarnessEhui(Map<String, dynamic> request) async {
    return await homeClient.call('invokeEnvoyHarnessEhui', {'request': request});
  }

  Future<Map<String, dynamic>> getEnvoyHarnessTurnStatus({
    String? chatId,
  }) async {
    return await homeClient.call(
          'getEnvoyHarnessTurnStatus',
          chatId != null ? {'chatId': chatId} : {},
        )
        as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> setEnvoyHarnessProjectPath(String path) async {
    return await homeClient.call('setEnvoyHarnessProjectPath', {'path': path})
        as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> ensureEnvoyTerminalSession({
    required String projectPath,
    String? sessionId,
    bool forceRestart = false,
  }) async {
    return await homeClient.call('ensureEnvoyTerminalSession', {
          'projectPath': projectPath,
          if (sessionId != null) 'sessionId': sessionId,
          'forceRestart': forceRestart,
        })
        as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> resetEnvoyHarnessChat({String? chatId}) async {
    return await homeClient.call(
          'resetEnvoyHarnessChat',
          chatId != null ? {'chatId': chatId} : {},
        )
        as Map<String, dynamic>;
  }

  Future<List<Map<String, dynamic>>> listEnvoyHarnessPeers() async {
    final result = await homeClient.call('listEnvoyHarnessPeers');
    return (result as List<dynamic>)
        .map((e) => (e as Map).cast<String, dynamic>())
        .toList();
  }

  // -- Terminals --
}
