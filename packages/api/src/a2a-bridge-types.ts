/**
 * Phase 48D — A2A Task Bridge types.
 *
 * Type-only exports for the JSON-RPC 2.0 envelope and the executor
 * interface. Kept browser-safe (no Node-only deps) so the Social UI
 * can import them for type-checking purposes even though it doesn't
 * run the bridge.
 *
 * Design: docs/a2a-mcp-interop-design.md §6.4.
 */

// ---------------------------------------------------------------------------
// JSON-RPC 2.0 envelope
// ---------------------------------------------------------------------------

/** JSON-RPC 2.0 error codes used by the A2A bridge. */
export const A2A_JSONRPC_ERROR_CODES = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  /** Bridge-specific: missing or invalid bearer token. */
  AUTH_REQUIRED: -32001,
  /** Bridge-specific: a2aTaskId not found in the in-memory store. */
  TASK_NOT_FOUND: -32002,
  /** Bridge-specific: relay→home proxy upstream timeout. */
  UPSTREAM_TIMEOUT: -32003,
} as const;

export type A2AJsonRpcErrorCode =
  (typeof A2A_JSONRPC_ERROR_CODES)[keyof typeof A2A_JSONRPC_ERROR_CODES];

export interface A2AJsonRpcRequest {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

export interface A2AJsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: {
    code: A2AJsonRpcErrorCode | number;
    message: string;
    data?: unknown;
  };
}

// ---------------------------------------------------------------------------
// A2A v1.0 shapes (subset the bridge produces / consumes)
// ---------------------------------------------------------------------------

export const A2A_METHODS = ["message/send", "tasks/get", "tasks/cancel"] as const;
export type A2AMethod = (typeof A2A_METHODS)[number];

export const A2A_STATE_VALUES = [
  "submitted",
  "working",
  "input-required",
  "completed",
  "canceled",
  "failed",
  "rejected",
  "auth-required",
  "unknown",
] as const;
export type A2AState = (typeof A2A_STATE_VALUES)[number];

export interface A2ATextPart {
  kind: "text";
  text: string;
  metadata?: Record<string, unknown>;
}

export interface A2AFilePart {
  kind: "file";
  file: {
    name?: string;
    mimeType?: string;
    uri?: string;
    bytes?: string;
  };
  metadata?: Record<string, unknown>;
}

export interface A2ADataPart {
  kind: "data";
  data: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export type A2APart = A2ATextPart | A2AFilePart | A2ADataPart;

export interface A2AMessage {
  role: "user" | "agent";
  parts: A2APart[];
  messageId?: string;
  taskId?: string;
  contextId?: string;
  metadata?: Record<string, unknown>;
}

export interface A2ATaskStatus {
  state: A2AState;
  message?: A2AMessage;
  timestamp: string;
}

export interface A2AArtifact {
  artifactId: string;
  name?: string;
  description?: string;
  parts: A2APart[];
  metadata?: Record<string, unknown>;
}

export interface A2ATask {
  id: string;
  contextId?: string;
  status: A2ATaskStatus;
  history?: A2AMessage[];
  artifacts?: A2AArtifact[];
  metadata?: Record<string, unknown>;
  kind: "task";
}

// ---------------------------------------------------------------------------
// Executor interface — what the bridge needs from the host
// ---------------------------------------------------------------------------

export interface A2AExecutorInput {
  /** Owner resolved from the bearer token. */
  ownerId: string;
  /** A2A Task ID we minted for this request (so the caller can poll). */
  a2aTaskId: string;
  /** A2A Message that came in via `message/send`. */
  message: A2AMessage;
  /** Configuration from the A2A request (acceptedOutputModes, etc.). */
  configuration?: Record<string, unknown>;
}

export interface A2AExecutorResult {
  /** Terminal state — the bridge maps this to A2A v1.0 enum. */
  envoyState:
    | "completed"
    | "failed"
    | "cancelled"
    | "running"
    | "waiting_for_owner"
    | "waiting_for_peer";
  /** Human-readable summary that ends up in the Task status message. */
  summary: string;
  /** Artifacts to attach to the Task. */
  artifacts: import("@envoymesh/protocol").Artifact[];
}

/**
 * Inputs to owner-scoped task operations. The bridge always passes
 * `{ ownerId, a2aTaskId }` so the executor can enforce task ownership
 * (a valid bearer token only grants access to the bearer owner's tasks).
 */
export interface A2AOwnedTaskLookup {
  /** Owner ID resolved from the bearer token. */
  ownerId: string;
  /** A2A Task ID. */
  a2aTaskId: string;
}

/**
 * Pluggable executor that the host wires in. The bridge does not run
 * LLMs or talk to task stores itself — it delegates to the executor
 * for everything beyond JSON-RPC parsing, auth, and translation.
 */
export interface A2ATaskBridgeExecutor {
  /**
   * Execute an inbound A2A task. The implementation is responsible
   * for minting an EnvoyMesh mandate (signed by the node owner),
   * routing through the local task dispatcher, and waiting for /
   * constructing the final result.
   *
   * Returning `envoyState: "running"` (or any non-terminal value)
   * signals that the bridge should respond to `message/send` with
   * `state: "working"` and let the caller poll `tasks/get`.
   */
  executeMessageSend(input: A2AExecutorInput): Promise<A2AExecutorResult>;

  /**
   * Look up an existing task by its A2A ID. Returns null if unknown
   * OR if the task belongs to a different owner. The executor MUST
   * enforce task ownership — the bridge will surface a 404 to any
   * caller asking for a task they don't own.
   */
  getTask(input: A2AOwnedTaskLookup): Promise<A2AExecutorResult | null>;

  /**
   * Cancel a task. Returns the final state. The executor MUST enforce
   * task ownership; cancelling a task that belongs to a different
   * owner should return `envoyState: "failed"` with a clear summary,
   * NOT the cancelled state.
   */
  cancelTask(input: A2AOwnedTaskLookup): Promise<A2AExecutorResult>;
}

// ---------------------------------------------------------------------------
// Bearer-token entries (operator-managed)
// ---------------------------------------------------------------------------

export interface A2ABearerTokenEntry {
  token: string;
  /** EnvoyMesh ownerId this token represents. */
  ownerId: string;
  /** Optional operator label (e.g. "langchain-prod"). */
  label?: string;
}

// ---------------------------------------------------------------------------
// Audit event metadata added by the bridge
// ---------------------------------------------------------------------------

/**
 * Common fields the bridge writes into every audit event it emits.
 * Hosts merge these into their `createAuditEvent({ ... })` call.
 */
export interface A2ABridgeAuditContext {
  protocol: "a2a-v1.0";
  /** Owner ID resolved from the bearer token. */
  remoteOwnerId: string;
  /** A2A Task ID (also a journal-level correlation ID). */
  a2aTaskId: string;
  /** A2A method that triggered the event. */
  method: A2AMethod | "auth";
}