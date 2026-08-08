/**
 * Deterministic mock response for Team jobs plan+assign.
 *
 * When AI settings use `mode: "mock"` with
 * `mockResponseText: "__plan_assign_from_roster__"`, the mock provider
 * parses eligibleWorkers from the Assigner prompt and returns a small
 * dependency-aware plan with named assignees — same AI mode across nodes,
 * different peer profiles still affect who gets which step.
 *
 * Role-based prompts (ASSIGNMENT MODE: role) produce requiredRole + warnings.
 */

export const PLAN_ASSIGN_FROM_ROSTER_TOKEN = "__plan_assign_from_roster__";

interface RosterRow {
  peerId: string;
  skills?: string[];
  roles?: string[];
  primaryRole?: string | null;
  membership?: string[];
  canExecute?: boolean;
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
  const skills = row.skills ?? [];
  const caps = row.membership ?? [];
  let score = 0;
  // Specialty match is skills-only — mesh capability tags are not factors.
  if (skills.includes(tag)) score += 50;
  if (caps.includes("task.execute") || row.canExecute === true) score += 5;
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

function pickByRole(rows: RosterRow[], role: string): string | undefined {
  const matches = rows.filter(
    (r) => r.primaryRole === role || (r.roles ?? []).includes(role),
  );
  if (matches.length === 0) return undefined;
  return pick(matches, "task.execute");
}

function isRoleMode(prompt: string): boolean {
  return /ASSIGNMENT MODE:\s*role/i.test(prompt);
}

/**
 * Build plan+assign JSON from an Assigner prompt that embeds eligibleWorkers.
 * Returns null when the roster cannot be parsed.
 */
export function synthesizePlanAssignFromRosterPrompt(prompt: string): string | null {
  const raw = extractRosterJson(prompt);
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const rows: RosterRow[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    if (typeof o.peerId !== "string" || !o.peerId) continue;
    rows.push({
      peerId: o.peerId,
      skills: Array.isArray(o.skills)
        ? o.skills.filter((x): x is string => typeof x === "string")
        : [],
      roles: Array.isArray(o.roles)
        ? o.roles.filter((x): x is string => typeof x === "string")
        : [],
      primaryRole: typeof o.primaryRole === "string" ? o.primaryRole : null,
      membership: Array.isArray(o.membership)
        ? o.membership.filter((x): x is string => typeof x === "string")
        : [],
      canExecute: o.canExecute === true,
      isSelf: o.isSelf === true,
      throughputTokensPerSec:
        typeof o.throughputTokensPerSec === "number" ? o.throughputTokensPerSec : null,
      modelFreshness: typeof o.modelFreshness === "number" ? o.modelFreshness : null,
    });
  }
  if (rows.length === 0) return null;

  if (isRoleMode(prompt)) {
    const pm = pickByRole(rows, "product_manager");
    const programmer = pickByRole(rows, "programmer");
    const tester = pickByRole(rows, "tester");
    const warnings: Array<Record<string, unknown>> = [];

    const specPeer = pm ?? pick(rows, "research");
    const specKind = pm ? "exact_role" : "skill_fallback";
    if (!pm) {
      warnings.push({
        code: pm === undefined && rows.every((r) => !(r.roles?.length)) ? "no_role_peers" : "skill_fallback",
        role: "product_manager",
        stepIndex: 0,
        usedPeerId: specPeer,
        assignKind: specKind,
        message: "No product_manager on roster — used skill/generalist for spec.",
      });
    }

    const codePeer = programmer ?? pick(rows, "coding");
    const codeKind = programmer ? "exact_role" : "skill_fallback";
    if (!programmer) {
      warnings.push({
        code: "skill_fallback",
        role: "programmer",
        stepIndex: 1,
        usedPeerId: codePeer,
        assignKind: codeKind,
        message: "No programmer on roster — used skill match for implement.",
      });
    }

    let testPeer = tester;
    let testKind: string = "exact_role";
    if (!testPeer) {
      testPeer = programmer ?? pick(rows, "coding");
      testKind = programmer ? "role_substitute" : "skill_fallback";
      warnings.push({
        code: testKind === "role_substitute" ? "role_substitute" : "skill_fallback",
        role: "tester",
        stepIndex: 2,
        usedPeerId: testPeer,
        assignKind: testKind,
        message:
          testKind === "role_substitute"
            ? "No tester — programmer covers light QA."
            : "No tester — skill fallback for QA.",
      });
    }

    return JSON.stringify({
      assignmentMode: "role",
      steps: [
        {
          objective: "Write a short product spec for the goal",
          requiredRole: "product_manager",
          requiredSkill: "research",
          depth: 1,
          dependsOn: [],
          assignedPeerId: specPeer,
          assignKind: specKind,
          reason: "mock role: product_manager / research",
        },
        {
          objective: "Implement against the spec",
          requiredRole: "programmer",
          requiredSkill: "coding",
          depth: 1,
          dependsOn: [0],
          assignedPeerId: codePeer,
          assignKind: codeKind,
          reason: "mock role: programmer / coding",
        },
        {
          objective: "Test the implementation",
          requiredRole: "tester",
          requiredSkill: "coding",
          depth: 1,
          dependsOn: [1],
          assignedPeerId: testPeer,
          assignKind: testKind,
          missingRole: tester ? undefined : "tester",
          reason: "mock role: tester (or substitute)",
        },
      ],
      aggregation: "concatenate",
      warnings,
      notes: "mock plan_assign_from_roster role mode",
    });
  }

  const researchPeer = pick(rows, "research.web");
  const codingPeer = pick(rows, "coding");
  const mergePeer = pick(rows, "task.execute");

  return JSON.stringify({
    assignmentMode: "skill",
    steps: [
      {
        objective: "Gather source facts for the goal",
        requiredSkill: "research.web",
        depth: 1,
        dependsOn: [],
        assignedPeerId: researchPeer,
        reason: "auto: best research.web / generalist fit",
      },
      {
        objective: "Draft structured answer from research",
        requiredSkill: "coding",
        depth: 1,
        dependsOn: [],
        assignedPeerId: codingPeer,
        reason: "auto: best coding / generalist fit",
      },
      {
        objective: "Combine research + draft into one final deliverable",
        requiredSkill: "task.execute",
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
