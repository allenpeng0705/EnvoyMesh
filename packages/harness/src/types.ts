/**
 * In-process Ext Agent sidecars.
 *
 * HomeClaw ships its own `:8010/message` channel. Hermes / OpenHuman / Pi /
 * codex / claudecode do not — EnvoyMesh runs a local HTTP adapter that
 * speaks the bridge contract and forwards to each backend (Hermes /
 * OpenHuman HTTP APIs, built-in Pi runtime, codex stdio JSON-RPC, or the
 * Claude Agent SDK).
 *
 * Phase 56A: `cursor` — Cursor CLI (`cursor-agent`). Phase 56B: `aider`
 * (Aider pair-programmer CLI). Phase 56C: `mmx` (MiniMax MMX-CLI).
 * All three use the shared `OneShotCliBackend` base (one-shot
 * subprocess per ask).
 */
export type ExtAgentSidecarKind =
  | "pi"
  | "hermes"
  | "openhuman"
  | "codex"
  | "claudecode"
  | "cursor"
  | "aider"
  | "mmx"
  | "opencode"
  | "codewhale";

export const EXT_AGENT_SIDECAR_KINDS: readonly ExtAgentSidecarKind[] = [
  "pi",
  "hermes",
  "openhuman",
  "codex",
  "claudecode",
  "cursor",
  "aider",
  "mmx",
  "opencode",
  "codewhale",
];

export function isExtAgentSidecarKind(id: string | undefined): id is ExtAgentSidecarKind {
  return id != null && (EXT_AGENT_SIDECAR_KINDS as readonly string[]).includes(id);
}

export interface ExtAgentInboundMessage {
  from: string;
  fromOwnerId: string;
  fromName?: string;
  text: string;
  messageId?: string;
}

/** Optional ask options — streaming backends call `onDelta` per token chunk. */
export type ExtAgentAskOpts = {
  onDelta?: (chunk: string) => void;
  /** Per-ask working directory (Coding harness); overrides project-path store. */
  cwd?: string;
  /** Per-ask model id / alias (Coding harness). */
  model?: string;
  /** Extra env merged for this spawn only (API keys / base URLs). */
  env?: NodeJS.ProcessEnv;
  /**
   * Permission policy for catalog ACP hosts:
   * `safe-only` | `always-confirm` | `off` (Full access).
   */
  permissionPolicy?: "safe-only" | "always-confirm" | "off" | "never";
  /**
   * Ask a human before a tool that `permissionPolicy` does not already cover.
   *
   * Only a caller with a UI dock passes this. Absent means the session cancels the tool
   * rather than allowing it silently — the rule catalog ACP has always followed.
   */
  onPermissionRequest?: (req: import("./catalog-acp-policy.js").CatalogToolRequest) => Promise<boolean>;
};

export interface ExtAgentBackend {
  /** Sidecar kind, or a Coding catalog provider id. */
  readonly kind: ExtAgentSidecarKind | string;
  /** Human-readable label for logs /status. */
  readonly label: string;
  ask(text: string, sessionKey: string, opts?: ExtAgentAskOpts): Promise<string>;
  /** Optional readiness probe (non-fatal if it fails — ask will surface errors). */
  probe?(): Promise<boolean>;
}

export interface ExtAgentSidecarListenConfig {
  host: string;
  port: number;
  bridgeSendUrl: string;
  bridgeSecret?: string;
}
