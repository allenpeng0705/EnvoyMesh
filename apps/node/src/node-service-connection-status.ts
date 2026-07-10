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
  /** Return the relay book entries the node has discovered and verified. */
  getRelayBook?(): Array<{ relayId: string; region?: string; addrs: string[] }>;
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
    connectedRelays: collectConnectedRelayLabels(
      mesh.getConnectionStats().circuitPeerIds,
      mesh.multiaddrs,
      ctx.getRelayBook?.(),
    ),
    ...base,
  };
}

/**
 * Compose the relay labels rendered in the Settings → Network Status panel.
 *
 * libp2p `getConnections()` only lists peers with an open TCP session — when
 * no outbound dial is active the array is empty even though the node is
 * ready to relay. To avoid the "Offline" flicker, we union three sources:
 *
 *   1. live circuit-relay peer IDs from libp2p connection stats
 *   2. relay hosts already known via our advertised /p2p-circuit multiaddrs
 *   3. verified relay-book entries (relay.checkin → discovery, persisted)
 *
 * Each label is the libp2p peer id (so the panel is consistent across
 * sources) — duplicate peer ids collapse naturally.
 */
function collectConnectedRelayLabels(
  circuitPeerIds: string[],
  multiaddrs: string[],
  relayBook?: Array<{ relayId: string; region?: string; addrs: string[] }>,
): string[] {
  const seen = new Set<string>();
  const labels: string[] = [];
  const push = (id: string) => {
    if (!id || seen.has(id)) return;
    seen.add(id);
    labels.push(id);
  };
  for (const id of circuitPeerIds) push(id);
  // /p2p-circuit/p2p/<relayPeerId> — the relay's libp2p id
  for (const maddr of multiaddrs) {
    const m = maddr.match(/\/p2p-circuit\/p2p\/([^/]+)/);
    if (m?.[1]) push(m[1]);
  }
  // Relay book entries survive across restarts and dial churn — show them
  // last so live connections still lead.
  if (relayBook?.length) {
    for (const entry of relayBook) {
      if (entry.relayId) push(entry.relayId);
    }
  }
  return labels;
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
    /**
     * Optional — returns the runtime's last recorded failure reason so the
     * settings page can show "why is it Stopped" alongside the status badge.
     * Older callers that don't supply this still work; `lastError` and friends
     * will simply be undefined on the response.
     */
    getOpenClawError?: () => {
      lastError: string | null;
      lastErrorAt: string | null;
      consecutiveRestartFailures: number;
    };
  },
): Promise<OpenClawStatus> {
  const enabled = await deps.isOpenClawEnabled();
  const err = deps.getOpenClawError?.();
  return {
    enabled,
    running: deps.isOpenClawReady(),
    url: deps.getAssistantAgentUrl(),
    childPid: (() => {
      const c = deps.getOpenClawGatewayChild();
      return c && !c.killed ? c.pid : undefined;
    })(),
    lastError: err?.lastError ?? null,
    lastErrorAt: err?.lastErrorAt ?? null,
    consecutiveRestartFailures: err?.consecutiveRestartFailures ?? 0,
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