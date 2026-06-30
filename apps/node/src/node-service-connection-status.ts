/**
 * Connection Status runtime — minimal first extraction.
 *
 * Owns the read-only `getConnectionStatus()` method which reads:
 *   - last-error fields (private _lastNodeError / _lastNodeErrorAt)
 *   - mesh reachability + connection stats
 *   - node status string
 *   - bootstrap peers list
 *   - terminal manager presence
 */
import type { ConnectionStatus } from "@envoymesh/api";

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