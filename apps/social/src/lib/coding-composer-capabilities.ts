/**
 * Per-harness Coding composer capabilities.
 *
 * Two separate controls (EnvoyCoder-aligned):
 * - **Mode** — agent-native working posture when we can honor it
 * - **Permissions** — Safe default / Ask every time / Full access
 *
 * A control we cannot honour is disabled with a reason (not shown as working).
 */

import {
  codingHarnessToExtAgentId,
  isCodingTierBHarness,
  type CodingHarnessId,
} from "@envoymesh/api";

export type CodingWorkingMode = "ask" | "plan" | "code";

export type CodingThinkingEffort = "off" | "low" | "medium" | "high";

/** Permission policy values shared with EH / Pi / catalog ACP. */
export type CodingPermissionPolicy =
  | "safe-only"
  | "always-confirm"
  | "off";

export type CodingAgentModeOption = {
  id: string;
  label: string;
  /** Maps onto legacy Ask/Plan/Code prompt shaping when native set_mode is unavailable. */
  workingMode?: CodingWorkingMode;
};

export type CodingComposerCapabilities = {
  model: boolean;
  /**
   * Legacy Ask/Plan/Code buttons. Prefer `agentModes` when non-empty;
   * when both are set, the toolbar shows agentModes.
   */
  workingMode: boolean;
  /** Plan can use `/plan` slash when sticky Plan is on. */
  planSlash: boolean;
  fast: boolean;
  thinking: boolean;
  importSession: boolean;
  attach: boolean;
  /** Agent-native mode options (empty = no native mode picker). */
  agentModes: readonly CodingAgentModeOption[];
  /** True when changing mode can call a native API (not only prompt text). */
  canSetMode: boolean;
  /** Show Permissions control. */
  permissions: boolean;
  /** When permissions is false, explain why Full/Ask cannot be honored. */
  permissionDisabledReason?: string;
  /**
   * Catalog ACP (non-sidecar) has no Mesh ask dock yet — Ask would cancel
   * tools without a prompt. Disable until a dock ships.
   */
  permissionAskDisabledReason?: string;
  /**
   * Sidecar Tier B (codex/claude/cursor) cannot gate tools via Mesh today.
   * Permissions UI still shows Ask/Safe as guidance; Full is disabled.
   */
  permissionFullDisabledReason?: string;
};

/** Agents whose catalogs advertise `/plan`. */
const PLAN_SLASH = new Set<string>(["codex", "claudecode"]);

/** Agents whose catalogs advertise `/fast`. */
const FAST = new Set<string>(["codex", "claudecode"]);

/** Agents with effort / think-token style controls. */
const THINKING = new Set<string>(["claudecode", "codex"]);

/** Dedicated sidecars without Mesh permission gating. */
const SIDECAR_NO_MESH_PERMS = new Set<string>([
  "codex",
  "claudecode",
  "cursor",
  "opencode",
  "codewhale",
  "deepseek-harness",
  "minimax-code",
]);

const EH_MODES: readonly CodingAgentModeOption[] = [
  { id: "default", label: "Default", workingMode: "code" },
  { id: "plan", label: "Plan", workingMode: "plan" },
  { id: "review", label: "Review", workingMode: "ask" },
];

const CLAUDE_MODES: readonly CodingAgentModeOption[] = [
  { id: "default", label: "Manual", workingMode: "code" },
  { id: "acceptEdits", label: "Accept edits", workingMode: "code" },
  { id: "plan", label: "Plan", workingMode: "plan" },
  { id: "auto", label: "Auto", workingMode: "code" },
  { id: "bypassPermissions", label: "Full (bypass)", workingMode: "code" },
];

const CODEX_MODES: readonly CodingAgentModeOption[] = [
  { id: "read-only", label: "Read only", workingMode: "ask" },
  { id: "agent", label: "Agent", workingMode: "code" },
  { id: "agent-full-access", label: "Full access", workingMode: "code" },
];

