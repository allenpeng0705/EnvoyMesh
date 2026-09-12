import '../../home_rpc_session.dart';

/// Agent bindings: external agents, home filesystem, Envoy Local, Pi.
mixin AgentRpcs on HomeRpcSession {
  /// AI model settings (Phase EnvoyGo settings) — push a `modelProviders`
  /// update to the home node. Caller should send a **full** merged
  /// `ModelProviderConfig` object (shallow replace on the server).
  ///
  /// Returns `true` on success. Throws on transport / RPC error.
  /// Note: `updateNodeConfig` returns void — do not expect `{ok:true}`.
  Future<bool> updateModelProviders(Map<String, dynamic> modelProviders) async {
    await homeClient.call('updateNodeConfig', {'modelProviders': modelProviders});
    return true;
  }

  /// Soft probe of Ext Agent reachability (does not block switching).
  Future<Map<String, dynamic>> probeExtAgent({String? agentId}) async {
    return await homeClient.call('probeExtAgent', {
          if (agentId != null && agentId.trim().isNotEmpty)
            'agentId': agentId.trim(),
        })
        as Map<String, dynamic>;
  }

  /// Sync ask to an Ext Agent (Coding Tier B).
  ///
  /// When [streamSessionId] is set, streaming backends (codex / claudecode)
  /// emit assistant token upserts on `eh:timeline` under
  /// `__ext__:$streamSessionId`. One-shot backends ignore streaming and
  /// still return a sync reply.
  Future<String> askExtAgent({
    required String prompt,
    String? agentId,
    String? streamSessionId,
  }) async {
    final result = await homeClient.call('askExtAgent', {
      'prompt': prompt,
      if (agentId != null && agentId.trim().isNotEmpty)
        'agentId': agentId.trim(),
      if (streamSessionId != null && streamSessionId.trim().isNotEmpty)
        'streamSessionId': streamSessionId.trim(),
    }, const Duration(minutes: 5));
    if (result is String) return result;
    if (result is Map && result['text'] is String) {
      return result['text'] as String;
    }
    return result?.toString() ?? '';
  }

  /// Slash-command catalog for Ext Agent chat autocomplete.
  Future<Map<String, dynamic>> getExtAgentCommandCatalog({
    String? agentId,
  }) async {
    return await homeClient.call('getExtAgentCommandCatalog', {
          if (agentId != null && agentId.trim().isNotEmpty)
            'agentId': agentId.trim(),
        })
        as Map<String, dynamic>;
  }

  /// EnvoyAI (OpenClaw) slash-command catalog.
  Future<Map<String, dynamic>> getEnvoyAiCommandCatalog() async {
    return await homeClient.call('getEnvoyAiCommandCatalog')
        as Map<String, dynamic>;
  }

  /// Set or clear Ext Agent session model (`/model`).
  Future<Map<String, dynamic>> setExtAgentSessionModel({
    String? agentId,
    String? model,
  }) async {
    return await homeClient.call('setExtAgentSessionModel', {
          if (agentId != null && agentId.trim().isNotEmpty)
            'agentId': agentId.trim(),
          'model': model,
        })
        as Map<String, dynamic>;
  }

  /// Home-node filesystem info for folder browsing (owner only).
  Future<Map<String, dynamic>> getHomeFsInfo() async {
    return await homeClient.call('getHomeFsInfo') as Map<String, dynamic>;
  }

  /// List directory entries on the home node (owner only).
  Future<Map<String, dynamic>> listHomeFsEntries({
    String? path,
    bool? dirsOnly,
  }) async {
    return await homeClient.call('listHomeFsEntries', {
          if (path != null && path.trim().isNotEmpty) 'path': path.trim(),
          if (dirsOnly != null) 'dirsOnly': dirsOnly,
        })
        as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> getExtAgentProjectPath({String? agentId}) async {
    return await homeClient.call('getExtAgentProjectPath', {
          if (agentId != null && agentId.trim().isNotEmpty)
            'agentId': agentId.trim(),
        })
        as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> setExtAgentProjectPath({
    String? agentId,
    String? projectPath,
  }) async {
    return await homeClient.call('setExtAgentProjectPath', {
          if (agentId != null && agentId.trim().isNotEmpty)
            'agentId': agentId.trim(),
          'projectPath': projectPath,
        })
        as Map<String, dynamic>;
  }

  /// Preview a home-node file for the Home files viewer (owner only).
  Future<Map<String, dynamic>> previewHomeFsFile(String path) async {
    return await homeClient.call('previewHomeFsFile', {'path': path.trim()})
        as Map<String, dynamic>;
  }

  /// MiniMax MMX-CLI media / status on the home node (owner only).
  Future<Map<String, dynamic>> runMmxMediaCommand({
    required String kind,
    String? prompt,
    String? target,
  }) async {
    return await homeClient.call('runMmxMediaCommand', {
          'kind': kind,
          if (prompt != null) 'prompt': prompt,
          if (target != null) 'target': target,
        }, const Duration(seconds: 920))
        as Map<String, dynamic>;
  }

  /// Upload a phone/browser blob into home `{profileDir}/envoy-uploads/`.
  Future<Map<String, dynamic>> uploadEnvoyAttachment({
    required String filename,
    required String contentBase64,
    String? mimeType,
  }) async {
    return await homeClient.call('uploadEnvoyAttachment', {
          'filename': filename,
          'contentBase64': contentBase64,
          if (mimeType != null) 'mimeType': mimeType,
        }, const Duration(seconds: 120))
        as Map<String, dynamic>;
  }

  /// Build agent prompt appendix from home absolute paths.
  Future<Map<String, dynamic>> buildAgentAttachmentContext(
    List<Map<String, String>> attachments,
  ) async {
    return await homeClient.call('buildAgentAttachmentContext', {
          'attachments': attachments,
        }, const Duration(seconds: 60))
        as Map<String, dynamic>;
  }

  /// Switch the active Ext Agent id only (existing agent URLs preserved).
  Future<bool> setActiveExtAgentId(String agentId) async {
    await homeClient.call('updateNodeConfig', {
      'activeExtAgentId': agentId.trim(),
    });
    return true;
  }

  // -- Envoy Local (home-node llama.cpp; downloads run on the home, not phone) --

  Future<Map<String, dynamic>> getEnvoyLocalStatus() async {
    return await homeClient.call('getEnvoyLocalStatus') as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> enableEnvoyLocal({
    bool skipModelDownload = false,
  }) async {
    return await homeClient.call('enableEnvoyLocal', {
          'skipModelDownload': skipModelDownload,
        }, const Duration(seconds: 60))
        as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> startEnvoyLocal() async {
    return await homeClient.call(
          'startEnvoyLocal',
          const {},
          const Duration(seconds: 60),
        )
        as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> stopEnvoyLocal() async {
    return await homeClient.call(
          'stopEnvoyLocal',
          const {},
          const Duration(seconds: 30),
        )
        as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> restartEnvoyLocal() async {
    return await homeClient.call(
          'restartEnvoyLocal',
          const {},
          const Duration(seconds: 90),
        )
        as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> cancelEnvoyLocalDownload() async {
    return await homeClient.call('cancelEnvoyLocalDownload')
        as Map<String, dynamic>;
  }

  Future<List<Map<String, dynamic>>> listEnvoyLocalInstalledModels() async {
    final result = await homeClient.call('listEnvoyLocalInstalledModels');
    final list = result as List<dynamic>? ?? const [];
    return list
        .whereType<Map>()
        .map((e) => Map<String, dynamic>.from(e))
        .toList();
  }

  Future<Map<String, dynamic>> searchEnvoyLocalModels({String? query}) async {
    return await homeClient.call('searchEnvoyLocalModels', {
          if (query != null && query.trim().isNotEmpty) 'query': query.trim(),
        }, const Duration(seconds: 45))
        as Map<String, dynamic>;
  }

  Future<List<Map<String, dynamic>>> downloadEnvoyLocalModel(
    String modelId,
  ) async {
    final result = await homeClient.call('downloadEnvoyLocalModel', {
      'modelId': modelId,
    }, const Duration(seconds: 60));
    final list = result as List<dynamic>? ?? const [];
    return list
        .whereType<Map>()
        .map((e) => Map<String, dynamic>.from(e))
        .toList();
  }

  Future<Map<String, dynamic>> setEnvoyLocalDownloadRegion(
    String region,
  ) async {
    return await homeClient.call('setEnvoyLocalDownloadRegion', {'region': region})
        as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> setEnvoyLocalActiveModel(String modelId) async {
    return await homeClient.call(
          'setEnvoyLocalActiveModel',
          {'modelId': modelId},
          // Match Social (120s); large GGUFs can take a while to become ready.
          const Duration(seconds: 120),
        )
        as Map<String, dynamic>;
  }

  // -- Envoy Local embed (home-node embedding sidecar; downloads on home) --

  Future<Map<String, dynamic>> getEnvoyLocalEmbedStatus() async {
    return await homeClient.call('getEnvoyLocalEmbedStatus')
        as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> enableEnvoyLocalEmbed({
    bool skipModelDownload = false,
    String? modelId,
  }) async {
    return await homeClient.call('enableEnvoyLocalEmbed', {
          'skipModelDownload': skipModelDownload,
          if (modelId != null && modelId.trim().isNotEmpty)
            'modelId': modelId.trim(),
        }, const Duration(seconds: 60))
        as Map<String, dynamic>;
  }

  // -- Pi (built-in coding agent) --

  Future<Map<String, dynamic>> getPiStatus() async {
    return await homeClient.call('getPiStatus') as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> restartPi() async {
    return await homeClient.call('restartPi') as Map<String, dynamic>;
  }

  /// One-shot Pi prompt. May take up to ~2 minutes for long tool turns.
  ///
  /// When [sessionId] is set, the home node streams the turn onto
  /// `eh:timeline` under `__pi__:$sessionId` (Coding Chat).
  Future<String> sendToPi(String text, {String? sessionId}) async {
    final result = await homeClient.call('sendToPi', {
      'text': text,
      if (sessionId != null && sessionId.trim().isNotEmpty)
        'sessionId': sessionId.trim(),
    }, const Duration(seconds: 120));
    if (result is String) return result;
    if (result is Map && result['text'] is String) {
      return result['text'] as String;
    }
    return result?.toString() ?? '';
  }

  /// Allow/deny an in-flight Pi tool-action request (`pi:proposal`).
  Future<Map<String, dynamic>> piRespondToProposal({
    required String uiRequestId,
    required bool confirmed,
  }) async {
    return await homeClient.call('piRespondToProposal', {
          'uiRequestId': uiRequestId,
          'confirmed': confirmed,
        })
        as Map<String, dynamic>;
  }

  /// Persist Pi enable flag and/or full `piSettings` on the home node.
  ///
  /// [piSettings] replaces the persisted object (same as Social UI) — callers
  /// must merge with the current `piSettings` before sending.
  Future<bool> updatePiConfig({
    bool? piEnabled,
    Map<String, dynamic>? piSettings,
  }) async {
    final patch = <String, dynamic>{};
    if (piEnabled != null) patch['piEnabled'] = piEnabled;
    if (piSettings != null) patch['piSettings'] = piSettings;
    if (patch.isEmpty) return true;
    await homeClient.call('updateNodeConfig', patch);
    return true;
  }

  /// Start (or reuse) a Pi interactive TUI terminal for [projectPath] on the
  /// home node. Same RPC as Social “π Pi” / “Start Pi coding terminal”.
  Future<Map<String, dynamic>> ensurePiTerminalSession({
    required String projectPath,
    String? sessionId,
    bool forceRestart = false,
  }) async {
    return await homeClient.call('ensurePiTerminalSession', {
          'projectPath': projectPath,
          if (sessionId != null) 'sessionId': sessionId,
          'forceRestart': forceRestart,
        })
        as Map<String, dynamic>;
  }

  // -- Envoy Harness (coding chat) --
}
