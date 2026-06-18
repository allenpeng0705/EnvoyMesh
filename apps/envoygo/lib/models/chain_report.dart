// Phase 40 mobile mirror — ChainReport read-only types.
//
// Mirrors the wire surface of `chainListReports` / `chainGetReport` from
// `packages/api/src/ws-protocol.ts` and the `ChainReport` schema from
// `packages/protocol/src/agent-network.ts`. This is intentionally a small,
// focused surface: the mobile client shows what was published, with no
// editing affordance. Mutations (pin/unpin, launch, cancel, etc.) live on
// the home node's Social UI.
//
// Field naming uses camelCase for JSON keys (matches the wire format);
// the Dart accessors use camelCase too.
//
// Each model exposes both `fromJson` (parsing wire input) and `toJson`
// (round-tripping). The mobile client only uses `fromJson` today, but
// the round-trip pattern is consistent with the rest of the project
// (`chat_thread.dart`, `terminal_session.dart`) and catches drift
// between the field set the schema requires and the field set the
// client knows about.

/// Summary of one chain report as returned by `chainListReports`.
///
/// A list view only needs a small projection: id, when it ran, how many
/// subtasks/workers, synthesis cost, and a pinned marker. The full report
/// is fetched on demand via `getChainReport`.
class ChainReportSummary {
  /// Wire chain id (e.g. `chain_8d2f…`).
  final String chainId;

  /// Wire chain mandate id (e.g. `chainmandate_…`).
  final String chainMandateId;

  /// Owner of the orchestrator that published this report.
  final String orchestratorOwnerId;

  /// Peer id of the orchestrator (e.g. `12D3KooW…`).
  final String orchestratorPeerId;

  /// True when the owner pinned this report (exempt from 90-day GC).
  final bool pinned;

  /// ISO datetime the report was published.
  final DateTime createdAt;

  /// Cost summary (subset — full `chainSummary` lives on the detail).
  final ChainReportSummaryStats chainSummary;

  const ChainReportSummary({
    required this.chainId,
    required this.chainMandateId,
    required this.orchestratorOwnerId,
    required this.orchestratorPeerId,
    required this.pinned,
    required this.createdAt,
    required this.chainSummary,
  });

  factory ChainReportSummary.fromJson(Map<String, dynamic> json) {
    return ChainReportSummary(
      chainId: json['chainId'] as String,
      chainMandateId: json['chainMandateId'] as String,
      orchestratorOwnerId: json['orchestratorOwnerId'] as String,
      orchestratorPeerId: json['orchestratorPeerId'] as String,
      pinned: json['pinned'] == true,
      createdAt: DateTime.parse(json['createdAt'] as String),
      chainSummary: ChainReportSummaryStats.fromJson(
        json['chainSummary'] as Map<String, dynamic>,
      ),
    );
  }

  Map<String, dynamic> toJson() => {
        'chainId': chainId,
        'chainMandateId': chainMandateId,
        'orchestratorOwnerId': orchestratorOwnerId,
        'orchestratorPeerId': orchestratorPeerId,
        'pinned': pinned,
        'createdAt': createdAt.toIso8601String(),
        'chainSummary': chainSummary.toJson(),
      };
}

/// Subset of the report's `chainSummary` returned by `chainListReports`.
///
/// The list view only needs subtask/worker counts + synthesis cost. The
/// full summary (with `durationMs` + `workerAllocations[]`) is on the detail.
class ChainReportSummaryStats {
  final int subtaskCount;
  final int workerCount;
  final double synthesisCostUsd;

  const ChainReportSummaryStats({
    required this.subtaskCount,
    required this.workerCount,
    required this.synthesisCostUsd,
  });

  factory ChainReportSummaryStats.fromJson(Map<String, dynamic> json) {
    return ChainReportSummaryStats(
      subtaskCount: (json['subtaskCount'] as num).toInt(),
      workerCount: (json['workerCount'] as num).toInt(),
      synthesisCostUsd: (json['synthesisCostUsd'] as num).toDouble(),
    );
  }

  Map<String, dynamic> toJson() => {
        'subtaskCount': subtaskCount,
        'workerCount': workerCount,
        'synthesisCostUsd': synthesisCostUsd,
      };
}

/// Full chain report as returned by `chainGetReport`.
///
/// The [version] field is a wire-schema version tag. The current
/// `ChainReportSchema` requires `version: "0.1"`; we model it as a
/// nullable String so older clients can still parse reports that omit
/// the field. The mobile v1 surface doesn't gate any behavior on the
/// version, but the field is kept so a future v0.2 / v0.3 schema can
/// drive conditional rendering.
class ChainReport {
  /// Wire-schema version (e.g. `"0.1"`). Null when the server omits it.
  final String? version;

  final String chainId;
  final String chainMandateId;
  final String orchestratorOwnerId;
  final String orchestratorPeerId;
  final bool pinned;
  final DateTime createdAt;
  final ChainReportChainSummary chainSummary;
  final String executiveSummary;
  final List<ChainReportSection> sections;

  /// Roles the report is intended for. Defaults to `["human"]` on the
  /// server; modeled as a read-only list since mobile doesn't re-publish.
  final List<String> recipientRoles;

  const ChainReport({
    this.version,
    required this.chainId,
    required this.chainMandateId,
    required this.orchestratorOwnerId,
    required this.orchestratorPeerId,
    required this.pinned,
    required this.createdAt,
    required this.chainSummary,
    required this.executiveSummary,
    required this.sections,
    this.recipientRoles = const ['human'],
  });

