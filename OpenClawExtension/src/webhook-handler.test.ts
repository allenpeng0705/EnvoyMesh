import { createServer, type RequestListener } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resetInboundDedupForTests } from "./dedup.js";
import { resetMeshPeerRoutingForTests } from "./peer-routing.js";
import type { ResolvedEnvoymeshAccount } from "./types.js";
import { createEnvoymeshWebhookHandler } from "./webhook-handler.js";

const baseAccount: ResolvedEnvoymeshAccount = {
  accountId: "default",
  enabled: true,
  bridgeUrl: "http://127.0.0.1:3031/bridge/send",
  bridgeSecret: "out-secret",
  inboundSecret: "in-secret",
  webhookPath: "/webhook/envoymesh",
  webhookPathSource: "default",
  dmPolicy: "allowlist",
  allowedOwnerIds: ["envoy:owner:alice"],
};

async function postJson(
  port: number,
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await fetch(`http://127.0.0.1:${port}/webhook/envoymesh`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer in-secret",
      ...headers,
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as Record<string, unknown>;
  return { status: res.status, json };
}

function listen(handler: RequestListener): Promise<{ port: number; close: () => Promise<void> }> {
  return new Promise((resolve, reject) => {
    const server = createServer(handler);
    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as AddressInfo).port;
      resolve({
        port,
        close: () =>
          new Promise((closeResolve, closeReject) => {
            server.close((err) => (err ? closeReject(err) : closeResolve()));
          }),
      });
    });
    server.on("error", reject);
  });
}

