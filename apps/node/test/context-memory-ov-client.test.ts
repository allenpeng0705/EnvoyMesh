import { describe, expect, it, vi } from "vitest";
import {
  collectOvMemoryHits,
  createOvClient,
  extractOvContextText,
  extractOvSessionId,
} from "../src/context-memory-ov-client.js";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("context-memory-ov-client", () => {
  it("extractOvSessionId reads nested result.session_id", () => {
    expect(extractOvSessionId({ result: { session_id: "s1" } })).toBe("s1");
    expect(extractOvSessionId({ sessionId: "s2" })).toBe("s2");
  });

  it("extractOvContextText prefers context then memory bullets", () => {
    expect(extractOvContextText({ result: { context: "hello ctx" } })).toBe("hello ctx");
    expect(
      extractOvContextText({
        result: {
          memories: [
            { uri: "viking://m1", abstract: "Prefers dark mode", score: 0.9 },
            { uri: "viking://m2", abstract: "Timezone UTC", score: 0.5 },
          ],
        },
      }),
    ).toContain("Prefers dark mode");
  });

  it("collectOvMemoryHits maps uri to id", () => {
    const hits = collectOvMemoryHits({
      result: { memories: [{ uri: "viking://a", abstract: "Fact A", category: "pref" }] },
    });
    expect(hits[0]?.id).toBe("viking://a");
    expect(hits[0]?.text).toBe("Fact A");
    expect(hits[0]?.tags).toContain("pref");
  });

  it("reuses session across rememberTurn calls", async () => {
    let sessionCreates = 0;
    const fetchImpl = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith("/api/v1/sessions") && init?.method === "POST") {
        sessionCreates++;
        return jsonResponse(200, { result: { session_id: "sess-1" } });
      }
      if (u.includes("/messages")) return jsonResponse(200, { result: { ok: true } });
      if (u.includes("/commit")) return jsonResponse(200, { result: { status: "ok" } });
      return jsonResponse(404, {});
    });

    const client = createOvClient({
      endpoint: "http://ov.test",
      sessionIdleMs: 60_000,
      fetchImpl: fetchImpl as typeof fetch,
    });

    await client.rememberTurn({ userText: "hi", assistantText: "hello" });
    await client.rememberTurn({ userText: "again" });
    expect(sessionCreates).toBe(1);
    expect(client.getSessionId()).toBe("sess-1");
  });

  it("recreates session after idle expiry", async () => {
    let sessionCreates = 0;
    const fetchImpl = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith("/api/v1/sessions") && init?.method === "POST") {
        sessionCreates++;
        return jsonResponse(200, { result: { session_id: `sess-${sessionCreates}` } });
      }
      if (u.includes("/messages") || u.includes("/commit")) {
        return jsonResponse(200, { result: {} });
      }
      return jsonResponse(404, {});
    });

    const client = createOvClient({
      endpoint: "http://ov.test",
      sessionIdleMs: 1,
      fetchImpl: fetchImpl as typeof fetch,
    });
    await client.rememberTurn({ userText: "one" });
    await new Promise((r) => setTimeout(r, 5));
    await client.rememberTurn({ userText: "two" });
    expect(sessionCreates).toBe(2);
  });

  it("searchContext attaches session_id when warm", async () => {
    const bodies: unknown[] = [];
    const fetchImpl = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith("/api/v1/sessions") && init?.method === "POST") {
        return jsonResponse(200, { result: { session_id: "warm" } });
      }
      if (u.includes("/messages") || u.includes("/commit")) {
        return jsonResponse(200, {});
      }
      if (u.includes("/search/search")) {
        bodies.push(JSON.parse(String(init?.body ?? "{}")));
        return jsonResponse(200, { result: { context: "from ov" } });
      }
      return jsonResponse(404, {});
    });
    const client = createOvClient({
      endpoint: "http://ov.test",
      fetchImpl: fetchImpl as typeof fetch,
    });
    await client.rememberTurn({ userText: "seed" });
    const text = await client.searchContext("theme");
    expect(text).toContain("from ov");
    expect(bodies[0]).toMatchObject({ session_id: "warm", mode: "context" });
  });

  it("listMemories and forgetMemory call find + fs delete", async () => {
    const fetchImpl = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.includes("/search/find")) {
        return jsonResponse(200, {
          result: { memories: [{ uri: "viking://m", abstract: "Listed fact" }] },
        });
      }
      if (u.includes("/api/v1/fs") && init?.method === "DELETE") {
        return jsonResponse(200, { result: { uri: "viking://m" } });
      }
      return jsonResponse(404, {});
    });
    const client = createOvClient({
      endpoint: "http://ov.test",
      fetchImpl: fetchImpl as typeof fetch,
    });
    const list = await client.listMemories();
    expect(list[0]?.text).toBe("Listed fact");
    expect(await client.forgetMemory("viking://m")).toBe(true);
    expect(await client.pinMemory("viking://m", true)).toBe(false);
  });

  it("retries rememberTurn once when session returns 404", async () => {
    let sessionCreates = 0;
    let messageCalls = 0;
    const fetchImpl = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith("/api/v1/sessions") && init?.method === "POST") {
        sessionCreates++;
        return jsonResponse(200, { result: { session_id: `s${sessionCreates}` } });
      }
      if (u.includes("/messages")) {
        messageCalls++;
        if (messageCalls === 1) return jsonResponse(404, { error: "missing" });
        return jsonResponse(200, {});
      }
      if (u.includes("/commit")) return jsonResponse(200, {});
      return jsonResponse(404, {});
    });
    const client = createOvClient({
      endpoint: "http://ov.test",
      fetchImpl: fetchImpl as typeof fetch,
    });
    await client.rememberTurn({ userText: "retry me" });
    expect(sessionCreates).toBe(2);
    expect(client.getSessionId()).toBe("s2");
  });

  it("does not retry rememberTurn on non-404 errors", async () => {
    let sessionCreates = 0;
    const fetchImpl = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith("/api/v1/sessions") && init?.method === "POST") {
        sessionCreates++;
        return jsonResponse(200, { result: { session_id: "s1" } });
      }
      if (u.includes("/messages")) return jsonResponse(500, { error: "session overloaded" });
      return jsonResponse(404, {});
    });
    const client = createOvClient({
      endpoint: "http://ov.test",
      fetchImpl: fetchImpl as typeof fetch,
    });
    await expect(client.rememberTurn({ userText: "boom" })).rejects.toThrow(/HTTP 500/);
    expect(sessionCreates).toBe(1);
  });

  it("dedupes concurrent session creates", async () => {
    let sessionCreates = 0;
    const fetchImpl = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith("/api/v1/sessions") && init?.method === "POST") {
        sessionCreates++;
        await new Promise((r) => setTimeout(r, 20));
        return jsonResponse(200, { result: { session_id: "shared" } });
      }
      if (u.includes("/messages") || u.includes("/commit")) return jsonResponse(200, {});
      return jsonResponse(404, {});
    });
    const client = createOvClient({
      endpoint: "http://ov.test",
      fetchImpl: fetchImpl as typeof fetch,
    });
    await Promise.all([
      client.rememberTurn({ userText: "a" }),
      client.rememberTurn({ userText: "b" }),
    ]);
    expect(sessionCreates).toBe(1);
    expect(client.getSessionId()).toBe("shared");
  });
});
