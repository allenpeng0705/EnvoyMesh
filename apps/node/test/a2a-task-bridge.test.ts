/**
 * Phase 48D — A2A Task Bridge tests.
 *
 * Pins JSON-RPC 2.0 envelope parsing, method dispatch, bearer-token
 * auth, state mapping, and audit-event emission. Uses a stub
 * executor so we can drive the bridge deterministically without
 * touching the real TaskDispatcher.
 */

import { describe, expect, it, vi } from "vitest";
import type { AuditEvent } from "@envoymesh/local-store";
import type {
  A2AExecutorInput,
  A2AExecutorResult,
  A2ATaskBridgeExecutor,
} from "@envoymesh/api";
import { A2A_JSONRPC_ERROR_CODES } from "@envoymesh/api";
import {
  createA2ATaskBridge,
  handleA2AHttpRequest,
} from "../src/a2a-task-bridge.js";

// ---------------------------------------------------------------------------
// Stub executor builder
// ---------------------------------------------------------------------------

function makeExecutor(overrides: Partial<A2ATaskBridgeExecutor> = {}): A2ATaskBridgeExecutor {
  const noopResult = (): A2AExecutorResult => ({
    envoyState: "completed",
    summary: "ok",
    artifacts: [],
  });
  return {
    executeMessageSend: vi.fn(async (_input: A2AExecutorInput) => noopResult()),
    getTask: vi.fn(async (_id: string) => null),
    cancelTask: vi.fn(async (_id: string) => ({
      envoyState: "cancelled",
      summary: "cancelled by client",
      artifacts: [],
    })),
    ...overrides,
  };
}

const TOKENS = [
  { token: "tok-valid", ownerId: "envoy:owner:abc", label: "test" },
  { token: "tok-2", ownerId: "envoy:owner:def" },
];

function jsonRpc(method: string, params: Record<string, unknown>, id: string | number = "req-1") {
  return JSON.stringify({ jsonrpc: "2.0", id, method, params });
}

// ---------------------------------------------------------------------------
// JSON-RPC envelope parsing
// ---------------------------------------------------------------------------

