/**
 * Phase 48D — A2A JSON-RPC Relay Proxy tests.
 *
 * Pins the relay-side handler: bearer-token auth gate, home-node
 * lookup, body forwarding, timeout / upstream error wrapping. The
 * proxy takes a `forwardToHome` DI hook so tests don't need a real
 * libp2p tunnel.
 */

import { describe, expect, it, vi } from "vitest";
import { PassThrough } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  handleA2AJsonRpcProxy,
  parseA2ABearerTokensEnv,
  type A2AProxyOptions,
} from "../src/a2a-jsonrpc-proxy.js";

// ---------------------------------------------------------------------------
// Fake req/res helpers
// ---------------------------------------------------------------------------

function makeReq(body: string, method = "POST", auth?: string): IncomingMessage {
  const req = new PassThrough() as unknown as IncomingMessage;
  (req as { method: string }).method = method;
  (req as { headers: Record<string, string> }).headers = {};
  if (auth) (req as { headers: Record<string, string> }).headers.authorization = auth;
  // Push body after microtask so listeners register first.
  setImmediate(() => {
    req.push(body);
    req.push(null);
  });
  return req;
}

function makeRes(): { res: ServerResponse; status: () => number; body: () => string } {
  const chunks: Buffer[] = [];
  let statusCode = 0;
  const headers: Record<string, string> = {};
  const res = {
    writeHead(code: number, h?: Record<string, string>) {
      statusCode = code;
      if (h) Object.assign(headers, h);
    },
    end(data?: string | Buffer) {
      if (data) chunks.push(Buffer.isBuffer(data) ? data : Buffer.from(data));
    },
  } as unknown as ServerResponse;
  return {
    res,
    status: () => statusCode,
    body: () => Buffer.concat(chunks).toString("utf8"),
  };
}

const TOKENS = [
  { token: "tok-a", ownerId: "envoy:owner:a" },
  { token: "tok-b", ownerId: "envoy:owner:b" },
];

