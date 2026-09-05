// Phase 43H — read-only active chain status mirror for EnvoyGo.
//
// Mirrors `chainListActive` / `chainGetState` from the home node JSON-RPC
// surface. Mobile shows in-progress chains; authoring stays on the home UI.

import '../l10n/app_localizations.dart';

class ChainLiveStep {
  final String subtaskId;
  final String objective;
  final String state;
  final List<String> dependsOn;
  final String? workerPeerId;
  final String? requiredRole;
  final List<ChainStepHandoff> waitingOn;
  final List<ChainStepHandoff> produced;
  final int attemptCount;
  final String? selectedAttemptId;

  const ChainLiveStep({
    required this.subtaskId,
    required this.objective,
    required this.state,
    this.dependsOn = const [],
    this.workerPeerId,
    this.requiredRole,
    this.waitingOn = const [],
    this.produced = const [],
    this.attemptCount = 0,
    this.selectedAttemptId,
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
      attemptCount: (json['attemptCount'] as num?)?.toInt() ?? 0,
      selectedAttemptId: json['selectedAttemptId'] as String?,
    );
  }
}

/// Phase 60A — compact per-step provenance from `chainGetState`.
class ChainProvenanceSummary {
  final String subtaskId;
  final String? selectedAttemptId;
  final String? workerPeerId;
  final int attemptCount;
  final String? state;
  final String? lastReason;

  const ChainProvenanceSummary({
    required this.subtaskId,
    this.selectedAttemptId,
    this.workerPeerId,
    this.attemptCount = 0,
    this.state,
    this.lastReason,
  });

