/**
 * In-process Ext Agent sidecars.
 *
 * HomeClaw ships its own `:8010/message` channel. Hermes / OpenHuman / Pi do
 * not — EnvoyMesh runs a local HTTP adapter that speaks the bridge contract
 * and forwards to each backend (Hermes/OpenHuman HTTP APIs, or built-in Pi).
 */
export type ExtAgentSidecarKind = "pi" | "hermes" | "openhuman";

export const EXT_AGENT_SIDECAR_KINDS: readonly ExtAgentSidecarKind[] = [
  "pi",
  "hermes",
  "openhuman",
];

export function isExtAgentSidecarKind(id: string | undefined): id is ExtAgentSidecarKind {
  return id === "pi" || id === "hermes" || id === "openhuman";
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
