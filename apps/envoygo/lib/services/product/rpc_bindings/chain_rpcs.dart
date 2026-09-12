import '../../../models/chain_active.dart';
import '../../../models/chain_report.dart';
import '../../home_rpc_session.dart';

/// Chain bindings: chain reports, chains and agent-network diagnostics.
mixin ChainRpcs on HomeRpcSession {
  /// List published chain reports from the home node's chain-reports store.
  ///
  /// [limit] caps the response (default home-node cap is 50). [pinnedOnly]
  /// filters to reports the owner flagged as exempt from 90-day GC. The
  /// returned summaries carry just enough to render a list row; tap a row
  /// to fetch the full report via [getChainReport].
  Future<List<ChainReportSummary>> listChainReports({
    int? limit,
    bool? pinnedOnly,
  }) async {
    final result =
        await homeClient.call('chainListReports', {
              if (limit != null) 'limit': limit,
              if (pinnedOnly != null) 'pinnedOnly': pinnedOnly,
            })
            as Map<String, dynamic>;
    final list = (result['reports'] as List<dynamic>?) ?? const [];
    return list
        .map((e) => ChainReportSummary.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// Fetch a single chain report by id. Returns null when the home node
  /// has no record of [chainId] (e.g. the report was GC'd after 90 days
  /// and the owner hadn't pinned it).
  Future<ChainReport?> getChainReport(String chainId) async {
    final result =
        await homeClient.call('chainGetReport', {'chainId': chainId})
            as Map<String, dynamic>;
    final report = result['report'];
    if (report == null) return null;
    return ChainReport.fromJson(report as Map<String, dynamic>);
  }

  /// List in-progress chains from the home node runtime.
  Future<List<ChainActiveSummary>> listActiveChains() async {
    final result =
        await homeClient.call('chainListActive', {}) as Map<String, dynamic>;
    final list = (result['chains'] as List<dynamic>?) ?? const [];
    return list
        .map((e) => ChainActiveSummary.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// Fetch a single chain's live state snapshot.
  Future<ChainActiveSummary?> getChainState(String chainId) async {
    final result =
        await homeClient.call('chainGetState', {'chainId': chainId})
            as Map<String, dynamic>;
    if (result['chainId'] == null) return null;
    return ChainActiveSummary.fromJson(result);
  }

  /// Phase 64B — creator reclaim of a stranded remote-Assigner job.
  Future<Map<String, dynamic>> chainReclaimAssigner(String chainId) async {
    return await homeClient.call('chainReclaimAssigner', {'chainId': chainId})
        as Map<String, dynamic>;
  }

  /// Phase 64B — cancel a delegated remote-Assigner job from the creator.
  Future<Map<String, dynamic>> chainCancelDelegated(
    String chainId, {
    String? reason,
  }) async {
    return await homeClient.call('chainCancelDelegated', {
          'chainId': chainId,
          if (reason != null) 'reason': reason,
        }) as Map<String, dynamic>;
  }

  /// Phase 60A — lazily fetch execution provenance for one Team-job step.
  Future<Map<String, dynamic>> getChainStepProvenance(
    String chainId,
    String subtaskId,
  ) async {
    return await homeClient.call('chainGetStepProvenance', {
          'chainId': chainId,
          'subtaskId': subtaskId,
        }) as Map<String, dynamic>;
  }

  /// Phase 58D — jobs where this home is a worker (read-only).
  Future<List<ChainObservedSummary>> listObservedChains({
    bool includeTerminal = false,
  }) async {
    final result =
        await homeClient.call('chainListObserved', {
              'includeTerminal': includeTerminal,
            })
            as Map<String, dynamic>;
    final list = (result['chains'] as List<dynamic>?) ?? const [];
    return list
        .whereType<Map>()
        .map((e) => ChainObservedSummary.fromJson(Map<String, dynamic>.from(e)))
        .toList();
  }

  /// Phase 58D — owner decision after ask_owner iteration hold.
  Future<Map<String, dynamic>> chainResolveIteration({
    required String chainId,
    required String decision,
  }) async {
    return await homeClient.call('chainResolveIteration', {
          'chainId': chainId,
          'decision': decision,
        })
        as Map<String, dynamic>;
  }

  /// Node defaults for new team jobs (assignment mode, iteration, …).
  Future<Map<String, dynamic>> chainGetDefaults() async {
    final result =
        await homeClient.call('chainGetDefaults', {}) as Map<String, dynamic>;
    final defaults = result['defaults'];
    if (defaults is Map) {
      return Map<String, dynamic>.from(defaults);
    }
    return const {};
  }

  /// Persist node defaults for new team jobs (mirrors Social ChainDefaultsPanel).
  Future<Map<String, dynamic>> chainSetDefaults(
    Map<String, dynamic> defaults,
  ) async {
    return await homeClient.call('chainSetDefaults', {
          'defaults': defaults,
        })
        as Map<String, dynamic>;
  }

  /// Preview a plan for [goal] without launching (LLM may take a while).
  Future<Map<String, dynamic>> chainPreviewGoal({
    required String goal,
    String? templateId,
    String? assignmentMode,
    String? teamStrategyId,
    String? assignerSelection,
    bool allowLlm = true,
    List<String>? preferredWorkerPeerIds,
  }) async {
    return await homeClient.call('chainPreviewGoal', {
          'goal': goal,
          'allowLlm': allowLlm,
          if (templateId != null && templateId.isNotEmpty)
            'templateId': templateId,
          if (assignmentMode != null && assignmentMode.isNotEmpty)
            'assignmentMode': assignmentMode,
          if (teamStrategyId != null && teamStrategyId.isNotEmpty)
            'teamStrategyId': teamStrategyId,
          if (assignerSelection != null && assignerSelection.isNotEmpty)
            'assignerSelection': assignerSelection,
          if (preferredWorkerPeerIds != null &&
              preferredWorkerPeerIds.isNotEmpty)
            'preferredWorkerPeerIds': preferredWorkerPeerIds,
        }, const Duration(seconds: 120))
        as Map<String, dynamic>;
  }

  /// Launch a team job from [goal], optionally reusing a preview plan.
  Future<Map<String, dynamic>> chainStartFromGoal({
    required String goal,
    String? templateId,
    String? assignmentMode,
    String? teamStrategyId,
    String? assignerSelection,
    String? assignerPeerId,
    bool? speculationEnabled,
    String? speculationOnDisagreement,
    int? maxParallelAttemptsPerStep,
    bool allowLlm = true,
    List<Map<String, dynamic>>? plannedSubtasks,
    List<Map<String, dynamic>>? planWarnings,
    List<String>? preferredWorkerPeerIds,
    int? iterationMaxRounds,
    String? iterationJudgeMode,
    int? extendMaxStepsPerRound,
    String? inputDeliveryScope,
  }) async {
    return await homeClient.call('chainStartFromGoal', {
          'goal': goal,
          'allowLlm': allowLlm,
          if (templateId != null && templateId.isNotEmpty)
            'templateId': templateId,
          if (assignmentMode != null && assignmentMode.isNotEmpty)
            'assignmentMode': assignmentMode,
          if (teamStrategyId != null && teamStrategyId.isNotEmpty)
            'teamStrategyId': teamStrategyId,
          if (assignerSelection != null && assignerSelection.isNotEmpty)
            'assignerSelection': assignerSelection,
          if (assignerPeerId != null && assignerPeerId.isNotEmpty)
            'assignerPeerId': assignerPeerId,
          if (speculationEnabled == true) 'speculationEnabled': true,
          if (speculationOnDisagreement != null &&
              speculationOnDisagreement.isNotEmpty)
            'speculationOnDisagreement': speculationOnDisagreement,
          if (maxParallelAttemptsPerStep != null)
            'maxParallelAttemptsPerStep': maxParallelAttemptsPerStep,
          if (plannedSubtasks != null) 'plannedSubtasks': plannedSubtasks,
          if (planWarnings != null) 'planWarnings': planWarnings,
          if (preferredWorkerPeerIds != null &&
              preferredWorkerPeerIds.isNotEmpty)
            'preferredWorkerPeerIds': preferredWorkerPeerIds,
          if (iterationMaxRounds != null)
            'iterationMaxRounds': iterationMaxRounds,
          if (iterationJudgeMode != null)
            'iterationJudgeMode': iterationJudgeMode,
          if (extendMaxStepsPerRound != null)
            'extendMaxStepsPerRound': extendMaxStepsPerRound,
          if (inputDeliveryScope != null && inputDeliveryScope.isNotEmpty)
            'inputDeliveryScope': inputDeliveryScope,
        }, const Duration(seconds: 120))
        as Map<String, dynamic>;
  }

  /// Phase 67A — list saved local + built-in chain templates.
  Future<List<Map<String, dynamic>>> chainListRecipes() async {
    final result = await homeClient.call('chainListRecipes', {})
        as Map<String, dynamic>;
    final raw = result['recipes'];
    if (raw is! List) return const [];
    return raw
        .whereType<Map>()
        .map((e) => Map<String, dynamic>.from(e))
        .toList(growable: false);
  }

  /// Phase 60F — no-spend Agent Network diagnostics snapshot.
  Future<Map<String, dynamic>> agentNetworkDiagnosticsSnapshot() async {
    return await homeClient.call('agentNetworkDiagnosticsSnapshot', {})
        as Map<String, dynamic>;
  }

  /// Phase 60F — no-spend simulation (readiness / dry-plan / failover / …).
  Future<Map<String, dynamic>> agentNetworkSimulate({
    required String mode,
    String? goal,
    String? injectFault,
  }) async {
    return await homeClient.call('agentNetworkSimulate', {
          'mode': mode,
          if (goal != null && goal.isNotEmpty) 'goal': goal,
          if (injectFault != null && injectFault.isNotEmpty)
            'injectFault': injectFault,
        })
        as Map<String, dynamic>;
  }

  /// Phase 60F — redacted diagnostics JSON export.
  Future<String> agentNetworkExportDiagnostics({String? simulationId}) async {
    final result = await homeClient.call('agentNetworkExportDiagnostics', {
          if (simulationId != null && simulationId.isNotEmpty)
            'simulationId': simulationId,
        })
        as Map<String, dynamic>;
    return result['json']?.toString() ?? '';
  }

  /// Cancel an active team job (or one subtask when [subtaskId] is set).
  ///
  /// Pass a localized [reason] from the UI so home audits match the app locale.
  Future<Map<String, dynamic>> chainCancel({
    required String chainId,
    required String reason,
    String cancelledBy = 'owner',
    String? subtaskId,
  }) async {
    return await homeClient.call('chainCancel', {
          'chainId': chainId,
          'reason': reason,
          'cancelledBy': cancelledBy,
          if (subtaskId != null && subtaskId.isNotEmpty) 'subtaskId': subtaskId,
        }, const Duration(seconds: 60))
        as Map<String, dynamic>;
  }

  /// Phase 58C — reassign a stalled/failed step to the next worker.
  Future<Map<String, dynamic>> chainReassignSubtask({
    required String chainId,
    required String subtaskId,
  }) async {
    return await homeClient.call('chainReassignSubtask', {
          'chainId': chainId,
          'subtaskId': subtaskId,
        }, const Duration(seconds: 60))
        as Map<String, dynamic>;
  }

  /// Phase 63 — owner resolves a speculation disagreement.
  /// [action] is `pick` (requires [attemptId]), `reassign`, or `auto`
  /// (defer to the orchestrator's deterministic auto-resolver — the
  /// default when `chainMandate.speculationOnDisagreement === "auto"`).
  Future<Map<String, dynamic>> chainResolveSpeculation({
    required String chainId,
    required String subtaskId,
    required String action,
    String? attemptId,
  }) async {
    return await homeClient.call('chainResolveSpeculation', {
          'chainId': chainId,
          'subtaskId': subtaskId,
          'action': action,
          if (attemptId != null && attemptId.isNotEmpty) 'attemptId': attemptId,
        }, const Duration(seconds: 60))
        as Map<String, dynamic>;
  }

  /// Phase 59D — retry failed/stuck job input deliveries.
  Future<Map<String, dynamic>> chainRetryInputDelivery({
    required String chainId,
    String? workerPeerId,
    String? sourceRelativePath,
  }) async {
    return await homeClient.call('chainRetryInputDelivery', {
          'chainId': chainId,
          if (workerPeerId != null && workerPeerId.isNotEmpty)
            'workerPeerId': workerPeerId,
          if (sourceRelativePath != null && sourceRelativePath.isNotEmpty)
            'sourceRelativePath': sourceRelativePath,
        }, const Duration(seconds: 120))
        as Map<String, dynamic>;
  }

  /// Pin/unpin a finished report (exempt from 90-day GC when pinned).
  Future<Map<String, dynamic>> chainPinReport({
    required String chainId,
    required bool pinned,
  }) async {
    return await homeClient.call('chainPinReport', {
          'chainId': chainId,
          'pinned': pinned,
        })
        as Map<String, dynamic>;
  }

  /// Raise budget and re-evaluate un-awarded subtasks.
  Future<Map<String, dynamic>> chainRebalance({
    required String chainId,
    required double additionalBudgetUsd,
  }) async {
    return await homeClient.call('chainRebalance', {
          'chainId': chainId,
          'additionalBudgetUsd': additionalBudgetUsd,
        }, const Duration(seconds: 60))
        as Map<String, dynamic>;
  }
}