  factory ChainProvenanceSummary.fromJson(Map<String, dynamic> json) {
    return ChainProvenanceSummary(
      subtaskId: json['subtaskId'] as String? ?? '',
      selectedAttemptId: json['selectedAttemptId'] as String?,
      workerPeerId: json['workerPeerId'] as String?,
      attemptCount: (json['attemptCount'] as num?)?.toInt() ?? 0,
      state: json['state'] as String?,
      lastReason: json['lastReason'] as String?,
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

/// Phase 59 — per worker × file delivery progress for Team job inputs.
class ChainInputDelivery {
  final String chainId;
  final String workerPeerId;
  final String sourceRelativePath;
  final String phase;
  final String? deliveredRelativePath;
  final String? contentHash;
  final String? error;
  final String? label;
  final String? updatedAt;

  const ChainInputDelivery({
    required this.chainId,
    required this.workerPeerId,
    required this.sourceRelativePath,
    required this.phase,
    this.deliveredRelativePath,
    this.contentHash,
    this.error,
    this.label,
    this.updatedAt,
  });

  factory ChainInputDelivery.fromJson(Map<String, dynamic> json) {
    return ChainInputDelivery(
      chainId: json['chainId'] as String? ?? '',
      workerPeerId: json['workerPeerId'] as String? ?? '',
      sourceRelativePath: (json['sourceRelativePath'] as String? ?? '')
          .replaceFirst(RegExp(r'^[\\/]+'), ''),
      phase: json['phase'] as String? ?? 'pending',
      deliveredRelativePath: json['deliveredRelativePath'] as String?,
      contentHash: json['contentHash'] as String?,
      error: json['error'] as String?,
      label: json['label'] as String?,
      updatedAt: json['updatedAt'] as String?,
    );
  }

  String get shortWorker {
    final id = workerPeerId;
    return id.length > 14 ? '${id.substring(0, 12)}…' : id;
  }

  String get displayName {
    if (label != null && label!.trim().isNotEmpty) return label!.trim();
    final parts = sourceRelativePath.split('/');
    return parts.isNotEmpty ? parts.last : sourceRelativePath;
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
  /// Phase 60C — resolved team strategy id from `chainGetState.teamStrategy.id`.
  final String? teamStrategyId;
  /// Phase 60D — `chainGetState.recovery.phase` when present (`recovering`, …).
  final String? recoveryPhase;
  /// Phase 58B — live step story (objectives / waitingOn).
  final List<ChainLiveStep> steps;
  /// Phase 60A — compact provenance summaries (lazy details via RPC).
  final List<ChainProvenanceSummary> provenanceSummary;
  /// Phase 58D — iteration progress / owner hold.
  final ChainIterationState? iteration;
  /// Phase 59D — job input delivery chips.
  final List<ChainInputDelivery> inputDeliveries;
  /// Phase 63 — speculation disagreements awaiting owner resolution
  /// (only present when `chainMandate.speculationOnDisagreement === "block"`).
  /// The mobile UI shows a single "Resolve automatically" button per review.
  final List<ChainSpeculationReview> speculationReview;
  /// Phase 64B — creator-side stranded remote Assigner affordances.
  final bool assignerStranded;
  final bool assignerStrandedCanReclaim;
  final bool assignerStrandedCanCancel;
  final bool remoteOwnershipIsCreator;
  /// Phase 67C — Assigner peer when handed off (for multi-home labeling).
  final String? assignerPeerId;

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
    this.teamStrategyId,
    this.recoveryPhase,
    this.steps = const [],
    this.provenanceSummary = const [],
    this.iteration,
    this.inputDeliveries = const [],
    this.speculationReview = const [],
    this.assignerStranded = false,
    this.assignerStrandedCanReclaim = false,
    this.assignerStrandedCanCancel = false,
    this.remoteOwnershipIsCreator = false,
    this.assignerPeerId,
  });

  factory ChainActiveSummary.fromJson(Map<String, dynamic> json) {
    final stepsRaw = json['steps'] as List<dynamic>? ?? const [];
    final provenanceRaw = json['provenanceSummary'] as List<dynamic>? ?? const [];
    final iterationRaw = json['iteration'];
    final deliveriesRaw = json['inputDeliveries'] as List<dynamic>? ?? const [];
    final attachmentsRaw = json['inputAttachments'] as List<dynamic>? ?? const [];
    final teamStrategyRaw = json['teamStrategy'];
    String? teamStrategyId;
    if (teamStrategyRaw is Map) {
      final id = teamStrategyRaw['id'] as String?;
      if (id != null && id.isNotEmpty) teamStrategyId = id;
    }
    final recoveryRaw = json['recovery'];
    String? recoveryPhase;
    if (recoveryRaw is Map) {
      final phase = recoveryRaw['phase'] as String?;
      if (phase != null && phase.isNotEmpty) recoveryPhase = phase;
    }
    final labelBySource = <String, String>{};
    for (final raw in attachmentsRaw.whereType<Map>()) {
      final m = Map<String, dynamic>.from(raw);
      final source = (m['sourceRelativePath'] as String? ?? '')
          .replaceFirst(RegExp(r'^[\\/]+'), '');
      final label = (m['label'] as String?)?.trim();
      final fileName = m['fileName'] as String?;
      if (source.isNotEmpty) {
        labelBySource[source] = (label != null && label.isNotEmpty)
            ? label
            : (fileName ?? source.split('/').last);
      }
    }
    final strandedRaw = json['assignerStranded'];
    final ownershipRaw = json['remoteOwnership'];
    final stranded = strandedRaw is Map;
    final canReclaim = stranded && strandedRaw['canReclaim'] == true;
    final canCancel = stranded && strandedRaw['canCancel'] == true;
    final isCreator = ownershipRaw is Map && ownershipRaw['localRole'] == 'creator';
    final assignerPeerId = ownershipRaw is Map
        ? (ownershipRaw['assignerPeerId'] as String?)
        : null;
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
      teamStrategyId: teamStrategyId,
      recoveryPhase: recoveryPhase,
      steps: stepsRaw
          .whereType<Map>()
          .map((e) => ChainLiveStep.fromJson(Map<String, dynamic>.from(e)))
          .toList(),
      provenanceSummary: provenanceRaw
          .whereType<Map>()
          .map((e) =>
              ChainProvenanceSummary.fromJson(Map<String, dynamic>.from(e)))
          .toList(),
      iteration: iterationRaw is Map
          ? ChainIterationState.fromJson(Map<String, dynamic>.from(iterationRaw))
          : null,
      inputDeliveries: deliveriesRaw.whereType<Map>().map((e) {
        final base = ChainInputDelivery.fromJson(Map<String, dynamic>.from(e));
        final label = labelBySource[base.sourceRelativePath];
        if (label == null) return base;
        return ChainInputDelivery(
          chainId: base.chainId,
          workerPeerId: base.workerPeerId,
          sourceRelativePath: base.sourceRelativePath,
          phase: base.phase,
          deliveredRelativePath: base.deliveredRelativePath,
          contentHash: base.contentHash,
          error: base.error,
          label: label,
          updatedAt: base.updatedAt,
        );
      }).toList(),
      speculationReview: (json['speculationReview'] as List<dynamic>? ?? const [])
          .whereType<Map>()
          .map((e) =>
              ChainSpeculationReview.fromJson(Map<String, dynamic>.from(e)))
          .toList(),
      assignerStranded: stranded,
      assignerStrandedCanReclaim: canReclaim,
      assignerStrandedCanCancel: canCancel,
      remoteOwnershipIsCreator: isCreator,
      assignerPeerId: assignerPeerId?.trim().isNotEmpty == true
          ? assignerPeerId!.trim()
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
        if (teamStrategyId != null) 'teamStrategy': {'id': teamStrategyId},
        if (recoveryPhase != null) 'recovery': {'phase': recoveryPhase},
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

  String statusLabel(AppLocalizations l10n) {
    if (chainCancelled) return l10n.chainsStatusCancelled;
    if (published) return l10n.chainsStatusPublished;
    if (recoveryPhase == 'recovering') return l10n.chainsStatusRecovering;
    if (awardedCount > 0 && partialCount >= subtaskCount && subtaskCount > 0) {
      return l10n.chainsStatusSynthesizing;
    }
    if (awardedCount > 0 && partialCount < subtaskCount) {
      return l10n.chainsStatusRunning;
    }
    if (awardedCount == 0 && bidCount == 0 && subtaskCount > 0) {
      return l10n.chainsStatusWaitingWorkers;
    }
    // Worker ACK uses task.chain.bid on the wire even in direct mode — do not
    // surface that as "Bidding" unless competitive award mode is on.
    if (awardMode == 'competitive' &&
        (bidCount > 0 || awardedCount < subtaskCount)) {
      return l10n.chainsStatusBidding;
    }
    if (awardedCount < subtaskCount) return l10n.chainsStatusAssigning;
    return l10n.chainsStatusPlanning;
  }
}

/// Phase 63 — one pending speculation disagreement per subtask. Mirrors the
/// `speculationReview` field returned by `chainGetState`. Only present when
/// the chain mandate opted in to `speculationOnDisagreement === "block"`.
class ChainSpeculationReview {
  final String subtaskId;
  final String reason; // "disagree_needs_verify" | "none_pass"
  final List<ChainSpeculationAttempt> attempts;

  const ChainSpeculationReview({
    required this.subtaskId,
    required this.reason,
    required this.attempts,
  });

  factory ChainSpeculationReview.fromJson(Map<String, dynamic> json) {
    final raw = json['attempts'] as List<dynamic>? ?? const [];
    return ChainSpeculationReview(
      subtaskId: json['subtaskId'] as String? ?? '',
      reason: json['reason'] as String? ?? 'disagree_needs_verify',
      attempts: raw
          .whereType<Map>()
          .map((e) =>
              ChainSpeculationAttempt.fromJson(Map<String, dynamic>.from(e)))
          .toList(),
    );
  }
}

class ChainSpeculationAttempt {
  final String attemptId;
  final String workerPeerId;
  final String? role; // "primary" | "speculative" | "replacement"

  const ChainSpeculationAttempt({
    required this.attemptId,
    required this.workerPeerId,
    this.role,
  });

  factory ChainSpeculationAttempt.fromJson(Map<String, dynamic> json) {
    return ChainSpeculationAttempt(
      attemptId: json['attemptId'] as String? ?? '',
      workerPeerId: json['workerPeerId'] as String? ?? '',
      role: json['role'] as String?,
    );
  }
}
