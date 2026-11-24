/**
 * FH-P2-B — Minimal EnvoyHome `harness-subagents` patterns for EH Coding.
 *
 * Reference: `EnvoyHome/packages/daemon/src/harness-subagents.ts`
 * (parse / allow-list only — no `harness-host` port).
 */

export const EH_TASK_DEFAULT_ALLOW = [
  "read_file",
  "list_dir",
  "search_files",
] as const;

const DENY_CHILD_TOOLS = new Set([
  "spawn_helper",
  "task",
  "exec",
  "ha_call_service",
  "mqtt_publish",
  "browser",
]);

export type EhTaskChildSpec = {
  objective: string;
  allowTools: string[];
};

export function filterEhChildAllowTools(raw: unknown): string[] {
  const list = Array.isArray(raw)
    ? (raw as unknown[]).filter((t): t is string => typeof t === "string")
    : [...EH_TASK_DEFAULT_ALLOW];
  return list
    .map((t) => t.trim())
    .filter(
      (t) =>
        t.length > 0 &&
        !DENY_CHILD_TOOLS.has(t) &&
        !t.startsWith("ha_") &&
        !t.startsWith("mqtt_") &&
        !t.startsWith("mcp__"),
    )
    .slice(0, 12);
}

/** Parse harness `task` args into child specs (batch or single). */
export function parseEhTaskChildren(
  args: Record<string, unknown>,
): EhTaskChildSpec[] {
  const defaultAllow = filterEhChildAllowTools(args.allowTools);

  if (Array.isArray(args.tasks) && args.tasks.length > 0) {
    const out: EhTaskChildSpec[] = [];
    for (const raw of args.tasks) {
      if (!raw || typeof raw !== "object") continue;
      const row = raw as Record<string, unknown>;
      const objective =
        (typeof row.objective === "string" && row.objective.trim()) ||
        (typeof row.prompt === "string" && row.prompt.trim()) ||
        "";
      if (objective.length === 0) continue;
      out.push({
        objective: objective.slice(0, 8000),
        allowTools:
          row.allowTools !== undefined
            ? filterEhChildAllowTools(row.allowTools)
            : defaultAllow,
      });
    }
    return out;
  }

  const single =
    (typeof args.objective === "string" && args.objective.trim()) ||
    (typeof args.prompt === "string" && args.prompt.trim()) ||
    "";
  if (single.length === 0) return [];
  return [{ objective: single.slice(0, 8000), allowTools: defaultAllow }];
}