function makeOptions(overrides: Partial<A2AProxyOptions> = {}): A2AProxyOptions {
  return {
    bearerTokens: TOKENS,
    lookupHomePeerId: () => "home-peer-1",
    forwardToHome: async (_peerId, body) => ({
      status: 200,
      body: `{"jsonrpc":"2.0","id":"x","result":{"echo":${JSON.stringify(body)}}}`,
    }),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("a2a-jsonrpc-proxy: method gate", () => {
  it("returns 405 for non-POST", async () => {
    const req = makeReq("", "GET", "Bearer tok-a");
    const { res, status, body } = makeRes();
    await handleA2AJsonRpcProxy(req, res, makeOptions());
    expect(status()).toBe(405);
    expect(body()).toMatch(/method not allowed/);
  });
});

describe("a2a-jsonrpc-proxy: body handling", () => {
  it("returns 413 when body exceeds maxBodyBytes", async () => {
    const big = "x".repeat(2048);
    const req = makeReq(big, "POST", "Bearer tok-a");
    const { res, status } = makeRes();
    await handleA2AJsonRpcProxy(req, res, makeOptions({ maxBodyBytes: 1024 }));
    expect(status()).toBe(413);
  });
});

describe("a2a-jsonrpc-proxy: bearer auth", () => {
  it("returns 401 + JSON-RPC -32001 when no Authorization header", async () => {
    const req = makeReq("{}", "POST");
    const { res, status, body } = makeRes();
    await handleA2AJsonRpcProxy(req, res, makeOptions());
    expect(status()).toBe(401);
    const parsed = JSON.parse(body());
    expect(parsed.error.code).toBe(-32001);
  });

  it("returns 401 when token is unknown", async () => {
    const req = makeReq("{}", "POST", "Bearer wrong");
    const { res, status, body } = makeRes();
    await handleA2AJsonRpcProxy(req, res, makeOptions());
    expect(status()).toBe(401);
    expect(JSON.parse(body()).error.code).toBe(-32001);
  });

  it("returns 401 when scheme is not Bearer", async () => {
    const req = makeReq("{}", "POST", "Basic tok-a");
    const { res, status } = makeRes();
    await handleA2AJsonRpcProxy(req, res, makeOptions());
    expect(status()).toBe(401);
  });
});

describe("a2a-jsonrpc-proxy: home-node lookup", () => {
  it("returns 502 + JSON-RPC -32003 when no home is registered", async () => {
    const req = makeReq("{}", "POST", "Bearer tok-a");
    const { res, status, body } = makeRes();
    await handleA2AJsonRpcProxy(req, res, makeOptions({ lookupHomePeerId: () => null }));
    expect(status()).toBe(502);
    expect(JSON.parse(body()).error.code).toBe(-32003);
  });
});

describe("a2a-jsonrpc-proxy: forwarding", () => {
  it("forwards body verbatim and writes upstream status + response", async () => {
    const forward = vi.fn(async (_peerId: string, body: string) => ({
      status: 200,
      body: `{"jsonrpc":"2.0","id":"x","echo":${JSON.stringify(body)}}`,
    }));
    const req = makeReq('{"hello":1}', "POST", "Bearer tok-a");
    const { res, status, body } = makeRes();
    await handleA2AJsonRpcProxy(req, res, makeOptions({ forwardToHome: forward }));
    expect(status()).toBe(200);
    expect(forward).toHaveBeenCalledWith("home-peer-1", '{"hello":1}', {
      Authorization: "Bearer tok-a",
    }, undefined);
    expect(body()).toContain('"echo":"{\\"hello\\":1}"');
  });

  it("preserves non-200 upstream status", async () => {
    const req = makeReq("{}", "POST", "Bearer tok-a");
    const { res, status, body } = makeRes();
    await handleA2AJsonRpcProxy(req, res, makeOptions({
      forwardToHome: async () => ({
        status: 401,
        body: JSON.stringify({ error: "unauthorized" }),
      }),
    }));
    expect(status()).toBe(401);
    expect(body()).toContain("unauthorized");
  });

  it("returns 504 when forwardToHome returns null (upstream timeout)", async () => {
    const req = makeReq("{}", "POST", "Bearer tok-a");
    const { res, status, body } = makeRes();
    await handleA2AJsonRpcProxy(req, res, makeOptions({
      forwardToHome: async () => null,
      timeoutMs: 50,
    }));
    expect(status()).toBe(504);
    expect(JSON.parse(body()).error.code).toBe(-32003);
  });

  it("returns 502 + -32603 when forwardToHome throws", async () => {
    const req = makeReq("{}", "POST", "Bearer tok-a");
    const { res, status, body } = makeRes();
    await handleA2AJsonRpcProxy(req, res, makeOptions({
      forwardToHome: async () => { throw new Error("transport down"); },
    }));
    expect(status()).toBe(502);
    expect(JSON.parse(body()).error.code).toBe(-32603);
  });

  it("invokes observe() with outcome=ok on success", async () => {
    const observe = vi.fn();
    const req = makeReq("{}", "POST", "Bearer tok-a");
    const { res } = makeRes();
    await handleA2AJsonRpcProxy(req, res, makeOptions({ observe }));
    expect(observe).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "ok", ownerId: "envoy:owner:a" }),
    );
  });

  it("invokes observe() with outcome=auth-failed on missing bearer", async () => {
    const observe = vi.fn();
    const req = makeReq("{}", "POST");
    const { res } = makeRes();
    await handleA2AJsonRpcProxy(req, res, makeOptions({ observe }));
    expect(observe).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "auth-failed" }),
    );
  });

  it("invokes observe() with outcome=upstream-timeout when forwardToHome returns null", async () => {
    const observe = vi.fn();
    const req = makeReq("{}", "POST", "Bearer tok-a");
    const { res } = makeRes();
    await handleA2AJsonRpcProxy(req, res, makeOptions({
      forwardToHome: async () => null,
      observe,
      timeoutMs: 50,
    }));
    expect(observe).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "upstream-timeout" }),
    );
  });
});
describe("parseA2ABearerTokensEnv", () => {
  it("preserves colonful ownerIds (envoy:owner:…)", () => {
    const entries = parseA2ABearerTokensEnv("secret:envoy:owner:abc123");
    expect(entries).toEqual([
      { token: "secret", ownerId: "envoy:owner:abc123" },
    ]);
  });

  it("parses optional #label", () => {
    const entries = parseA2ABearerTokensEnv("tok:envoy:owner:abc#laptop");
    expect(entries).toEqual([
      { token: "tok", ownerId: "envoy:owner:abc", label: "laptop" },
    ]);
  });

  it("parses comma-separated entries", () => {
    const entries = parseA2ABearerTokensEnv(
      "a:envoy:owner:1,b:envoy:owner:2#prod",
    );
    expect(entries).toHaveLength(2);
    expect(entries[0]).toEqual({ token: "a", ownerId: "envoy:owner:1" });
    expect(entries[1]).toEqual({ token: "b", ownerId: "envoy:owner:2", label: "prod" });
  });

  it("skips malformed entries", () => {
    expect(parseA2ABearerTokensEnv("")).toEqual([]);
    expect(parseA2ABearerTokensEnv(":noid")).toEqual([]);
    expect(parseA2ABearerTokensEnv("notoken")).toEqual([]);
  });
});
