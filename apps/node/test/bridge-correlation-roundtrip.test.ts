/**
 * Integration test: correlationId round-trip through the bridge.
 *
 * Verifies that when the bridge receives a POST /bridge/send with a
 * correlationId, it calls resolveOpenClawReply with the correct args,
 * which resolves the pending ask() promise.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import * as http from "node:http";

describe("Bridge correlationId round-trip", () => {
  let server: http.Server;
  let port: number;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("POST /bridge/send with correlationId calls resolveOpenClawReply", async () => {
    let receivedCorrelationId: string | null = null;
    let receivedText: string | null = null;

    const resolveOpenClawReply = (cid: string, text: string) => {
      receivedCorrelationId = cid;
      receivedText = text;
    };

    // Minimal bridge server
    server = http.createServer((req, res) => {
      let raw = "";
      req.on("data", (chunk: Buffer) => { raw += chunk.toString(); });
      req.on("end", () => {
        try {
          const body = JSON.parse(raw);
          const { to, text, correlationId } = body;

          if (typeof correlationId === "string") {
            resolveOpenClawReply(correlationId, text);
          }

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
        } catch {
          res.writeHead(400);
          res.end(JSON.stringify({ error: "bad json" }));
        }
      });
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const addr = server.address() as { port: number };
    port = addr.port;

    // Simulate OpenClaw gateway posting a reply with correlationId
    const response = await fetch(`http://127.0.0.1:${port}/bridge/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: "envoy_abc123",
        text: "Here are the latest AI news...",
        correlationId: "oc-ask-789",
      }),
    });

    expect(response.ok).toBe(true);
    expect(receivedCorrelationId).toBe("oc-ask-789");
    expect(receivedText).toBe("Here are the latest AI news...");

    server.close();
  });

  it("POST /bridge/send without correlationId works fine (backward compat)", async () => {
    let resolveCalled = false;

    const resolveOpenClawReply = () => {
      resolveCalled = true;
    };

    server = http.createServer((req, res) => {
      let raw = "";
      req.on("data", (chunk: Buffer) => { raw += chunk.toString(); });
      req.on("end", () => {
        const body = JSON.parse(raw);
        const { correlationId } = body;
        if (typeof correlationId === "string") resolveOpenClawReply();

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      });
    });

    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const addr = server.address() as { port: number };
    port = addr.port;

    // Post without correlationId (legacy path)
    const response = await fetch(`http://127.0.0.1:${port}/bridge/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: "envoy_xyz", text: "hello" }),
    });

    expect(response.ok).toBe(true);
    expect(resolveCalled).toBe(false);

    server.close();
  });

  it("resolves pending ask() promise when bridge delivers", async () => {
    vi.useFakeTimers();

    // Pending reply map
    const pending = new Map<string, { resolve: (text: string) => void; timer: ReturnType<typeof setTimeout> }>();

    // Create server that resolves pending replies
    server = http.createServer((req, res) => {
      let raw = "";
      req.on("data", (chunk: Buffer) => { raw += chunk.toString(); });
      req.on("end", () => {
        const body = JSON.parse(raw);
        const { correlationId, text } = body;

        if (typeof correlationId === "string") {
          const entry = pending.get(correlationId);
          if (entry) {
            clearTimeout(entry.timer);
            pending.delete(correlationId);
            entry.resolve(text);
          }
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      });
    });

    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const addr = server.address() as { port: number };
    port = addr.port;

    // Start a pending ask()
    const askPromise = new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete("oc-e2e-1");
        reject(new Error("Timeout"));
      }, 120_000);
      pending.set("oc-e2e-1", { resolve, timer });
    });

    // Deliver the reply via the bridge
    await fetch(`http://127.0.0.1:${port}/bridge/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: "envoy_abc",
        text: "Full e2e response",
        correlationId: "oc-e2e-1",
      }),
    });

    // ask() should resolve with the response
    const result = await askPromise;
    expect(result).toBe("Full e2e response");
    expect(pending.size).toBe(0);

    vi.useRealTimers();
    server.close();
  });
});
