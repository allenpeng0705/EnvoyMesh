/**
 * Unit tests for admin Basic Auth, log ring retention, and admin HTTP 401/200.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { existsSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  adminCredentialsConfigured,
  checkBasicAuth,
  parseBasicAuthHeader,
  requiresAdminAuth,
} from "../src/admin-auth.js";
import { createRelayLogBuffer } from "../src/relay-log-buffer.js";
import { handleAdminRequest, type AdminHttpDeps } from "../src/admin-http.js";

const ADMIN_UI_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "admin-ui");

describe("admin-auth", () => {
  it("adminCredentialsConfigured requires both user and password", () => {
    expect(adminCredentialsConfigured({ adminUser: "", adminPassword: "x" })).toBeNull();
    expect(adminCredentialsConfigured({ adminUser: "ops", adminPassword: "" })).toBeNull();
    expect(adminCredentialsConfigured({ adminUser: "ops", adminPassword: "secret" })).toEqual({
      user: "ops",
      password: "secret",
    });
  });

  it("parseBasicAuthHeader decodes user:password", () => {
    const token = Buffer.from("ops:s3cret", "utf8").toString("base64");
    expect(parseBasicAuthHeader(`Basic ${token}`)).toEqual({
      user: "ops",
      password: "s3cret",
    });
    expect(parseBasicAuthHeader(undefined)).toBeNull();
    expect(parseBasicAuthHeader("Bearer x")).toBeNull();
  });

  it("checkBasicAuth accepts matching credentials and rejects wrong ones", () => {
    const creds = { user: "ops", password: "s3cret" };
    const ok = {
      headers: {
        authorization: `Basic ${Buffer.from("ops:s3cret").toString("base64")}`,
      },
    } as IncomingMessage;
    const bad = {
      headers: {
        authorization: `Basic ${Buffer.from("ops:wrong").toString("base64")}`,
      },
    } as IncomingMessage;
    expect(checkBasicAuth(ok, creds)).toBe(true);
    expect(checkBasicAuth(bad, creds)).toBe(false);
  });

  it("requiresAdminAuth fails closed for /admin without creds", () => {
    expect(requiresAdminAuth("/admin", null)).toBe(true);
    expect(requiresAdminAuth("/admin/api/status", null)).toBe(true);
    expect(requiresAdminAuth("/info", null)).toBe(false);
    expect(requiresAdminAuth("/health", null)).toBe(false);
    expect(requiresAdminAuth("/relay-roster.json", null)).toBe(false);
    const creds = { user: "a", password: "b" };
    expect(requiresAdminAuth("/info", creds)).toBe(true);
    expect(requiresAdminAuth("/health", creds)).toBe(false);
  });
});

describe("relay-log-buffer", () => {
  const buffers: Array<ReturnType<typeof createRelayLogBuffer>> = [];
  afterEach(() => {
    for (const b of buffers) b.dispose();
    buffers.length = 0;
  });

  it("evicts oldest lines when maxLines is exceeded", () => {
    const buf = createRelayLogBuffer({
      maxLines: 3,
      installConsoleHooks: false,
    });
    buffers.push(buf);
    buf.append("log", "a");
    buf.append("log", "b");
    buf.append("log", "c");
    buf.append("log", "d");
    expect(buf.size()).toBe(3);
    expect(buf.tail(10).map((e) => e.message)).toEqual(["b", "c", "d"]);
  });

  it("rotates the log file when maxBytes is exceeded", () => {
    const dir = mkdtempSync(join(tmpdir(), "relay-log-"));
    const buf = createRelayLogBuffer({
      maxLines: 100,
      maxBytes: 80,
      retainDays: 7,
      logDir: dir,
      installConsoleHooks: false,
    });
    buffers.push(buf);
    for (let i = 0; i < 20; i++) {
      buf.append("log", `line-${i}-xxxxxxxxxxxxxxxxxxxx`);
    }
    const current = join(dir, "relay.log");
    expect(existsSync(current)).toBe(true);
    const names = readdirSync(dir);
    const rotated = names.filter((n) => /^relay\.log\.\d+$/.test(n));
    expect(rotated.length).toBeGreaterThanOrEqual(1);
    expect(readFileSync(current, "utf8").length).toBeLessThan(200);
  });

  it("clear empties the ring and truncates the file", () => {
    const dir = mkdtempSync(join(tmpdir(), "relay-log-clear-"));
    const buf = createRelayLogBuffer({
      logDir: dir,
      installConsoleHooks: false,
    });
    buffers.push(buf);
    buf.append("warn", "keep-me");
    expect(buf.size()).toBe(1);
    buf.clear({ truncateFile: true });
    expect(buf.size()).toBe(0);
    expect(readFileSync(join(dir, "relay.log"), "utf8")).toBe("");
  });
});

describe("admin-http", () => {
  async function withServer(
    deps: AdminHttpDeps,
    fn: (base: string) => Promise<void>,
  ): Promise<void> {
    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      void (async () => {
        const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
        const handled = await handleAdminRequest(req, res, url.pathname, url, deps);
        if (!handled) {
          res.writeHead(404);
          res.end();
        }
      })();
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const addr = server.address();
    if (!addr || typeof addr === "string") throw new Error("no address");
    const base = `http://127.0.0.1:${addr.port}`;
    try {
      await fn(base);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  }

  function makeDeps(overrides: Partial<AdminHttpDeps> = {}): AdminHttpDeps {
    const logBuffer = createRelayLogBuffer({ installConsoleHooks: false, maxLines: 50 });
    logBuffer.append("log", "hello");
    return {
      creds: { user: "ops", password: "s3cret" },
      logBuffer,
      adminUiRoot: ADMIN_UI_ROOT,
      buildStatus: () => ({ ok: true, peerId: "peer-test" }),
      buildReservations: () => ({ count: 0, reservations: [] }),
      buildPeers: () => ({ connectedPeerCount: 0 }),
      restartLibp2p: async () => {},
      restartProcess: () => {},
      ...overrides,
    };
  }

  it("returns 401 without credentials for /admin/api/status", async () => {
    const deps = makeDeps();
    await withServer(deps, async (base) => {
      const res = await fetch(`${base}/admin/api/status`);
      expect(res.status).toBe(401);
      expect(res.headers.get("www-authenticate") ?? "").toMatch(/Basic/i);
    });
    deps.logBuffer.dispose();
  });

  it("returns 200 with valid Basic Auth for /admin/api/status", async () => {
    const deps = makeDeps();
    await withServer(deps, async (base) => {
      const res = await fetch(`${base}/admin/api/status`, {
        headers: {
          Authorization: `Basic ${Buffer.from("ops:s3cret").toString("base64")}`,
        },
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { peerId: string };
      expect(body.peerId).toBe("peer-test");
    });
    deps.logBuffer.dispose();
  });

  it("serves /admin/api/roster and /admin/api/metrics when wired", async () => {
    const deps = makeDeps({
      buildRoster: () => ({
        size: 1,
        entries: [{ peerId: "12D3KooWPeer", hasHopSlot: true, topicHashes: ["bafytest"] }],
        topicHashes: [{ topicHash: "bafytest", peerCount: 1 }],
        checkedAt: "2026-07-20T10:00:00.000Z",
      }),
      buildFleet: () => ({
        selfPeerId: "peer-test",
        relays: [{ label: "CN community", peerId: "12D3KooWCN", isSelf: false, connected: true }],
        checkedAt: "2026-07-20T10:00:00.000Z",
      }),
      buildMetrics: () => ({ checkins: 3, lookups: 5, lookupHits: 2 }),
    });
    await withServer(deps, async (base) => {
      const auth = {
        Authorization: `Basic ${Buffer.from("ops:s3cret").toString("base64")}`,
      };
      const rosterRes = await fetch(`${base}/admin/api/roster`, { headers: auth });
      expect(rosterRes.status).toBe(200);
      const roster = (await rosterRes.json()) as {
        size: number;
        entries: Array<{ hasHopSlot: boolean }>;
        topicHashes: Array<{ topicHash: string }>;
      };
      expect(roster.size).toBe(1);
      expect(roster.entries[0]?.hasHopSlot).toBe(true);
      expect(roster.topicHashes[0]?.topicHash).toBe("bafytest");

      const fleetRes = await fetch(`${base}/admin/api/fleet`, { headers: auth });
      expect(fleetRes.status).toBe(200);
      const fleet = (await fleetRes.json()) as { selfPeerId: string; relays: unknown[] };
      expect(fleet.selfPeerId).toBe("peer-test");
      expect(fleet.relays.length).toBe(1);

      const metricsRes = await fetch(`${base}/admin/api/metrics`, { headers: auth });
      expect(metricsRes.status).toBe(200);
      const metrics = (await metricsRes.json()) as { checkins: number; lookupHits: number };
      expect(metrics.checkins).toBe(3);
      expect(metrics.lookupHits).toBe(2);
    });
    deps.logBuffer.dispose();
  });

  it("returns 404 for /admin when credentials are not configured", async () => {
    const deps = makeDeps({ creds: null });
    await withServer(deps, async (base) => {
      const res = await fetch(`${base}/admin/api/status`);
      expect(res.status).toBe(404);
      const text = await res.text();
      expect(text).toMatch(/disabled/i);
    });
    deps.logBuffer.dispose();
  });
});
