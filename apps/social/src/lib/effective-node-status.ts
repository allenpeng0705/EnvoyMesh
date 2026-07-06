import type { ConnectionStatus, NodeStatus } from "@envoymesh/api";

/** Mesh lifecycle + RPC snapshot — used for header chips and gating send/actions. */
export function isEffectiveNodeRunning(
  nodeStatus: NodeStatus,
  connectionStatus: ConnectionStatus | null | undefined,
): boolean {
  return nodeStatus === "running" || Boolean(connectionStatus?.online);
}

export function parseNodeStatusFromRpc(result: unknown): NodeStatus | null {
  if (typeof result === "string") {
    return result as NodeStatus;
  }
  if (result && typeof result === "object" && "status" in result) {
    const status = (result as { status?: unknown }).status;
    if (typeof status === "string") {
      return status as NodeStatus;
    }
  }
  return null;
}
