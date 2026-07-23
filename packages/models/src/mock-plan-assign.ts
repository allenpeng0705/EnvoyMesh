/**
 * Deterministic mock response for Team jobs plan+assign.
 *
 * When AI settings use `mode: "mock"` with
 * `mockResponseText: "__plan_assign_from_roster__"`, the mock provider
 * parses eligibleWorkers from the Assigner prompt and returns a small
 * dependency-aware plan with named assignees — same AI mode across nodes,
 * different peer profiles still affect who gets which step.
 */

export const PLAN_ASSIGN_FROM_ROSTER_TOKEN = "__plan_assign_from_roster__";

interface RosterRow {
  peerId: string;
  strengths?: string[];
  capabilities?: string[];
  isSelf?: boolean;
  throughputTokensPerSec?: number | null;
  modelFreshness?: number | null;
}

function extractRosterJson(prompt: string): unknown {
  const marker = "eligibleWorkers:";
  const idx = prompt.indexOf(marker);
  if (idx < 0) return null;
  const after = prompt.slice(idx + marker.length).trimStart();
  if (!after.startsWith("[")) return null;
  let depth = 0;
  let end = -1;
  for (let i = 0; i < after.length; i++) {
    const ch = after[i];
    if (ch === "[") depth++;
    else if (ch === "]") {
      depth--;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  if (end < 0) return null;
  try {
    return JSON.parse(after.slice(0, end));
  } catch {
    return null;
  }
}

function scoreFor(row: RosterRow, tag: string): number {
  const strengths = row.strengths ?? [];
  const caps = row.capabilities ?? [];
  let score = 0;
  if (strengths.includes(tag) || caps.includes(tag)) score += 50;
  if (caps.includes("task.execute")) score += 5;
  if (row.isSelf) score += 2;
  score += Math.min(20, Math.floor((row.throughputTokensPerSec ?? 0) / 10));
  score += row.modelFreshness ?? 0;
  return score;
}

function pick(rows: RosterRow[], tag: string): string {
  if (rows.length === 0) return "envoy_agent_missing";
  const ranked = [...rows].sort((a, b) => scoreFor(b, tag) - scoreFor(a, tag));
  return ranked[0]!.peerId;
}

/**
 * Build plan+assign JSON from an Assigner prompt that embeds eligibleWorkers.
 * Returns null when the roster cannot be parsed.
 */
export function synthesizePlanAssignFromRosterPrompt(prompt: string): string | null {
  const raw = extractRosterJson(prompt);
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const rows: RosterRow[] = raw
    .map((r) => {
      if (!r || typeof r !== "object") return null;
      const o = r as Record<string, unknown>;
      if (typeof o.peerId !== "string" || !o.peerId) return null;
      return {
        peerId: o.peerId,
        strengths: Array.isArray(o.strengths) ? o.strengths.filter((x): x is string => typeof x === "string") : [],
        capabilities: Array.isArray(o.capabilities)
          ? o.capabilities.filter((x): x is string => typeof x === "string")
          : [],
        isSelf: o.isSelf === true,
        throughputTokensPerSec: typeof o.throughputTokensPerSec === "number" ? o.throughputTokensPerSec : null,
        modelFreshness: typeof o.modelFreshness === "number" ? o.modelFreshness : null,
      } satisfies RosterRow;
    })
    .filter((x): x is RosterRow => x !== null);
  if (rows.length === 0) return null;

  const researchPeer = pick(rows, "research.web");
  const codingPeer = pick(rows, "coding");
  const mergePeer = pick(rows, "task.execute");

  return JSON.stringify({
    steps: [
      {
        objective: "Gather source facts for the goal",
        requiredCapability: "research.web",
        depth: 1,
        dependsOn: [],
        assignedPeerId: researchPeer,
        reason: "auto: best research.web / generalist fit",
      },
      {
        objective: "Draft structured answer from research",
        requiredCapability: "coding",
        depth: 1,
        dependsOn: [],
        assignedPeerId: codingPeer,
        reason: "auto: best coding / generalist fit",
      },
      {
        objective: "Combine research + draft into one final deliverable",
        requiredCapability: "task.execute",
        depth: 1,
        dependsOn: [0, 1],
        assignedPeerId: mergePeer,
        reason: "auto: merge after parents",
      },
    ],
    aggregation: "concatenate",
    notes: "mock plan_assign_from_roster",
  });
}
