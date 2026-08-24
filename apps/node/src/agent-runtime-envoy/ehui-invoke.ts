import type { EhuiInvokeRequest } from "@envoymesh/api";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Runtime validation for `invokeEnvoyHarnessEhui` RPC params. */
export function parseEhuiInvokeRequest(raw: unknown): EhuiInvokeRequest {
  if (!isRecord(raw) || typeof raw.op !== "string") {
    throw new Error("invalid EhuiInvokeRequest: missing op");
  }
  switch (raw.op) {
    case "plan":
      if (typeof raw.action !== "string") {
        throw new Error("invalid EhuiInvokeRequest: plan requires action");
      }
      return {
        op: "plan",
        action: raw.action,
        ...(typeof raw.text === "string" ? { text: raw.text } : {}),
        ...(typeof raw.reason === "string" ? { reason: raw.reason } : {}),
      };
    case "memory":
      if (
        raw.memoryOp !== "list" &&
        raw.memoryOp !== "read" &&
        raw.memoryOp !== "add"
      ) {
        throw new Error("invalid EhuiInvokeRequest: memory requires memoryOp");
      }
      return {
        op: "memory",
        memoryOp: raw.memoryOp,
        ...(typeof raw.name === "string" ? { name: raw.name } : {}),
        ...(typeof raw.body === "string" ? { body: raw.body } : {}),
      };
    case "gitDiff":
      return {
        op: "gitDiff",
        ...(raw.staged === true ? { staged: true } : {}),
        ...(raw.stat === true ? { stat: true } : {}),
      };
    case "gitStatus":
      return { op: "gitStatus" };
    case "clusterStatus":
      return { op: "clusterStatus" };
    case "listPeers":
      return { op: "listPeers" };
    case "teamJobs":
      return { op: "teamJobs" };
    case "scoreboardSummary":
      return { op: "scoreboardSummary" };
    case "listSessions":
      return { op: "listSessions" };
    case "discoverySnapshot":
      return { op: "discoverySnapshot" };
    default:
      throw new Error(`invalid EhuiInvokeRequest: unknown op ${raw.op}`);
  }
}
