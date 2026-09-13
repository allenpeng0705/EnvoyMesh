/**
 * The home lock, the endpoint descriptor, and the identity probe.
 *
 * The properties that matter are the ones a single-process test cannot see: two
 * processes starting at the same instant must not both believe they own the home;
 * a crashed owner must not lock the user out; and one process must never release
 * another's claim. Each is asserted here against real files and — for the race —
 * real concurrent calls.
 *
 * Design: `docs/envoymesh-multi-product-design.md` §7.
 */

import { promises as fs } from "node:fs";
import { createServer } from "node:http";
import * as os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  NODE_ENDPOINT_FILE,
  NODE_LOCK_FILE,
  acquireNodeLock,
  endpointPath,
  isProcessAlive,
  probeNodeEndpoint,
  readNodeEndpoint,
  readNodeLock,
  resolveRunningNode,
  releaseNodeLock,
  releaseNodeLockSync,
  writeNodeEndpoint,
  type NodeEndpoint,
} from "../src/node-registry.js";

let home: string;

beforeEach(async () => {
  home = await fs.mkdtemp(path.join(os.tmpdir(), "envoymesh-node-"));
});

afterEach(async () => {
  await fs.rm(home, { recursive: true, force: true });
});

/** A pid that cannot be running: Linux/macOS cap pid_max well below this. */
const DEAD_PID = 9_999_999;

describe("acquireNodeLock", () => {
  it("grants a free home and records who holds it", async () => {
    const result = await acquireNodeLock(home, { pid: process.pid, app: "EnvoyMesh", version: "0.5.0" });
    expect(result.acquired).toBe(true);
    if (!result.acquired) return;
    expect(result.tookOverStale).toBe(false);
    expect(result.lock.pid).toBe(process.pid);

    const onDisk = await readNodeLock(home);
    expect(onDisk?.app).toBe("EnvoyMesh");
    if (process.platform !== "win32") {
      expect((await fs.stat(path.join(home, NODE_LOCK_FILE))).mode & 0o777).toBe(0o600);
    }
  });

  it("refuses a home a live process already holds, and says who", async () => {
    await acquireNodeLock(home, { pid: process.pid, app: "EnvoyMesh", version: "0.5.0" });
    await writeNodeEndpoint(home, {
      pid: process.pid,
      app: "EnvoyMesh",
      version: "0.5.0",
      startedAt: new Date().toISOString(),
      port: 3030,
      path: "/ws",
      token: "tok",
      peerId: "12D3KooWHome",
    });

    const second = await acquireNodeLock(home, { pid: DEAD_PID, app: "EnvoyCoder", version: "1.0.0" });
    expect(second.acquired).toBe(false);
    if (second.acquired) return;
    expect(second.holder.pid).toBe(process.pid);
    expect(second.holder.app).toBe("EnvoyMesh");
    // The loser gets what it needs to attach rather than only being told "no".
    expect(second.endpoint?.port).toBe(3030);
    expect(second.endpoint?.peerId).toBe("12D3KooWHome");
  });

  it("takes over a stale claim, so a crashed node cannot lock the user out", async () => {
    await acquireNodeLock(home, { pid: DEAD_PID, app: "EnvoyMesh", version: "0.5.0" });
    const result = await acquireNodeLock(home, { pid: process.pid, app: "EnvoyMesh", version: "0.5.0" });
    expect(result.acquired).toBe(true);
    if (!result.acquired) return;
    expect(result.tookOverStale).toBe(true);
    expect((await readNodeLock(home))?.pid).toBe(process.pid);
  });

  it("takes over an unreadable claim rather than failing forever", async () => {
    await fs.writeFile(path.join(home, NODE_LOCK_FILE), "{ this is not json");
    const result = await acquireNodeLock(home, { pid: process.pid, app: "EnvoyMesh", version: "0.5.0" });
    expect(result.acquired).toBe(true);
  });

  it("grants the home to exactly one of many simultaneous claimants", async () => {
    // The property `wx` exists for: the create either wins or fails with EEXIST.
    const attempts = await Promise.all(
      Array.from({ length: 8 }, () =>
        acquireNodeLock(home, { pid: process.pid, app: "EnvoyMesh", version: "0.5.0" }),
      ),
    );
    expect(attempts.filter((a) => a.acquired)).toHaveLength(1);
    for (const loser of attempts.filter((a) => !a.acquired)) {
      if (!loser.acquired) expect(loser.holder.pid).toBe(process.pid);
    }
  });
});