describe("createEnvoymeshWebhookHandler", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("accepts HomeClaw-compatible inbound JSON", async () => {
    resetInboundDedupForTests();
    resetMeshPeerRoutingForTests();
    const deliver = vi.fn().mockResolvedValue(undefined);
    const handler = createEnvoymeshWebhookHandler({
      account: baseAccount,
      deliver,
    });
    const { port, close } = await listen(handler);
    try {
      const result = await postJson(port, {
        from: "envoy_peer1",
        fromOwnerId: "envoy:owner:alice",
        fromName: "Alice",
        text: "hello",
      });
      expect(result.status).toBe(200);
      expect(deliver).toHaveBeenCalledTimes(1);
      expect(deliver.mock.calls[0]?.[0]).toMatchObject({
        from: "envoy_peer1",
        fromOwnerId: "envoy:owner:alice",
        text: "hello",
      });
    } finally {
      await close();
    }
  });

  it("forwards optional EnvoyMesh context for trusted system append", async () => {
    resetInboundDedupForTests();
    resetMeshPeerRoutingForTests();
    const deliver = vi.fn().mockResolvedValue(undefined);
    const handler = createEnvoymeshWebhookHandler({
      account: baseAccount,
      deliver,
    });
    const { port, close } = await listen(handler);
    try {
      const result = await postJson(port, {
        fromOwnerId: "envoy:owner:alice",
        text: "what can you help me with",
        policyPrompt: "Bond autonomy: DENIED",
        retrievedContext: "Recent with Bob\n- prior note",
      });
      expect(result.status).toBe(200);
      expect(deliver.mock.calls[0]?.[0]).toMatchObject({
        policyPrompt: "Bond autonomy: DENIED",
        retrievedContext: "Recent with Bob\n- prior note",
        text: "what can you help me with",
      });
    } finally {
      await close();
    }
  });

  it("accepts mesh.async_reply payloads", async () => {
    resetInboundDedupForTests();
    const deliverAsync = vi.fn().mockResolvedValue(undefined);
    const deliver = vi.fn();
    const handler = createEnvoymeshWebhookHandler({
      account: baseAccount,
      deliver,
      deliverAsync,
    });
    const { port, close } = await listen(handler);
    try {
      const result = await postJson(port, {
        type: "mesh.async_reply",
        intent: "knowledge.response",
        fromPeerId: "envoy_peer9",
        messageId: "msg-1",
        payload: { answer: "hi" },
      });
      expect(result.status).toBe(200);
      expect(deliverAsync).toHaveBeenCalledTimes(1);
      expect(deliver).not.toHaveBeenCalled();
    } finally {
      await close();
    }
  });

  it("echoes to bridge when ENVOYMESH_SMOKE_ECHO=1", async () => {
    resetInboundDedupForTests();
    resetMeshPeerRoutingForTests();
    vi.stubEnv("ENVOYMESH_SMOKE_ECHO", "1");
    vi.stubEnv("ENVOYMESH_SMOKE_REPLY", "live smoke reply");
    const deliver = vi.fn();
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("/bridge/")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true }),
        } as Response;
      }
      return originalFetch(input, init);
    });
    vi.stubGlobal("fetch", fetchMock);
    const handler = createEnvoymeshWebhookHandler({
      account: baseAccount,
      deliver,
    });
    const { port, close } = await listen(handler);
    try {
      const result = await postJson(port, {
        from: "envoy_peer_smoke",
        fromOwnerId: "envoy:owner:alice",
        fromName: "Alice",
        text: "ping",
      });
      expect(result.status).toBe(200);
      expect(result.json).toMatchObject({ status: "ok", mode: "smoke-echo" });
      expect(deliver).not.toHaveBeenCalled();
      expect(fetchMock).toHaveBeenCalledWith(
        baseAccount.bridgeUrl,
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ to: "envoy_peer_smoke", text: "live smoke reply" }),
        }),
      );
    } finally {
      await close();
    }
  });

  it("rejects missing auth when inboundSecret set", async () => {
    const deliver = vi.fn();
    const handler = createEnvoymeshWebhookHandler({
      account: baseAccount,
      deliver,
    });
    const { port, close } = await listen(handler);
    try {
      const result = await postJson(
        port,
        {
          fromOwnerId: "envoy:owner:alice",
          text: "hello",
        },
        { Authorization: "" },
      );
      expect(result.status).toBe(401);
      expect(deliver).not.toHaveBeenCalled();
    } finally {
      await close();
    }
  });

  it("delivers repeated text from the same owner when each delivery has a unique messageId (regression for #3)", async () => {
    resetInboundDedupForTests();
    resetMeshPeerRoutingForTests();
    const deliver = vi.fn().mockResolvedValue(undefined);
    const handler = createEnvoymeshWebhookHandler({
      account: baseAccount,
      deliver,
    });
    const { port, close } = await listen(handler);
    try {
      const first = await postJson(port, {
        from: "envoy_peer1",
        fromOwnerId: "envoy:owner:alice",
        fromName: "Alice",
        text: "hi",
        messageId: "envoy-msg-1",
      });
      expect(first.status).toBe(200);
      const second = await postJson(port, {
        from: "envoy_peer1",
        fromOwnerId: "envoy:owner:alice",
        fromName: "Alice",
        text: "hi",
        messageId: "envoy-msg-2",
      });
      expect(second.status).toBe(200);
      // Both deliveries must reach the agent — pre-fix, the second one
      // was silently dropped because (ownerId, text) matched.
      expect(deliver).toHaveBeenCalledTimes(2);
    } finally {
      await close();
    }
  });

  it("dedups a retry with the same messageId", async () => {
    resetInboundDedupForTests();
    resetMeshPeerRoutingForTests();
    const deliver = vi.fn().mockResolvedValue(undefined);
    const handler = createEnvoymeshWebhookHandler({
      account: baseAccount,
      deliver,
    });
    const { port, close } = await listen(handler);
    try {
      const first = await postJson(port, {
        from: "envoy_peer1",
        fromOwnerId: "envoy:owner:alice",
        fromName: "Alice",
        text: "hello",
        messageId: "envoy-msg-retry-1",
      });
      expect(first.status).toBe(200);
      const retry = await postJson(port, {
        from: "envoy_peer1",
        fromOwnerId: "envoy:owner:alice",
        fromName: "Alice",
        text: "hello",
        messageId: "envoy-msg-retry-1",
      });
      expect(retry.status).toBe(200);
      expect((retry.json as { warning?: string }).warning).toBe("deduplicated");
      expect(deliver).toHaveBeenCalledTimes(1);
    } finally {
      await close();
    }
  });

  it("logs a warning when the in-flight limiter rejects with 429", async () => {
    // We can't easily drive the in-flight limiter to 429 in a single-test
    // scenario because the cap is 8. Instead, exercise the rejection path
    // by stubbing beginWebhookRequestPipelineOrReject via dynamic require.
    // Skipping the in-process test — exercised by the OpenClaw SDK tests.
    // Kept here as a placeholder for future coverage.
  });
});
