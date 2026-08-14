// Phase 43H — read-only active chain status mirror for EnvoyGo.
//
// Mirrors `chainListActive` / `chainGetState` from the home node JSON-RPC
// surface. Mobile shows in-progress chains; authoring stays on the home UI.

class ChainLiveStep {
  final String subtaskId;
  final String objective;
  final String state;
  final List<String> dependsOn;
  final String? workerPeerId;
  final String? requiredRole;
  final List<ChainStepHandoff> waitingOn;
  final List<ChainStepHandoff> produced;

  const ChainLiveStep({
    required this.subtaskId,
    required this.objective,
    required this.state,
    this.dependsOn = const [],
    this.workerPeerId,
    this.requiredRole,
    this.waitingOn = const [],
    this.produced = const [],
  });

  factory ChainLiveStep.fromJson(Map<String, dynamic> json) {
    List<ChainStepHandoff> parseHandoffs(String key) {
      final raw = json[key] as List<dynamic>? ?? const [];
      return raw
          .whereType<Map>()
          .map((e) => ChainStepHandoff.fromJson(Map<String, dynamic>.from(e)))
          .toList();
    }

    return ChainLiveStep(
      subtaskId: json['subtaskId'] as String? ?? '',
      objective: json['objective'] as String? ?? '',
      state: json['state'] as String? ?? 'pending',
      dependsOn: (json['dependsOn'] as List<dynamic>? ?? const [])
          .map((e) => e.toString())
          .toList(),
      workerPeerId: json['workerPeerId'] as String?,
      requiredRole: json['requiredRole'] as String?,
      waitingOn: parseHandoffs('waitingOn'),
      produced: parseHandoffs('produced'),
    );
  }
}

class ChainStepHandoff {
  final String key;
  final String kind;
  final String? label;
  final String? fromSubtaskId;

  const ChainStepHandoff({
    required this.key,
    required this.kind,
    this.label,
    this.fromSubtaskId,
  });

  factory ChainStepHandoff.fromJson(Map<String, dynamic> json) {
    return ChainStepHandoff(
      key: json['key'] as String? ?? '',
      kind: json['kind'] as String? ?? 'text',
      label: json['label'] as String?,
      fromSubtaskId: json['fromSubtaskId'] as String?,
    );
  }
}

class ChainIterationState {
  final int round;
  final int maxRounds;
  final int extendsInRound;
  final bool waitingForOwner;
  final String? stopReason;
  final String? latestDraftSummary;

  const ChainIterationState({
    required this.round,
    required this.maxRounds,
    this.extendsInRound = 0,
    this.waitingForOwner = false,
    this.stopReason,
    this.latestDraftSummary,
  });

  factory ChainIterationState.fromJson(Map<String, dynamic> json) {
    final drafts = json['drafts'] as List<dynamic>? ?? const [];
    String? summary;
    if (drafts.isNotEmpty) {
      final last = drafts.last;
      if (last is Map) {
        summary = last['summary'] as String?;
      }
    }
    return ChainIterationState(
      round: (json['round'] as num?)?.toInt() ?? 1,
      maxRounds: (json['maxRounds'] as num?)?.toInt() ?? 1,
      extendsInRound: (json['extendsInRound'] as num?)?.toInt() ?? 0,
      waitingForOwner: json['waitingForOwner'] == true,
      stopReason: json['stopReason'] as String?,
      latestDraftSummary: summary,
    );
  }
}

/// Phase 58D — read-only observed job (worker view).
class ChainObservedSummary {
  final String chainId;
  final String? goal;
  final String phase;
  final String awardMode;
  final int subtaskCount;
  final int awardedCount;
  final int partialCount;
  final List<ChainLiveStep> steps;
  final String orchestratorPeerId;

  const ChainObservedSummary({
    required this.chainId,
    this.goal,
    required this.phase,
    this.awardMode = 'direct',
    required this.subtaskCount,
    required this.awardedCount,
    required this.partialCount,
    this.steps = const [],
    this.orchestratorPeerId = '',
  });

  factory ChainObservedSummary.fromJson(Map<String, dynamic> json) {
    final stepsRaw = json['steps'] as List<dynamic>? ?? const [];
    return ChainObservedSummary(
      chainId: json['chainId'] as String? ?? '',
      goal: json['goal'] as String?,
      phase: json['phase'] as String? ?? 'running',
      awardMode: json['awardMode'] as String? ?? 'direct',
      subtaskCount: (json['subtaskCount'] as num?)?.toInt() ?? 0,
      awardedCount: (json['awardedCount'] as num?)?.toInt() ?? 0,
      partialCount: (json['partialCount'] as num?)?.toInt() ?? 0,
      orchestratorPeerId: json['orchestratorPeerId'] as String? ?? '',
      steps: stepsRaw
          .whereType<Map>()
          .map((e) => ChainLiveStep.fromJson(Map<String, dynamic>.from(e)))
          .toList(),
    );
  }
}