describe("releaseNodeLock", () => {
  it("releases a claim this process holds", async () => {
    await acquireNodeLock(home, { pid: process.pid, app: "EnvoyMesh", version: "0.5.0" });
    await writeNodeEndpoint(home, {
      pid: process.pid,
      app: "EnvoyMesh",
      version: "0.5.0",
      startedAt: new Date().toISOString(),
      port: 3030,
      path: "/ws",
      token: "t",
    });
    expect(await releaseNodeLock(home, process.pid)).toBe(true);
    expect(await readNodeLock(home)).toBeNull();
    // The endpoint goes too: leaving it behind advertises a node that is gone.
    expect(await readNodeEndpoint(home)).toBeNull();
  });

  it("never releases a claim that belongs to someone else", async () => {
    await acquireNodeLock(home, { pid: DEAD_PID, app: "EnvoyMesh", version: "0.5.0" });
    expect(await releaseNodeLock(home, process.pid)).toBe(false);
    expect((await readNodeLock(home))?.pid).toBe(DEAD_PID);
  });
});

describe("releaseNodeLockSync", () => {
  it("releases a claim this process holds, endpoint included", async () => {
    await acquireNodeLock(home, { pid: process.pid, app: "EnvoyMesh", version: "0.5.0" });
    await writeNodeEndpoint(home, {
      pid: process.pid,
      app: "EnvoyMesh",
      version: "0.5.0",
      startedAt: new Date().toISOString(),
      port: 3030,
      path: "/ws",
      token: "t",
    });
    expect(releaseNodeLockSync(home, process.pid)).toBe(true);
    expect(await readNodeLock(home)).toBeNull();
    expect(await readNodeEndpoint(home)).toBeNull();
  });

  it("is safe to call twice, with no lock, or with a corrupt one", async () => {
    // It runs from `process.on("exit")`, where throwing would replace the exit code
    // with a crash — so every failure path has to be a `false`, not a throw.
    expect(releaseNodeLockSync(home, process.pid)).toBe(false);
    expect(releaseNodeLockSync(home, process.pid)).toBe(false);
    await fs.writeFile(path.join(home, NODE_LOCK_FILE), "{ truncated");
    expect(releaseNodeLockSync(home, process.pid)).toBe(false);
  });

  it("never releases someone else's claim", async () => {
    await acquireNodeLock(home, { pid: DEAD_PID, app: "EnvoyMesh", version: "0.5.0" });
    expect(releaseNodeLockSync(home, process.pid)).toBe(false);
    expect((await readNodeLock(home))?.pid).toBe(DEAD_PID);
  });
});

describe("the endpoint descriptor", () => {
  const endpoint: NodeEndpoint = {
    pid: 1234,
    app: "EnvoyMesh",
    version: "0.5.0",
    startedAt: "2026-09-13T00:00:00.000Z",
    port: 3030,
    path: "/ws",
    token: "pair-token",
    peerId: "12D3KooWHome",
    ownerId: "envoy:owner:abc",
    schema: 1,
  };

  it("round-trips, at 0600", async () => {
    await writeNodeEndpoint(home, endpoint);
    expect(await readNodeEndpoint(home)).toEqual(endpoint);
    if (process.platform !== "win32") {
      expect((await fs.stat(endpointPath(home))).mode & 0o777).toBe(0o600);
    }
  });

  it("reports null for a missing, corrupt or incomplete descriptor", async () => {
    expect(await readNodeEndpoint(home)).toBeNull();
    await fs.writeFile(path.join(home, NODE_ENDPOINT_FILE), "{ broken");
    expect(await readNodeEndpoint(home)).toBeNull();
    // A descriptor without a port is useless to an attaching product.
    await fs.writeFile(path.join(home, NODE_ENDPOINT_FILE), JSON.stringify({ pid: 1 }));
    expect(await readNodeEndpoint(home)).toBeNull();
  });
});

describe("isProcessAlive", () => {
  it("knows the current process is alive and an impossible pid is not", () => {
    expect(isProcessAlive(process.pid)).toBe(true);
    expect(isProcessAlive(DEAD_PID)).toBe(false);
    expect(isProcessAlive(0)).toBe(false);
    expect(isProcessAlive(-1)).toBe(false);
  });
});

