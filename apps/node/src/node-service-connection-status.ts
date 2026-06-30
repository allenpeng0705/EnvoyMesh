/**
 * Connection Status runtime — read-only bridge + openclaw status.
 */
import type {
  BridgeStatus,
  ConnectionStatus,
  OpenClawStatus,
} from "@envoymesh/api";
import type { SessionTokenRecord } from "@envoymesh/local-store";

export interface ConnectionStatusContext {
  /** The last-error context string (or undefined). */
  getLastNodeError(): string | undefined;
  /** ISO timestamp when last-error was recorded (or undefined). */
  getLastNodeErrorAt(): string | undefined;
  /** Return the mesh instance if reachable (else undefined). */
  getReachableMesh(): {
    peerId: string;
    multiaddrs: string[];
    getConnectionStats(): { circuitPeerIds: string[] };
  } | undefined;
  /** Return the current node status string ("running", "stopping", etc.). */
  getNodeStatus(): string;
  /** Bootstrap relay peers that this node knows about. */
  getRelayBootstrapPeers(): string[];
  /** True when the local terminal manager has been instantiated. */
  hasTerminalManager(): boolean;
  /** Return the current bridge status (or undefined if unset). */
  getBridgeStatus?(): BridgeStatus | undefined;
}

export function getConnectionStatusViaRuntime(
  ctx: ConnectionStatusContext,
): ConnectionStatus {
  const diagnostics = {
    lastError: ctx.getLastNodeError() ?? undefined,
    lastErrorAt: ctx.getLastNodeErrorAt() ?? undefined,
  };
  const mesh = ctx.getReachableMesh();
  const base = {
    bondedPeers: 0,
    terminalsAvailable: ctx.hasTerminalManager(),
    bootstrapPeers: ctx.getRelayBootstrapPeers(),
    ...diagnostics,
  };
  if (!mesh || ctx.getNodeStatus() !== "running") {
    return {
      online: false,
      peerId: "",
      multiaddrs: [],
      connectedRelays: [],
      ...base,
    };
  }
  return {
    online: true,
    peerId: mesh.peerId,
    multiaddrs: mesh.multiaddrs,
    connectedRelays: mesh.getConnectionStats().circuitPeerIds,
    ...base,
  };
}

/* ---------- bridge + openclaw status ---------- */

const DEFAULT_BRIDGE_STATUS: BridgeStatus = {
  enabled: false,
  agentPeerId: "",
  agentUrl: "",
  listenPort: 0,
  agentName: "",
  agentType: undefined,
};

export function getBridgeStatusViaRuntime(
  ctx: ConnectionStatusContext,
): BridgeStatus {
  return ctx.getBridgeStatus?.() ?? DEFAULT_BRIDGE_STATUS;
}

export async function getOpenClawStatusViaRuntime(
  deps: {
    isOpenClawEnabled: () => Promise<boolean>;
    isOpenClawReady: () => boolean;
    getAssistantAgentUrl: () => string;
    getOpenClawGatewayChild: () => { killed: boolean; pid?: number } | undefined;
  },
): Promise<OpenClawStatus> {
  const enabled = await deps.isOpenClawEnabled();
  return {
    enabled,
    running: deps.isOpenClawReady(),
    url: deps.getAssistantAgentUrl(),
    childPid: (() => {
      const c = deps.getOpenClawGatewayChild();
      return c && !c.killed ? c.pid : undefined;
    })(),
  };
}

/* ---------- session tokens + last-error recorder ---------- */

export interface SessionTokenAccess {
  getSessionTokenStore(): { getTokenByValue(token: string): SessionTokenRecord | undefined } | undefined;
}

export async function lookupSessionTokenViaRuntime(
  ctx: SessionTokenAccess,
  token: string,
): Promise<SessionTokenRecord | undefined> {
  const store = ctx.getSessionTokenStore();
  if (!store) return undefined;
  return store.getTokenByValue(token.trim());
}

export interface RecordNodeErrorAccess {
  getLastNodeError(): string | undefined;
  setLastNodeError(value: string): void;
  getLastNodeErrorAt(): string | undefined;
  setLastNodeErrorAt(value: string): void;
}

export function recordNodeErrorViaRuntime(
  ctx: RecordNodeErrorAccess,
  context: string,
  err: unknown,
): void {
  const msg = err instanceof Error ? err.message : String(err);
  ctx.setLastNodeError(`${context}: ${msg}`);
  ctx.setLastNodeErrorAt(new Date().toISOString());
}