const CURSOR_MODES: readonly CodingAgentModeOption[] = [
  { id: "ask", label: "Ask", workingMode: "ask" },
  { id: "plan", label: "Plan", workingMode: "plan" },
  { id: "agent", label: "Agent", workingMode: "code" },
];

const SIDECAR_PERMS_REASON =
  "This agent’s Coding run path does not support Mesh permission gating yet.";

const CATALOG_ASK_DISABLED_REASON =
  "Ask every time needs an on-screen confirmation. Until that ships, use Safe default (read-only tools auto-run; others stay blocked).";

function tierBAgentKey(harness: CodingHarnessId): string {
  return codingHarnessToExtAgentId(harness) ?? harness;
}

function resolveAgentKey(harness: string): string {
  const id = harness.trim();
  if (id === "envoy-harness" || id === "pi") return id;
  if (isCodingTierBHarness(id)) {
    return codingHarnessToExtAgentId(id as CodingHarnessId) ?? id;
  }
  return id;
}

export function codingComposerCapabilities(
  harness: CodingHarnessId | string,
): CodingComposerCapabilities {
  const id = harness.trim() as CodingHarnessId;
  const agent = resolveAgentKey(id);

  if (id === "envoy-harness") {
    return {
      model: true,
      workingMode: false,
      planSlash: true,
      fast: true,
      thinking: false,
      importSession: true,
      attach: true,
      agentModes: EH_MODES,
      canSetMode: true,
      permissions: true,
    };
  }

  if (id === "pi") {
    return {
      model: true,
      workingMode: true,
      planSlash: false,
      fast: false,
      thinking: false,
      importSession: true,
      attach: true,
      agentModes: [],
      canSetMode: false,
      permissions: true,
    };
  }

  if (!isCodingTierBHarness(id)) {
    return {
      model: false,
      workingMode: true,
      planSlash: false,
      fast: false,
      thinking: false,
      importSession: true,
      attach: true,
      agentModes: [],
      canSetMode: false,
      permissions: false,
      permissionDisabledReason:
        "Permission policy is not available for this agent.",
    };
  }

  const isSidecar = SIDECAR_NO_MESH_PERMS.has(agent) || SIDECAR_NO_MESH_PERMS.has(id);
  let agentModes: readonly CodingAgentModeOption[] = [];
  if (agent === "claudecode" || id === "claudecode") agentModes = CLAUDE_MODES;
  else if (agent === "codex" || id === "codex") agentModes = CODEX_MODES;
  else if (agent === "cursor" || id === "cursor") agentModes = CURSOR_MODES;

  return {
    model: true,
    workingMode: agentModes.length === 0,
    planSlash: PLAN_SLASH.has(agent) || PLAN_SLASH.has(id),
    fast: FAST.has(agent) || FAST.has(id),
    thinking: THINKING.has(agent) || THINKING.has(id),
    importSession: true,
    attach: true,
    agentModes,
    // Native set_mode only once ACP bridges land; today modes guide prompts.
    canSetMode: false,
    permissions: true,
    ...(isSidecar
      ? { permissionFullDisabledReason: SIDECAR_PERMS_REASON }
      : { permissionAskDisabledReason: CATALOG_ASK_DISABLED_REASON }),
  };
}

/** Resolve sticky workingMode from an agent mode id. */
export function workingModeFromAgentMode(
  caps: CodingComposerCapabilities,
  agentModeId: string | undefined,
): CodingWorkingMode | undefined {
  if (!agentModeId) return undefined;
  const row = caps.agentModes.find((m) => m.id === agentModeId);
  return row?.workingMode;
}

export function normalizeCodingPermissionPolicy(
  raw: unknown,
): CodingPermissionPolicy | undefined {
  if (raw === "safe-only" || raw === "always-confirm" || raw === "off") {
    return raw;
  }
  if (raw === "never") return "off";
  return undefined;
}
