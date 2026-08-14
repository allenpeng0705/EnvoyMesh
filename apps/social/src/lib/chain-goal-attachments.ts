/**
 * Build the effective team-job goal string with an Attachments: block for the planner.
 *
 * Optional per-file `label` is a short alias (shown first) so the goal can say
 * "use [brief]" instead of a long opaque filename.
 */

export type ChainGoalAttachment = {
  relativePath: string;
  fileName?: string;
  /** Short alias for the file in the job goal (e.g. "brief", "sales data"). */
  label?: string;
};

/** Soft cap so labels stay scannable in the goal text. */
export const CHAIN_ATTACHMENT_LABEL_MAX_CHARS = 40;

export function sanitizeAttachmentLabel(raw: string | undefined | null): string | undefined {
  const cleaned = (raw ?? "")
    .replace(/[\r\n[\]]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return undefined;
  return cleaned.length > CHAIN_ATTACHMENT_LABEL_MAX_CHARS
    ? cleaned.slice(0, CHAIN_ATTACHMENT_LABEL_MAX_CHARS).trim()
    : cleaned;
}

export function buildChainGoalWithAttachments(
  goal: string,
  attachments: readonly ChainGoalAttachment[],
): string {
  const g = goal.trim();
  const ready = attachments.filter((a) => a.relativePath.trim().length > 0);
  if (ready.length === 0) return g;
  const lines = ready.map((a) => {
    const path = a.relativePath.trim();
    const label = sanitizeAttachmentLabel(a.label);
    return label ? `- [${label}] ${path}` : `- ${path}`;
  });
  return `${g}\n\nAttachments:\n${lines.join("\n")}`;
}

export const CHAIN_COMPOSER_MAX_ATTACHMENTS = 8;
/** Per-file upload cap for team-job composer (25 MiB). */
export const CHAIN_COMPOSER_MAX_FILE_BYTES = 25 * 1024 * 1024;

export function sanitizeTeamJobFileName(name: string): string {
  const base = name.replace(/^[\\/]+/, "").replace(/[\\/]/g, "_").trim();
  return base.length > 0 ? base : "file";
}
