import type { EhuiInvokeRequest } from "@envoymesh/api";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function withChatId<T extends EhuiInvokeRequest>(
  base: T,
  raw: Record<string, unknown>,
): T {
  if (typeof raw.chatId === "string" && raw.chatId.length > 0) {
    return { ...base, chatId: raw.chatId };
  }
  return base;
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
      return withChatId(
        {
          op: "plan",
          action: raw.action,
          ...(typeof raw.text === "string" ? { text: raw.text } : {}),
          ...(typeof raw.reason === "string" ? { reason: raw.reason } : {}),
        },
        raw,
      );
    case "memory":
      if (
        raw.memoryOp !== "list" &&
        raw.memoryOp !== "read" &&
        raw.memoryOp !== "add"
      ) {
        throw new Error("invalid EhuiInvokeRequest: memory requires memoryOp");
      }
      return withChatId(
        {
          op: "memory",
          memoryOp: raw.memoryOp,
          ...(typeof raw.name === "string" ? { name: raw.name } : {}),
          ...(typeof raw.body === "string" ? { body: raw.body } : {}),
        },
        raw,
      );
    case "gitDiff":
      return withChatId(
        {
          op: "gitDiff",
          ...(raw.staged === true ? { staged: true } : {}),
          ...(raw.stat === true ? { stat: true } : {}),
        },
        raw,
      );
    case "gitStatus":
      return withChatId({ op: "gitStatus" }, raw);
    case "clusterStatus":
      return withChatId({ op: "clusterStatus" }, raw);
    case "listPeers":
      return withChatId({ op: "listPeers" }, raw);
    case "listConfiguredPeers":
      return withChatId({ op: "listConfiguredPeers" }, raw);
    case "teamJobs":
      return withChatId({ op: "teamJobs" }, raw);
    case "scoreboardSummary":
      return withChatId({ op: "scoreboardSummary" }, raw);
    case "listSessions":
      return withChatId({ op: "listSessions" }, raw);
    case "discoverySnapshot":
      return withChatId({ op: "discoverySnapshot" }, raw);
    default:
      throw new Error(`invalid EhuiInvokeRequest: unknown op ${raw.op}`);
  }
}
