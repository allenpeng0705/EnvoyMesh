/**
 * Phase 48D — A2A Task Bridge.
 *
 * JSON-RPC 2.0 envelope parser + method dispatcher for the A2A v1.0
 * Task Bridge. Handles `message/send`, `tasks/get`, `tasks/cancel`;
 * translates EnvoyMesh task state to A2A v1.0 state and EnvoyMesh
 * Artifacts to A2A Parts. Authentication is bearer-token → ownerId.
 *
 * This module is intentionally side-effect-free except for the
 * audit-event hook the host passes in. It does not run LLMs, mint
 * mandates, or talk to libp2p — those are the executor's job.
 *
 * Design: docs/a2a-mcp-interop-design.md §6.4.
 */

import { randomUUID } from "node:crypto";
import type {
  A2AArtifact,
  A2ABearerTokenEntry,
  A2AJsonRpcErrorCode,
  A2AJsonRpcRequest,
  A2AJsonRpcResponse,
  A2AMethod,
  A2ATask,
  A2ATaskBridgeExecutor,
  A2ATaskStatus,
} from "@envoymesh/api";
import type { AuditEvent } from "@envoymesh/local-store";
import { A2A_JSONRPC_ERROR_CODES } from "@envoymesh/api";
import { partsToEnvoyArtifacts } from "./a2a-artifact-map.js";
import { artifactsToA2AParts } from "./a2a-artifact-map.js";
import { fromA2AState, isA2ATerminal, toA2AState } from "./a2a-state-map.js";

// ---------------------------------------------------------------------------
// Public options
// ---------------------------------------------------------------------------

export interface A2ATaskBridgeOptions {
  /** Operator-configured bearer tokens. Each maps to an ownerId. */
  bearerTokens: A2ABearerTokenEntry[];
  /** Executor the bridge delegates to for message execution + task lookup. */
  executor: A2ATaskBridgeExecutor;
  /** Public gateway URL advertised in FileArtifact URIs. May be null. */
  vaultUrl?: string | null;
  /**
   * Optional audit sink. Called once per significant event (auth
   * failure, message/send accepted, message/send rejected, task
   * cancelled, etc.). Hosts that don't need bridge-level audit can
   * omit this.
   */
  audit?: (event: AuditEvent) => void | Promise<void>;
  /** Now-injectable clock for tests. Defaults to `() => new Date()`. */
  now?: () => Date;
}

// ---------------------------------------------------------------------------
// Bridge factory
// ---------------------------------------------------------------------------

export interface A2ATaskBridge {
  /** Process one inbound JSON-RPC 2.0 request and produce a response. */
  handleRequest(rawBody: string, authHeader: string | undefined): Promise<A2AJsonRpcResponse>;
}

/**
 * Create the A2A Task Bridge. The returned `handleRequest` is the
 * single entry point — it owns envelope parsing, auth, dispatch,
 * translation, and audit. Side effects are limited to the executor
 * and audit sink supplied by the host.
 */