describe("a2a-task-bridge: envelope parsing", () => {
  const bridge = createA2ATaskBridge({ bearerTokens: TOKENS, executor: makeExecutor() });

  it("rejects invalid JSON with -32700 (parse error)", async () => {
    const res = await bridge.handleRequest("not json", "Bearer tok-valid");
    expect(res.id).toBeNull();
    expect(res.error?.code).toBe(A2A_JSONRPC_ERROR_CODES.PARSE_ERROR);
  });

  it("rejects non-object body with -32600 (invalid request)", async () => {
    const res = await bridge.handleRequest(JSON.stringify("hello"), "Bearer tok-valid");
    expect(res.error?.code).toBe(A2A_JSONRPC_ERROR_CODES.INVALID_REQUEST);
  });

  it("rejects wrong jsonrpc version", async () => {
    const res = await bridge.handleRequest(
      JSON.stringify({ jsonrpc: "1.0", id: 1, method: "message/send", params: {} }),
      "Bearer tok-valid",
    );
    expect(res.error?.code).toBe(A2A_JSONRPC_ERROR_CODES.INVALID_REQUEST);
  });

  it("rejects missing method", async () => {
    const res = await bridge.handleRequest(
      JSON.stringify({ jsonrpc: "2.0", id: 1, params: {} }),
      "Bearer tok-valid",
    );
    expect(res.error?.code).toBe(A2A_JSONRPC_ERROR_CODES.INVALID_REQUEST);
  });

  it("rejects array params", async () => {
    const res = await bridge.handleRequest(
      JSON.stringify({ jsonrpc: "2.0", id: 1, method: "message/send", params: [] }),
      "Bearer tok-valid",
    );
    expect(res.error?.code).toBe(A2A_JSONRPC_ERROR_CODES.INVALID_REQUEST);
  });

  it("returns the same id when parse fails (id=null)", async () => {
    const res = await bridge.handleRequest("xxx", undefined);
    expect(res.id).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Bearer auth
// ---------------------------------------------------------------------------

describe("a2a-task-bridge: bearer auth", () => {
  const executor = makeExecutor();
  const bridge = createA2ATaskBridge({ bearerTokens: TOKENS, executor });

  it("returns -32001 (auth-required) when no Authorization header", async () => {
    const body = jsonRpc("tasks/get", { id: "x" });
    const res = await bridge.handleRequest(body, undefined);
    expect(res.error?.code).toBe(A2A_JSONRPC_ERROR_CODES.AUTH_REQUIRED);
  });

  it("returns -32001 when token is unknown", async () => {
    const body = jsonRpc("tasks/get", { id: "x" });
    const res = await bridge.handleRequest(body, "Bearer nope");
    expect(res.error?.code).toBe(A2A_JSONRPC_ERROR_CODES.AUTH_REQUIRED);
  });

  it("returns -32001 when scheme is not Bearer", async () => {
    const body = jsonRpc("tasks/get", { id: "x" });
    const res = await bridge.handleRequest(body, "Basic tok-valid");
    expect(res.error?.code).toBe(A2A_JSONRPC_ERROR_CODES.AUTH_REQUIRED);
  });

  it("accepts a valid token and forwards ownerId to executor", async () => {
    const body = jsonRpc("tasks/get", { id: "x" });
    await bridge.handleRequest(body, "Bearer tok-valid");
    expect(executor.getTask).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Method dispatch
// ---------------------------------------------------------------------------

describe("a2a-task-bridge: method dispatch", () => {
  it("returns -32601 (method not found) for unknown methods", async () => {
    const bridge = createA2ATaskBridge({ bearerTokens: TOKENS, executor: makeExecutor() });
    const body = jsonRpc("message/stream", { message: { parts: [{ kind: "text", text: "x" }] } });
    const res = await bridge.handleRequest(body, "Bearer tok-valid");
    expect(res.error?.code).toBe(A2A_JSONRPC_ERROR_CODES.METHOD_NOT_FOUND);
  });

  it("message/send happy path — invokes executor and returns a Task", async () => {
    const executor = makeExecutor({
      executeMessageSend: vi.fn(async () => ({
        envoyState: "completed",
        summary: "done",
        artifacts: [{ kind: "text", content: "the answer" }],
      })),
    });
    const bridge = createA2ATaskBridge({ bearerTokens: TOKENS, executor });
    const body = jsonRpc("message/send", {
      message: {
        role: "user",
        parts: [{ kind: "text", text: "what is the weather?" }],
        messageId: "msg-1",
      },
    });
    const res = await bridge.handleRequest(body, "Bearer tok-valid");
    expect(res.error).toBeUndefined();
    const result = res.result as Record<string, unknown>;
    expect(result.kind).toBe("task");
    expect((result.status as { state: string }).state).toBe("completed");
    expect((result.artifacts as Array<{ parts: Array<Record<string, unknown>> }>)[0]?.parts[0]).toMatchObject({
      kind: "text",
      text: "the answer",
    });
  });

  it("message/send returns -32602 when parts is missing", async () => {
    const bridge = createA2ATaskBridge({ bearerTokens: TOKENS, executor: makeExecutor() });
    const body = jsonRpc("message/send", { message: { role: "user" } });
    const res = await bridge.handleRequest(body, "Bearer tok-valid");
    expect(res.error?.code).toBe(A2A_JSONRPC_ERROR_CODES.INVALID_PARAMS);
  });

  it("message/send returns -32602 when parts is empty", async () => {
    const bridge = createA2ATaskBridge({ bearerTokens: TOKENS, executor: makeExecutor() });
    const body = jsonRpc("message/send", { message: { role: "user", parts: [] } });
    const res = await bridge.handleRequest(body, "Bearer tok-valid");
    expect(res.error?.code).toBe(A2A_JSONRPC_ERROR_CODES.INVALID_PARAMS);
  });

  it("tasks/get for terminal task returns full Task with mapped state + artifacts", async () => {
    const executor = makeExecutor({
      getTask: vi.fn(async () => ({
        envoyState: "completed",
        summary: "ok",
        artifacts: [{ kind: "structured", schemaRef: "x", data: { v: 1 } }],
      })),
    });
    const bridge = createA2ATaskBridge({ bearerTokens: TOKENS, executor });
    const body = jsonRpc("tasks/get", { id: "a2a_xyz" });
    const res = await bridge.handleRequest(body, "Bearer tok-valid");
    expect(res.error).toBeUndefined();
    const result = res.result as Record<string, unknown>;
    expect((result.status as { state: string }).state).toBe("completed");
    const artifacts = result.artifacts as Array<{ parts: Array<Record<string, unknown>> }>;
    expect(artifacts[0]?.parts[0]).toMatchObject({ kind: "data", data: { v: 1 } });
  });

  it("tasks/get returns -32002 (task-not-found) for unknown IDs", async () => {
    const bridge = createA2ATaskBridge({ bearerTokens: TOKENS, executor: makeExecutor() });
    const body = jsonRpc("tasks/get", { id: "missing" });
    const res = await bridge.handleRequest(body, "Bearer tok-valid");
    expect(res.error?.code).toBe(A2A_JSONRPC_ERROR_CODES.TASK_NOT_FOUND);
  });

  it("tasks/cancel returns Task with state=canceled", async () => {
    const executor = makeExecutor({
      cancelTask: vi.fn(async () => ({
        envoyState: "cancelled",
        summary: "cancelled",
        artifacts: [],
      })),
    });
    const bridge = createA2ATaskBridge({ bearerTokens: TOKENS, executor });
    const body = jsonRpc("tasks/cancel", { id: "a2a_xyz" });
    const res = await bridge.handleRequest(body, "Bearer tok-valid");
    expect(res.error).toBeUndefined();
    const result = res.result as Record<string, unknown>;
    expect((result.status as { state: string }).state).toBe("canceled");
  });

  it("executor throwing on message/send returns -32603", async () => {
    const executor = makeExecutor({
      executeMessageSend: vi.fn(async () => {
        throw new Error("executor boom");
      }),
    });
    const bridge = createA2ATaskBridge({ bearerTokens: TOKENS, executor });
    const body = jsonRpc("message/send", {
      message: { role: "user", parts: [{ kind: "text", text: "x" }] },
    });
    const res = await bridge.handleRequest(body, "Bearer tok-valid");
    expect(res.error?.code).toBe(A2A_JSONRPC_ERROR_CODES.INTERNAL_ERROR);
  });

  it("non-terminal envoyState maps to A2A 'working' in response", async () => {
    const executor = makeExecutor({
      executeMessageSend: vi.fn(async () => ({
        envoyState: "running",
        summary: "still going",
        artifacts: [],
      })),
    });
    const bridge = createA2ATaskBridge({ bearerTokens: TOKENS, executor });
    const body = jsonRpc("message/send", {
      message: { role: "user", parts: [{ kind: "text", text: "x" }] },
    });
    const res = await bridge.handleRequest(body, "Bearer tok-valid");
    const result = res.result as Record<string, unknown>;
    expect((result.status as { state: string }).state).toBe("working");
  });
});

// ---------------------------------------------------------------------------
// Audit emission
// ---------------------------------------------------------------------------

describe("a2a-task-bridge: audit emission", () => {
  it("emits task.handled on successful message/send", async () => {
    const auditEvents: AuditEvent[] = [];
    const bridge = createA2ATaskBridge({
      bearerTokens: TOKENS,
      executor: makeExecutor(),
      audit: (e) => { auditEvents.push(e); },
    });
    const body = jsonRpc("message/send", {
      message: { role: "user", parts: [{ kind: "text", text: "x" }] },
    });
    await bridge.handleRequest(body, "Bearer tok-valid");
    expect(auditEvents.length).toBe(1);
    expect(auditEvents[0]?.type).toBe("task.handled");
    expect(auditEvents[0]?.protocol).toBe("a2a-v1.0");
    expect(auditEvents[0]?.remotePeerId).toBe("envoy:owner:abc");
  });

  it("emits task.rejected on executor failure", async () => {
    const auditEvents: AuditEvent[] = [];
    const bridge = createA2ATaskBridge({
      bearerTokens: TOKENS,
      executor: makeExecutor({
        executeMessageSend: vi.fn(async () => {
          throw new Error("kaboom");
        }),
      }),
      audit: (e) => { auditEvents.push(e); },
    });
    const body = jsonRpc("message/send", {
      message: { role: "user", parts: [{ kind: "text", text: "x" }] },
    });
    await bridge.handleRequest(body, "Bearer tok-valid");
    expect(auditEvents[0]?.type).toBe("task.rejected");
    expect(auditEvents[0]?.outcome).toBe("deny");
  });

  it("emits message.rejected on auth failure", async () => {
    const auditEvents: AuditEvent[] = [];
    const bridge = createA2ATaskBridge({
      bearerTokens: TOKENS,
      executor: makeExecutor(),
      audit: (e) => { auditEvents.push(e); },
    });
    const body = jsonRpc("tasks/get", { id: "x" });
    await bridge.handleRequest(body, undefined);
    expect(auditEvents[0]?.type).toBe("message.rejected");
    expect(auditEvents[0]?.outcome).toBe("deny");
    expect(auditEvents[0]?.summary).toMatch(/bearer/i);
  });

  it("emits task.handled on successful tasks/cancel", async () => {
    const auditEvents: AuditEvent[] = [];
    const bridge = createA2ATaskBridge({
      bearerTokens: TOKENS,
      executor: makeExecutor(),
      audit: (e) => { auditEvents.push(e); },
    });
    const body = jsonRpc("tasks/cancel", { id: "a2a_xyz" });
    await bridge.handleRequest(body, "Bearer tok-valid");
    expect(auditEvents[0]?.type).toBe("task.handled");
    expect(auditEvents[0]?.intent).toBe("task.cancel");
  });
});

// ---------------------------------------------------------------------------
// HTTP adapter
// ---------------------------------------------------------------------------

describe("a2a-task-bridge: handleA2AHttpRequest", () => {
  it("rejects non-POST with 405", async () => {
    const bridge = createA2ATaskBridge({ bearerTokens: TOKENS, executor: makeExecutor() });
    const res = await handleA2AHttpRequest(bridge, { method: "GET", body: "", headers: {} });
    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe("POST");
  });

  it("accepts POST and returns 200 with JSON-RPC envelope", async () => {
    const bridge = createA2ATaskBridge({ bearerTokens: TOKENS, executor: makeExecutor() });
    const res = await handleA2AHttpRequest(bridge, {
      method: "POST",
      body: jsonRpc("tasks/get", { id: "x" }),
      headers: { authorization: "Bearer tok-valid" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(res.body).jsonrpc).toBe("2.0");
  });
});

// ---------------------------------------------------------------------------
// Security: owner-scoping (M1) + sanitized errors (M2) + Parts validation (M3)
// ---------------------------------------------------------------------------

describe("a2a-task-bridge: owner-scoping (security)", () => {
  it("tasks/get passes ownerId to executor", async () => {
    const executor = makeExecutor();
    const bridge = createA2ATaskBridge({ bearerTokens: TOKENS, executor });
    await bridge.handleRequest(jsonRpc("tasks/get", { id: "x" }), "Bearer tok-valid");
    expect(executor.getTask).toHaveBeenCalledWith({ ownerId: "envoy:owner:abc", a2aTaskId: "x" });
  });

  it("tasks/cancel passes ownerId to executor", async () => {
    const executor = makeExecutor();
    const bridge = createA2ATaskBridge({ bearerTokens: TOKENS, executor });
    await bridge.handleRequest(jsonRpc("tasks/cancel", { id: "x" }), "Bearer tok-valid");
    expect(executor.cancelTask).toHaveBeenCalledWith({ ownerId: "envoy:owner:abc", a2aTaskId: "x" });
  });

  it("executor returning null for cross-owner task → 404", async () => {
    const executor = makeExecutor({
      // Executor enforces ownership: returns null because the task belongs
      // to a different owner.
      getTask: vi.fn(async () => null),
    });
    const bridge = createA2ATaskBridge({ bearerTokens: TOKENS, executor });
    const res = await bridge.handleRequest(jsonRpc("tasks/get", { id: "x" }), "Bearer tok-valid");
    expect(res.error?.code).toBe(A2A_JSONRPC_ERROR_CODES.TASK_NOT_FOUND);
  });
});

describe("a2a-task-bridge: sanitized error messages (M2)", () => {
  it("does NOT leak executor exception text to caller", async () => {
    const executor = makeExecutor({
      executeMessageSend: vi.fn(async () => {
        throw new Error("internal path /secret/foo leaked to caller");
      }),
    });
    const bridge = createA2ATaskBridge({ bearerTokens: TOKENS, executor });
    const body = jsonRpc("message/send", {
      message: { role: "user", parts: [{ kind: "text", text: "x" }] },
    });
    const res = await bridge.handleRequest(body, "Bearer tok-valid");
    expect(res.error?.code).toBe(A2A_JSONRPC_ERROR_CODES.INTERNAL_ERROR);
    expect(res.error?.message).toBe("Internal error");
    expect(res.error?.message).not.toContain("/secret/foo");
    expect(JSON.stringify(res)).not.toContain("/secret/foo");
  });

  it("does NOT leak file system paths in tasks/get errors", async () => {
    const executor = makeExecutor({
      getTask: vi.fn(async () => { throw new Error("ENOENT /home/owner/.envoymesh/secret"); }),
    });
    const bridge = createA2ATaskBridge({ bearerTokens: TOKENS, executor });
    const res = await bridge.handleRequest(jsonRpc("tasks/get", { id: "x" }), "Bearer tok-valid");
    expect(res.error?.message).not.toContain("/home/owner");
    expect(res.error?.message).not.toContain(".envoymesh");
  });
});

describe("a2a-task-bridge: inbound Parts validation (M3)", () => {
  it("drops malformed parts and rejects empty result", async () => {
    const executor = makeExecutor();
    const bridge = createA2ATaskBridge({ bearerTokens: TOKENS, executor });
    const body = jsonRpc("message/send", {
      message: {
        role: "user",
        parts: [
          { kind: "text" /* missing text field */ },
          null,
          { kind: "image" /* missing data + mimeType */ },
        ],
      },
    });
    const res = await bridge.handleRequest(body, "Bearer tok-valid");
    expect(res.error?.code).toBe(A2A_JSONRPC_ERROR_CODES.INVALID_PARAMS);
    expect(executor.executeMessageSend).not.toHaveBeenCalled();
  });

  it("rejects text part exceeding TEXT_MAX_CHARS", async () => {
    const executor = makeExecutor();
    const bridge = createA2ATaskBridge({ bearerTokens: TOKENS, executor });
    const body = jsonRpc("message/send", {
      message: {
        role: "user",
        parts: [{ kind: "text", text: "x".repeat(70_000) }],
      },
    });
    const res = await bridge.handleRequest(body, "Bearer tok-valid");
    expect(res.error?.code).toBe(A2A_JSONRPC_ERROR_CODES.INVALID_PARAMS);
  });

  it("rejects file part with both uri AND bytes", async () => {
    const executor = makeExecutor();
    const bridge = createA2ATaskBridge({ bearerTokens: TOKENS, executor });
    const body = jsonRpc("message/send", {
      message: {
        role: "user",
        parts: [{ kind: "file", file: { uri: "https://x.com/a", bytes: "abc" } }],
      },
    });
    const res = await bridge.handleRequest(body, "Bearer tok-valid");
    expect(res.error?.code).toBe(A2A_JSONRPC_ERROR_CODES.INVALID_PARAMS);
  });

  it("rejects file part with neither uri nor bytes", async () => {
    const executor = makeExecutor();
    const bridge = createA2ATaskBridge({ bearerTokens: TOKENS, executor });
    const body = jsonRpc("message/send", {
      message: {
        role: "user",
        parts: [{ kind: "file", file: { mimeType: "application/pdf" } }],
      },
    });
    const res = await bridge.handleRequest(body, "Bearer tok-valid");
    expect(res.error?.code).toBe(A2A_JSONRPC_ERROR_CODES.INVALID_PARAMS);
  });

  it("accepts a valid mixed parts list", async () => {
    const executor = makeExecutor();
    const bridge = createA2ATaskBridge({ bearerTokens: TOKENS, executor });
    const body = jsonRpc("message/send", {
      message: {
        role: "user",
        parts: [
          { kind: "text", text: "hi" },
          { kind: "data", data: { x: 1 } },
          { kind: "file", file: { uri: "https://x.com/a.pdf", name: "a.pdf" } },
        ],
      },
    });
    const res = await bridge.handleRequest(body, "Bearer tok-valid");
    expect(res.error).toBeUndefined();
    expect(executor.executeMessageSend).toHaveBeenCalledTimes(1);
    const call = (executor.executeMessageSend as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(call.message.parts.length).toBe(3);
  });
});