class ChainActiveSummary {
  final String chainId;
  final String chainMandateId;
  final int subtaskCount;
  final int bidCount;
  final int awardedCount;
  final int partialCount;
  final bool chainCancelled;
  final bool published;
  final double budgetSpentUsd;
  final double budgetMaxUsd;
  final String? goal;
  final String? budgetWarningLevel;
  /// `direct` (default) or `competitive`. Direct must not show "Bidding".
  final String awardMode;
  /// `manual` | `auto` | `never` — from live state when known.
  final String? rebalancePolicy;
  /// Phase 58B — live step story (objectives / waitingOn).
  final List<ChainLiveStep> steps;
  /// Phase 58D — iteration progress / owner hold.
  final ChainIterationState? iteration;

  const ChainActiveSummary({
    required this.chainId,
    required this.chainMandateId,
    required this.subtaskCount,
    required this.bidCount,
    required this.awardedCount,
    required this.partialCount,
    required this.chainCancelled,
    required this.published,
    required this.budgetSpentUsd,
    required this.budgetMaxUsd,
    this.goal,
    this.budgetWarningLevel,
    this.awardMode = 'direct',
    this.rebalancePolicy,
    this.steps = const [],
    this.iteration,
  });

  factory ChainActiveSummary.fromJson(Map<String, dynamic> json) {
    final stepsRaw = json['steps'] as List<dynamic>? ?? const [];
    final iterationRaw = json['iteration'];
    return ChainActiveSummary(
      chainId: json['chainId'] as String,
      chainMandateId: json['chainMandateId'] as String? ?? '',
      subtaskCount: (json['subtaskCount'] as num?)?.toInt() ?? 0,
      bidCount: (json['bidCount'] as num?)?.toInt() ?? 0,
      awardedCount: (json['awardedCount'] as num?)?.toInt() ?? 0,
      partialCount: (json['partialCount'] as num?)?.toInt() ?? 0,
      chainCancelled: json['chainCancelled'] == true,
      published: json['published'] == true,
      budgetSpentUsd: (json['budgetSpentUsd'] as num?)?.toDouble() ?? 0,
      budgetMaxUsd: (json['budgetMaxUsd'] as num?)?.toDouble() ?? 0,
      goal: json['goal'] as String?,
      budgetWarningLevel: json['budgetWarningLevel'] as String?,
      awardMode: (json['awardMode'] as String?) ?? 'direct',
      rebalancePolicy: json['rebalancePolicy'] as String?,
      steps: stepsRaw
          .whereType<Map>()
          .map((e) => ChainLiveStep.fromJson(Map<String, dynamic>.from(e)))
          .toList(),
      iteration: iterationRaw is Map
          ? ChainIterationState.fromJson(Map<String, dynamic>.from(iterationRaw))
          : null,
    );
  }

  Map<String, dynamic> toJson() => {
        'chainId': chainId,
        'chainMandateId': chainMandateId,
        'subtaskCount': subtaskCount,
        'bidCount': bidCount,
        'awardedCount': awardedCount,
        'partialCount': partialCount,
        'chainCancelled': chainCancelled,
        'published': published,
        'budgetSpentUsd': budgetSpentUsd,
        'budgetMaxUsd': budgetMaxUsd,
        if (goal != null) 'goal': goal,
        if (budgetWarningLevel != null) 'budgetWarningLevel': budgetWarningLevel,
        'awardMode': awardMode,
        if (rebalancePolicy != null) 'rebalancePolicy': rebalancePolicy,
        if (steps.isNotEmpty)
          'steps': steps
              .map((s) => {
                    'subtaskId': s.subtaskId,
                    'objective': s.objective,
                    'state': s.state,
                    if (s.dependsOn.isNotEmpty) 'dependsOn': s.dependsOn,
                    if (s.workerPeerId != null) 'workerPeerId': s.workerPeerId,
                    if (s.requiredRole != null) 'requiredRole': s.requiredRole,
                  })
              .toList(),
      };

  String get statusLabel {
    if (chainCancelled) return 'Cancelled';
    if (published) return 'Published';
    if (awardedCount > 0 && partialCount >= subtaskCount && subtaskCount > 0) {
      return 'Synthesizing';
    }
    if (awardedCount > 0 && partialCount < subtaskCount) return 'Running';
    if (awardedCount == 0 && bidCount == 0 && subtaskCount > 0) {
      return 'Waiting for workers';
    }
    // Worker ACK uses task.chain.bid on the wire even in direct mode — do not
    // surface that as "Bidding" unless competitive award mode is on.
    if (awardMode == 'competitive' && (bidCount > 0 || awardedCount < subtaskCount)) {
      return 'Bidding';
    }
    if (awardedCount < subtaskCount) return 'Assigning';
    return 'Planning';
  }
}