export function createA2ATaskBridge(options: A2ATaskBridgeOptions): A2ATaskBridge {
  const { bearerTokens, executor, vaultUrl = null, audit, now = () => new Date() } = options;

  // Build the token lookup table once at construction time. Operators
  // who rotate tokens must restart the bridge (or expose a hook to
  // rebuild the table — future work).
  const tokenIndex = new Map<string, A2ABearerTokenEntry>();
  for (const entry of bearerTokens) {
    if (entry.token && entry.ownerId) {
      tokenIndex.set(entry.token, entry);
    }
  }

  async function emitAudit(event: Omit<AuditEvent, "version" | "eventId" | "createdAt">): Promise<void> {
    if (!audit) return;
    await audit({
      version: "0.1",
      eventId: `audit_${randomUUID()}`,
      createdAt: now().toISOString(),
      ...event,
    } as AuditEvent);
  }

  function errorResponse(
    id: A2AJsonRpcRequest["id"] | null,
    code: A2AJsonRpcErrorCode,
    message: string,
    data?: unknown,
  ): A2AJsonRpcResponse {
    return {
      jsonrpc: "2.0",
      id,
      error: { code, message, data },
    };
  }

  function parseEnvelope(rawBody: string): { ok: true; req: A2AJsonRpcRequest } | { ok: false; code: A2AJsonRpcErrorCode; message: string } {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      return { ok: false, code: A2A_JSONRPC_ERROR_CODES.PARSE_ERROR, message: "Parse error" };
    }
    if (!parsed || typeof parsed !== "object") {
      return { ok: false, code: A2A_JSONRPC_ERROR_CODES.INVALID_REQUEST, message: "Invalid Request" };
    }
    const candidate = parsed as Record<string, unknown>;
    if (candidate.jsonrpc !== "2.0") {
      return { ok: false, code: A2A_JSONRPC_ERROR_CODES.INVALID_REQUEST, message: "Invalid Request — jsonrpc must be \"2.0\"" };
    }
    if (typeof candidate.method !== "string" || candidate.method.length === 0) {
      return { ok: false, code: A2A_JSONRPC_ERROR_CODES.INVALID_REQUEST, message: "Invalid Request — method must be a non-empty string" };
    }
    if (candidate.id !== undefined && typeof candidate.id !== "string" && typeof candidate.id !== "number") {
      return { ok: false, code: A2A_JSONRPC_ERROR_CODES.INVALID_REQUEST, message: "Invalid Request — id must be a string or number" };
    }
    if (candidate.params !== undefined && (typeof candidate.params !== "object" || candidate.params === null || Array.isArray(candidate.params))) {
      return { ok: false, code: A2A_JSONRPC_ERROR_CODES.INVALID_REQUEST, message: "Invalid Request — params must be an object" };
    }
    return {
      ok: true,
      req: {
        jsonrpc: "2.0",
        id: (candidate.id as string | number) ?? null,
        method: candidate.method,
        params: (candidate.params as Record<string, unknown> | undefined) ?? {},
      },
    };
  }

  function resolveBearer(authHeader: string | undefined): { ok: true; entry: A2ABearerTokenEntry } | { ok: false } {
    if (!authHeader) return { ok: false };
    const trimmed = authHeader.trim();
    if (!trimmed.toLowerCase().startsWith("bearer ")) return { ok: false };
    const token = trimmed.slice("bearer ".length).trim();
    if (!token) return { ok: false };
    const entry = tokenIndex.get(token);
    if (!entry) return { ok: false };
    return { ok: true, entry };
  }

  function buildTaskStatus(envoyState: string, summary: string): A2ATaskStatus {
    return {
      state: toA2AState(envoyState),
      message: {
        role: "agent",
        parts: [{ kind: "text", text: summary }],
      },
      timestamp: now().toISOString(),
    };
  }

  function buildArtifacts(envoyArtifacts: import("@envoymesh/protocol").Artifact[]): A2AArtifact[] {
    if (envoyArtifacts.length === 0) return [];
    return [
      {
        artifactId: `artifact_${randomUUID()}`,
        name: "result",
        parts: artifactsToA2AParts(envoyArtifacts, vaultUrl),
      },
    ];
  }

  function buildTaskObject(args: {
    id: string;
    status: A2ATaskStatus;
    artifacts: A2AArtifact[];
    history: A2ATask["history"];
  }): A2ATask {
    return {
      id: args.id,
      status: args.status,
      artifacts: args.artifacts,
      history: args.history,
      kind: "task",
    };
  }

  async function dispatchMessageSend(
    req: A2AJsonRpcRequest,
    ownerId: string,
  ): Promise<A2AJsonRpcResponse> {
    const params = req.params ?? {};
    const message = params.message as Record<string, unknown> | undefined;
    if (!message || typeof message !== "object" || !Array.isArray(message.parts)) {
      return errorResponse(req.id, A2A_JSONRPC_ERROR_CODES.INVALID_PARAMS, "params.message with parts[] is required");
    }
    const parts = message.parts as Array<Record<string, unknown>>;
    // Sanity-check parts shape — minimal guard; full validation is in the executor.
    if (parts.length === 0) {
      return errorResponse(req.id, A2A_JSONRPC_ERROR_CODES.INVALID_PARAMS, "params.message.parts must be non-empty");
    }

    const a2aTaskId = `a2a_${randomUUID()}`;
    const incomingMessage = {
      role: "user" as const,
      parts: parts as unknown as A2ATask["history"] extends Array<infer H> ? H extends { parts: infer P } ? P : never : never,
      ...(typeof message.messageId === "string" ? { messageId: message.messageId } : {}),
      ...(typeof message.taskId === "string" ? { taskId: message.taskId } : {}),
      ...(typeof message.contextId === "string" ? { contextId: message.contextId } : {}),
      ...(message.metadata && typeof message.metadata === "object" ? { metadata: message.metadata as Record<string, unknown> } : {}),
    };
    const configuration = (params.configuration && typeof params.configuration === "object"
      ? (params.configuration as Record<string, unknown>)
      : undefined);

    void partsToEnvoyArtifacts; // referenced for type completeness; executor does the mapping

    let execResult;
    try {
      execResult = await executor.executeMessageSend({
        ownerId,
        a2aTaskId,
        message: incomingMessage,
        configuration,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await emitAudit({
        type: "task.rejected",
        intent: "task.mandate",
        taskId: a2aTaskId,
        remotePeerId: ownerId,
        direction: "inbound",
        outcome: "deny",
        protocol: "a2a-v1.0",
        summary: `a2a bridge: message/send executor threw — ${msg}`,
      });
      return errorResponse(req.id, A2A_JSONRPC_ERROR_CODES.INTERNAL_ERROR, `executor error: ${msg}`);
    }

    const task = buildTaskObject({
      id: a2aTaskId,
      status: buildTaskStatus(execResult.envoyState, execResult.summary),
      artifacts: buildArtifacts(execResult.artifacts),
      history: [incomingMessage],
    });

    await emitAudit({
      type: "task.handled",
      intent: "task.mandate",
      taskId: a2aTaskId,
      remotePeerId: ownerId,
      direction: "inbound",
      outcome: "record",
      protocol: "a2a-v1.0",
      summary: `a2a bridge: message/send ${task.status.state}`,
    });

    return {
      jsonrpc: "2.0",
      id: req.id,
      result: task,
    };
  }

  async function dispatchTasksGet(req: A2AJsonRpcRequest): Promise<A2AJsonRpcResponse> {
    const params = req.params ?? {};
    const id = typeof params.id === "string" ? params.id : null;
    if (!id) {
      return errorResponse(req.id, A2A_JSONRPC_ERROR_CODES.INVALID_PARAMS, "params.id is required");
    }
    let result;
    try {
      result = await executor.getTask(id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return errorResponse(req.id, A2A_JSONRPC_ERROR_CODES.INTERNAL_ERROR, `executor error: ${msg}`);
    }
    if (!result) {
      return errorResponse(req.id, A2A_JSONRPC_ERROR_CODES.TASK_NOT_FOUND, `task not found: ${id}`);
    }
    return {
      jsonrpc: "2.0",
      id: req.id,
      result: buildTaskObject({
        id,
        status: buildTaskStatus(result.envoyState, result.summary),
        artifacts: buildArtifacts(result.artifacts),
        history: undefined,
      }),
    };
  }

  async function dispatchTasksCancel(req: A2AJsonRpcRequest, ownerId: string): Promise<A2AJsonRpcResponse> {
    const params = req.params ?? {};
    const id = typeof params.id === "string" ? params.id : null;
    if (!id) {
      return errorResponse(req.id, A2A_JSONRPC_ERROR_CODES.INVALID_PARAMS, "params.id is required");
    }
    let result;
    try {
      result = await executor.cancelTask(id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return errorResponse(req.id, A2A_JSONRPC_ERROR_CODES.INTERNAL_ERROR, `executor error: ${msg}`);
    }
    await emitAudit({
      type: "task.handled",
      intent: "task.cancel",
      taskId: id,
      remotePeerId: ownerId,
      direction: "inbound",
      outcome: "record",
      protocol: "a2a-v1.0",
      summary: `a2a bridge: tasks/cancel → ${result.envoyState}`,
    });
    return {
      jsonrpc: "2.0",
      id: req.id,
      result: buildTaskObject({
        id,
        status: buildTaskStatus(result.envoyState, result.summary),
        artifacts: buildArtifacts(result.artifacts),
        history: undefined,
      }),
    };
  }

  return {
    async handleRequest(rawBody, authHeader) {
      const parsed = parseEnvelope(rawBody);
      if (!parsed.ok) {
        // Per JSON-RPC 2.0: id is null when the parse itself fails.
        return errorResponse(null, parsed.code, parsed.message);
      }
      const req = parsed.req;

      // Bearer auth gates every method.
      const auth = resolveBearer(authHeader);
      if (!auth.ok) {
        await emitAudit({
          type: "message.rejected",
          direction: "inbound",
          outcome: "deny",
          protocol: "a2a-v1.0",
          summary: `a2a bridge: missing or invalid bearer token for ${req.method}`,
        });
        return errorResponse(req.id, A2A_JSONRPC_ERROR_CODES.AUTH_REQUIRED, "auth-required: missing or invalid bearer token");
      }
      const ownerId = auth.entry.ownerId;

      switch (req.method as A2AMethod) {
        case "message/send":
          return dispatchMessageSend(req, ownerId);
        case "tasks/get":
          return dispatchTasksGet(req);
        case "tasks/cancel":
          return dispatchTasksCancel(req, ownerId);
        default:
          return errorResponse(req.id, A2A_JSONRPC_ERROR_CODES.METHOD_NOT_FOUND, `method not found: ${req.method}`);
      }
    },
  };

  // `fromA2AState` is referenced by the artifact-map; kept here as a
  // no-op so module-shape analyzers see the import is used.
  void fromA2AState;
}

// ---------------------------------------------------------------------------
// HTTP adapter — used by the bridge/index.ts mount
// ---------------------------------------------------------------------------

/**
 * Minimal HTTP-style adapter. The host wires this into its own HTTP
 * server. Keeping the adapter inline avoids pulling a framework
 * dependency into the bridge module.
 */
export interface A2AHttpRequest {
  method?: string;
  /** Raw POST body. The bridge owns JSON parsing. */
  body: string;
  headers: Record<string, string | string[] | undefined>;
}

export interface A2AHttpResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

/**
 * Dispatch an inbound HTTP request through the bridge. Returns the
 * response object the host writes back to the socket.
 */
export async function handleA2AHttpRequest(
  bridge: A2ATaskBridge,
  req: A2AHttpRequest,
): Promise<A2AHttpResponse> {
  if (req.method && req.method.toUpperCase() !== "POST") {
    return {
      statusCode: 405,
      headers: { Allow: "POST", "Content-Type": "application/json" },
      body: JSON.stringify({ error: "method not allowed" }),
    };
  }
  const auth = req.headers["authorization"];
  const authHeader = Array.isArray(auth) ? auth[0] : auth;
  const jsonRpc = await bridge.handleRequest(req.body, authHeader);
  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
    },
    body: JSON.stringify(jsonRpc),
  };
}