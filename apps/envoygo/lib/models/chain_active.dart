// Phase 43H — read-only active chain status mirror for EnvoyGo.
//
// Mirrors `chainListActive` / `chainGetState` from the home node JSON-RPC
// surface. Mobile shows in-progress chains; authoring stays on the home UI.

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
  });

  factory ChainActiveSummary.fromJson(Map<String, dynamic> json) {
    return ChainActiveSummary(
      chainId: json['chainId'] as String,
      chainMandateId: json['chainMandateId'] as String,
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
