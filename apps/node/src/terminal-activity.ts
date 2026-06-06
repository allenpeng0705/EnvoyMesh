import type { TerminalActivityBadge, TerminalSessionSummary } from "@envoymesh/api";

export interface TerminalActivityContext {
  pendingApprovalCount: number;
  openClawTurnInProgress: boolean;
  nowMs?: number;
}

const WORKING_PROCESS_HINTS = [
  /\bopenclaw\b/i,
  /\bclawhub\b/i,
  /\bnpm\s+(run|install|test|build)\b/i,
  /\bpnpm\b/i,
  /\byarn\b/i,
  /\bcargo\s+(build|run|test)\b/i,
  /\bdocker\s+(compose|build|run)\b/i,
  /\bgit\s+(push|pull|fetch|rebase|merge)\b/i,
  /\bssh\b/i,
  /\bnode\b/i,
  /\bpython3?\b/i,
];

export function deriveTerminalActivityBadge(
  summary: TerminalSessionSummary,
  scrollbackTail: string,
  context: TerminalActivityContext,
): TerminalActivityBadge {
  if (summary.state === "exited") return "done";

  const now = context.nowMs ?? Date.now();
  const lastActivityMs = new Date(summary.lastActivityAt).getTime();
  if (!Number.isFinite(lastActivityMs)) {
    return "idle";
  }
  const idleMs = now - lastActivityMs;

  if (context.pendingApprovalCount > 0 && idleMs < 120_000) {
    return "blocked";
  }
  if (context.openClawTurnInProgress) {
    return "working";
  }

  const tail = scrollbackTail.slice(-4000);
  if (idleMs < 3_000) {
    return "working";
  }
  if (idleMs < 15_000 && WORKING_PROCESS_HINTS.some((re) => re.test(tail))) {
    return "working";
  }

  return "idle";
}

export function deriveTerminalForegroundHint(scrollbackTail: string): string | undefined {
  const lines = scrollbackTail.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i]!;
    if (line.length > 120) continue;
    const match = line.match(/\b(openclaw|clawhub|npm|pnpm|yarn|cargo|docker|git|ssh|node|python3?)\b/i);
    if (match) return match[1]!.toLowerCase();
  }
  return undefined;
}

export function enrichTerminalSessionSummaries(
  summaries: TerminalSessionSummary[],
  getScrollbackTail: (sessionId: string) => string,
  context: TerminalActivityContext,
): TerminalSessionSummary[] {
  return summaries.map((summary) => {
    const scrollbackTail = summary.state === "running" ? getScrollbackTail(summary.sessionId) : "";
    const activityBadge = deriveTerminalActivityBadge(summary, scrollbackTail, context);
    const foregroundHint =
      summary.state === "running" ? deriveTerminalForegroundHint(scrollbackTail) : undefined;
    return {
      ...summary,
      activityBadge,
      ...(foregroundHint ? { foregroundHint } : {}),
    };
  });
}
