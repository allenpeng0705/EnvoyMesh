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
  | "mmx";

export const EXT_AGENT_SIDECAR_KINDS: readonly ExtAgentSidecarKind[] = [
  "pi",
  "hermes",
  "openhuman",
  "codex",
  "claudecode",
  "cursor",
  "aider",
  "mmx",
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

export interface ExtAgentBackend {
  readonly kind: ExtAgentSidecarKind;
  /** Human-readable label for logs /status. */
  readonly label: string;
  ask(text: string, sessionKey: string): Promise<string>;
  /** Optional readiness probe (non-fatal if it fails — ask will surface errors). */
  probe?(): Promise<boolean>;
}

export interface ExtAgentSidecarListenConfig {
  host: string;
  port: number;
  bridgeSendUrl: string;
  bridgeSecret?: string;
}
