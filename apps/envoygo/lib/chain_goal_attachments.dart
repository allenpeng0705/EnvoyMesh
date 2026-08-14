// Team-job goal attachment helpers (mirrors Social chain-goal-attachments.ts).

/// One vault-relative file listed under the goal's Attachments: block.
class ChainGoalAttachment {
  final String relativePath;
  final String? fileName;
  /// Short alias for the file in the job goal (e.g. "brief", "sales data").
  final String? label;

  const ChainGoalAttachment({
    required this.relativePath,
    this.fileName,
    this.label,
  });
}

const chainComposerMaxAttachments = 8;

/// Per-file upload cap for team-job composer (25 MiB).
const chainComposerMaxFileBytes = 25 * 1024 * 1024;

/// Soft cap so labels stay scannable in the goal text.
const chainAttachmentLabelMaxChars = 40;

String? sanitizeAttachmentLabel(String? raw) {
  if (raw == null) return null;
  final cleaned = raw
      .replaceAll(RegExp(r'[\r\n\[\]]+'), ' ')
      .replaceAll(RegExp(r'\s+'), ' ')
      .trim();
  if (cleaned.isEmpty) return null;
  if (cleaned.length <= chainAttachmentLabelMaxChars) return cleaned;
  return cleaned.substring(0, chainAttachmentLabelMaxChars).trim();
}

/// Build the effective goal string with an Attachments: block for the planner.
String buildChainGoalWithAttachments(
  String goal,
  Iterable<ChainGoalAttachment> attachments,
) {
  final g = goal.trim();
  final ready = attachments
      .where((a) => a.relativePath.trim().isNotEmpty)
      .toList(growable: false);
  if (ready.isEmpty) return g;
  final lines = ready.map((a) {
    final path = a.relativePath.trim();
    final label = sanitizeAttachmentLabel(a.label);
    if (label != null) return '- [$label] $path';
    return '- $path';
  });
  return '$g\n\nAttachments:\n${lines.join('\n')}';
}

String sanitizeTeamJobFileName(String name) {
  final base = name
      .replaceFirst(RegExp(r'^[\\/]+'), '')
      .replaceAll(RegExp(r'[\\/]'), '_')
      .trim();
  return base.isNotEmpty ? base : 'file';
}