describe("resolveRunningNode", () => {
  /** A stand-in node: `/health` with whatever identity the test wants it to claim. */
  async function withHealth(
    payload: Record<string, unknown>,
    run: (port: number) => Promise<void>,
  ): Promise<void> {
    const server = createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, service: "envoymesh-home-ws", ...payload }));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    try {
      await run(port);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }

  async function claim(port: number, ownerId?: string): Promise<void> {
    await acquireNodeLock(home, { pid: process.pid, app: "EnvoyMesh", version: "0.5.0" });
    await writeNodeEndpoint(home, {
      pid: process.pid,
      app: "EnvoyMesh",
      version: "0.5.0",
      startedAt: new Date().toISOString(),
      port,
      path: "/ws",
      token: "",
      ...(ownerId ? { ownerId } : {}),
    });
  }

  it("reports none when nothing claims the home", async () => {
    expect((await resolveRunningNode(home)).status).toBe("none");
  });

  it("reports stale when the claim's process is gone", async () => {
    await acquireNodeLock(home, { pid: DEAD_PID, app: "EnvoyMesh", version: "0.5.0" });
    const result = await resolveRunningNode(home);
    expect(result.status).toBe("stale");
    expect(result.reason).toContain(String(DEAD_PID));
  });

  it("verifies a running node and hands back a dialable URL", async () => {
    await withHealth({ ownerId: "envoy:owner:abc" }, async (port) => {
      await claim(port, "envoy:owner:abc");
      const result = await resolveRunningNode(home);
      expect(result.status).toBe("running");
      expect(result.wsUrl).toBe(`ws://127.0.0.1:${port}/ws`);
      expect(result.probe?.identityVerified).toBe(true);
    });
  });

  it("refuses to call it running when another node answers on that port", async () => {
    // The case the whole health-identity change exists for: the claim is real, the
    // port answers, and the answer is somebody else's node.
    await withHealth({ ownerId: "envoy:owner:someone-else" }, async (port) => {
      await claim(port, "envoy:owner:abc");
      const result = await resolveRunningNode(home);
      expect(result.status).toBe("unverified");
      expect(result.reason).toContain("another node");
      expect(result.wsUrl).toBeUndefined();
    });
  });

  it("refuses to call it running when the endpoint will not say who it is", async () => {
    await withHealth({}, async (port) => {
      await claim(port, "envoy:owner:abc");
      const result = await resolveRunningNode(home);
      expect(result.status).toBe("unverified");
      expect(result.reason).toContain("does not report identity");
    });
  });

  it("reports a live claim with no descriptor as unverified, not running", async () => {
    await acquireNodeLock(home, { pid: process.pid, app: "EnvoyMesh", version: "0.5.0" });
    const result = await resolveRunningNode(home);
    expect(result.status).toBe("unverified");
    expect(result.holder?.pid).toBe(process.pid);
    expect(result.reason).toContain("no endpoint descriptor");
  });

  it("reports an unanswered endpoint as unverified, with why", async () => {
    await claim(1); // nothing listens on port 1
    const result = await resolveRunningNode(home, { timeoutMs: 500 });
    expect(result.status).toBe("unverified");
    expect(result.reason).toContain("did not answer");
  });
});

describe("probeNodeEndpoint", () => {
  async function withServer(
    payload: unknown,
    status: number,
    run: (port: number) => Promise<void>,
  ): Promise<void> {
    const server = createServer((_req, res) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(typeof payload === "string" ? payload : JSON.stringify(payload));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    try {
      await run(port);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }

  it("believes a node that names itself, and only that node", async () => {
    await withServer({ ok: true, service: "envoymesh-home-ws", peerId: "12D3KooWHome", ownerId: "envoy:owner:abc" }, 200, async (port) => {
      const mine = await probeNodeEndpoint({ port, peerId: "12D3KooWHome", ownerId: "envoy:owner:abc" });
      expect(mine).toMatchObject({ reachable: true, identityVerified: true, identityUnknown: false });

      // Same shape, different identity: this is the case the desktop guardian
      // cannot currently tell apart, because /health looks identical in every product.
      const impostor = await probeNodeEndpoint({ port, peerId: "12D3KooWOther" });
      expect(impostor.reachable).toBe(true);
      expect(impostor.identityVerified).toBe(false);
    });
  });

  it("says identity is unknown rather than verified when the payload omits it", async () => {
    await withServer({ ok: true, service: "envoymesh-home-ws" }, 200, async (port) => {
      const result = await probeNodeEndpoint({ port, peerId: "12D3KooWHome" });
      expect(result).toMatchObject({ reachable: true, identityVerified: false, identityUnknown: true });
    });
  });

  it("reports unreachable for a dead port, a bad status or junk", async () => {
    const dead = await probeNodeEndpoint({ port: 1 }, { timeoutMs: 500 });
    expect(dead.reachable).toBe(false);
    expect(dead.error).toBeTruthy();

    await withServer({ ok: false }, 503, async (port) => {
      expect((await probeNodeEndpoint({ port })).reachable).toBe(false);
    });
    await withServer("not json at all", 200, async (port) => {
      expect((await probeNodeEndpoint({ port })).reachable).toBe(false);
    });
  });
});
