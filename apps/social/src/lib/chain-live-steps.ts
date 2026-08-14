/**
 * Phase 58B — pure helpers for live job story UI (ordering + goal input parse).
 */

export type LiveStepLike = {
  subtaskId: string;
  objective: string;
  state: string;
  dependsOn?: string[];
  workerPeerId?: string;
  requiredRole?: string;
  waitingOn?: Array<{
    fromSubtaskId: string;
    key: string;
    kind: string;
    label?: string;
  }>;
  produced?: Array<{ key: string; kind: string; label?: string }>;
};

export type OrderedLiveStep<T extends LiveStepLike = LiveStepLike> = T & {
  depth: number;
  index: number;
};

/** Topological-ish order: parents before children; depth = max(dep)+1. */
export function orderLiveSteps<T extends LiveStepLike>(steps: T[]): OrderedLiveStep<T>[] {
  const byId = new Map(steps.map((s) => [s.subtaskId, s]));
  const depthMemo = new Map<string, number>();

  const depthOf = (id: string, stack: Set<string>): number => {
    const cached = depthMemo.get(id);
    if (cached !== undefined) return cached;
    if (stack.has(id)) return 0;
    stack.add(id);
    const step = byId.get(id);
    let d = 0;
    for (const dep of step?.dependsOn ?? []) {
      if (!byId.has(dep)) continue;
      d = Math.max(d, depthOf(dep, stack) + 1);
    }
    stack.delete(id);
    depthMemo.set(id, d);
    return d;
  };

  const ordered = steps.map((s) => ({
    ...s,
    depth: depthOf(s.subtaskId, new Set()),
    index: 0,
  }));
  ordered.sort((a, b) => a.depth - b.depth || a.subtaskId.localeCompare(b.subtaskId));
  return ordered.map((s, i) => ({ ...s, index: i + 1 }));
}

/** Parse `[label] path` tokens from a goal (EnvoyGo / composer convention). */
export function parseGoalInputRefs(
  goal: string | undefined | null,
): Array<{ label: string; path: string }> {
  if (!goal) return [];
  const out: Array<{ label: string; path: string }> = [];
  const seen = new Set<string>();
  const re = /\[([^\]]{1,64})\]\s+(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(goal)) !== null) {
    const label = m[1]!.trim();
    const path = m[2]!.trim();
    if (!label || !path) continue;
    const key = `${label}\0${path}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ label, path });
  }
  return out;
}