  factory ChainReport.fromJson(Map<String, dynamic> json) {
    return ChainReport(
      version: json['version'] as String?,
      chainId: json['chainId'] as String,
      chainMandateId: json['chainMandateId'] as String,
      orchestratorOwnerId: json['orchestratorOwnerId'] as String,
      orchestratorPeerId: json['orchestratorPeerId'] as String,
      pinned: json['pinned'] == true,
      createdAt: DateTime.parse(json['createdAt'] as String),
      chainSummary: ChainReportChainSummary.fromJson(
        json['chainSummary'] as Map<String, dynamic>,
      ),
      executiveSummary: (json['executiveSummary'] as String?) ?? '',
      sections: ((json['sections'] as List<dynamic>?) ?? const [])
          .map((e) => ChainReportSection.fromJson(e as Map<String, dynamic>))
          .toList(),
      recipientRoles: ((json['recipientRoles'] as List<dynamic>?) ?? const ['human'])
          .map((e) => e as String)
          .toList(),
    );
  }

  Map<String, dynamic> toJson() => {
        if (version != null) 'version': version,
        'chainId': chainId,
        'chainMandateId': chainMandateId,
        'orchestratorOwnerId': orchestratorOwnerId,
        'orchestratorPeerId': orchestratorPeerId,
        'pinned': pinned,
        'createdAt': createdAt.toIso8601String(),
        'chainSummary': chainSummary.toJson(),
        'executiveSummary': executiveSummary,
        'sections': sections.map((s) => s.toJson()).toList(),
        'recipientRoles': recipientRoles,
      };
}

/// Full `chainSummary` block on a `ChainReport`.
///
/// Includes `durationMs` and `workerAllocations[]` (not present on the
/// list-summary projection). The mobile detail screen renders a small
/// "cost-by-worker" table from `workerAllocations`.
class ChainReportChainSummary {
  final int durationMs;
  final int subtaskCount;
  final int workerCount;
  final List<ChainReportWorkerAllocation> workerAllocations;
  final double synthesisCostUsd;

  const ChainReportChainSummary({
    required this.durationMs,
    required this.subtaskCount,
    required this.workerCount,
    required this.workerAllocations,
    required this.synthesisCostUsd,
  });

  factory ChainReportChainSummary.fromJson(Map<String, dynamic> json) {
    return ChainReportChainSummary(
      durationMs: (json['durationMs'] as num).toInt(),
      subtaskCount: (json['subtaskCount'] as num).toInt(),
      workerCount: (json['workerCount'] as num).toInt(),
      workerAllocations: ((json['workerAllocations'] as List<dynamic>?) ?? const [])
          .map((e) => ChainReportWorkerAllocation.fromJson(e as Map<String, dynamic>))
          .toList(),
      synthesisCostUsd: (json['synthesisCostUsd'] as num).toDouble(),
    );
  }

  Map<String, dynamic> toJson() => {
        'durationMs': durationMs,
        'subtaskCount': subtaskCount,
        'workerCount': workerCount,
        'workerAllocations':
            workerAllocations.map((a) => a.toJson()).toList(),
        'synthesisCostUsd': synthesisCostUsd,
      };
}

/// One worker's per-subtask cost line on a chain report.
class ChainReportWorkerAllocation {
  final String subtaskId;
  final String workerPeerId;
  final double committedUsd;

  const ChainReportWorkerAllocation({
    required this.subtaskId,
    required this.workerPeerId,
    required this.committedUsd,
  });

  factory ChainReportWorkerAllocation.fromJson(Map<String, dynamic> json) {
    return ChainReportWorkerAllocation(
      subtaskId: json['subtaskId'] as String,
      workerPeerId: json['workerPeerId'] as String,
      committedUsd: (json['committedUsd'] as num).toDouble(),
    );
  }

  Map<String, dynamic> toJson() => {
        'subtaskId': subtaskId,
        'workerPeerId': workerPeerId,
        'committedUsd': committedUsd,
      };
}

/// One section in the report's body.
class ChainReportSection {
  final String heading;
  final String bodyMarkdown;

  /// Citation tuples that the desktop renderer can link back to the
  /// chain tree. Mobile v1 doesn't render citations (no chain tree to
  /// highlight), but the field is modeled so a future "tap citation"
  /// feature has the data.
  final List<ChainReportCitation> citations;

  const ChainReportSection({
    required this.heading,
    required this.bodyMarkdown,
    this.citations = const [],
  });

  factory ChainReportSection.fromJson(Map<String, dynamic> json) {
    return ChainReportSection(
      heading: json['heading'] as String,
      bodyMarkdown: (json['bodyMarkdown'] as String?) ?? '',
      citations: ((json['citations'] as List<dynamic>?) ?? const [])
          .map((e) => ChainReportCitation.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }

  Map<String, dynamic> toJson() => {
        'heading': heading,
        'bodyMarkdown': bodyMarkdown,
        'citations': citations.map((c) => c.toJson()).toList(),
      };
}

/// A `[subtaskId, snippet]` citation tuple that the desktop renderer
/// can link back to the chain tree.
class ChainReportCitation {
  final String subtaskId;

  /// Snippet of the worker's output the citation refers to.
  final String snippet;

  const ChainReportCitation({
    required this.subtaskId,
    required this.snippet,
  });

  factory ChainReportCitation.fromJson(Map<String, dynamic> json) {
    return ChainReportCitation(
      subtaskId: json['subtaskId'] as String,
      snippet: (json['snippet'] as String?) ?? '',
    );
  }

  Map<String, dynamic> toJson() => {
        'subtaskId': subtaskId,
        'snippet': snippet,
      };
}
