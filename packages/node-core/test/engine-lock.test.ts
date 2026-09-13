/**
 * The engine spawn lock (§8 / S4).
 *
 * These pin the three behaviours the caller relies on: a second spawner is *told who holds
 * it* rather than both starting an engine; a crashed holder does not lock the user out of
 * their own model; and a process that does not hold the claim cannot release it.
 *
 * The claim is deliberately keyed on the **pid's liveness**, like the node lock, so the
 * takeover path is testable without a second process: a claim naming a pid that cannot be
 * alive is stale by definition.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { hostname as osHostname, tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  acquireEngineLock,
  currentProcessStartedAt,
  engineLockFileName,
  engineLockPath,
  hasEngineLock,
  readEngineLock,
  releaseEngineLock,
  releaseEngineLockSync,
} from "../src/engine-lock.js";

const roots: string[] = [];

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "envoy-engine-lock-"));
  roots.push(root);
  return root;
}

/** A pid that is certainly not alive: 0 and negatives are never valid process ids. */
const DEAD_PID = 2_147_483_646;

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("engineLockPath", () => {
  it("lives beside the engine assets it guards, under the shared runtime root", () => {
    expect(engineLockPath("/home/owner/envoymesh")).toBe(
      join("/home/owner/envoymesh", "runtime", "engine-chat.lock"),
    );
  });

  it("is per engine role, because chat and embeddings are two servers", () => {
    // One shared claim would either serialize two engines that may legitimately both run, or
    // let the embeddings runtime adopt the chat engine's port as its own.
    expect(engineLockFileName("chat")).toBe("engine-chat.lock");
    expect(engineLockFileName("embed")).toBe("engine-embed.lock");
    const root = "/home/owner/envoymesh";
    expect(engineLockPath(root, "chat")).not.toBe(engineLockPath(root, "embed"));
  });

  it("records the role in the claim", async () => {
    const root = tempRoot();
    await acquireEngineLock(root, { role: "embed", pid: process.pid, app: "EnvoyMesh", port: 18791 });
    expect(readEngineLock(root, "embed")?.role).toBe("embed");
  });

  it("does not block one engine while the other holds its claim", async () => {
    const root = tempRoot();
    const chat = await acquireEngineLock(root, { pid: process.pid, app: "EnvoyMesh", port: 18790 });
    const embed = await acquireEngineLock(root, { role: "embed", pid: process.pid, app: "EnvoyMesh", port: 18791 });
    expect(chat.acquired).toBe(true);
    expect(embed.acquired).toBe(true);
    // Releasing one leaves the other alone.
    expect(await releaseEngineLock(root, process.pid, "chat")).toBe(true);
    expect(hasEngineLock(root, "embed")).toBe(true);
  });
});

describe("acquireEngineLock", () => {
  it("grants the claim to the first caller and records who holds it", async () => {
    const root = tempRoot();
    const result = await acquireEngineLock(root, {
      pid: process.pid,
      app: "EnvoyMesh",
      port: 18790,
      modelId: "qwen3-0.6b",
    });
    expect(result.acquired).toBe(true);
    expect(hasEngineLock(root)).toBe(true);

    const holder = readEngineLock(root);
    expect(holder?.pid).toBe(process.pid);
    expect(holder?.app).toBe("EnvoyMesh");
    expect(holder?.port).toBe(18790);
    expect(holder?.modelId).toBe("qwen3-0.6b");
  });

  it("refuses a second claim while a live process holds it, and names the holder", async () => {
    const root = tempRoot();
    // A *different* live process holds it. `process.pid` would not do: a claim naming this
    // process is re-acquired on purpose (a restart in the same process), which is the
    // neighbouring test. `process.ppid` is alive and is not us.
    await acquireEngineLock(root, { pid: process.ppid, app: "EnvoyMesh", port: 18790 });

    const second = await acquireEngineLock(root, {
      pid: process.pid,
      app: "EnvoyCoder",
      port: 18791,
    });
    expect(second.acquired).toBe(false);
    expect(second.acquired === false && second.holder?.app).toBe("EnvoyMesh");
    // The loser must not have overwritten the winner's claim.
    expect(readEngineLock(root)?.app).toBe("EnvoyMesh");
    expect(readEngineLock(root)?.port).toBe(18790);
  });

  it("re-acquires its own claim instead of treating itself as a competitor", async () => {
    // A restart (watchdog, failed start) acquires again in the same process. Reporting
    // ourselves as the holder would send the caller into the "wait for the holder" loop with
    // nothing to wait for — a self-deadlock ending in "another process (pid <us>) holds it".
    const root = tempRoot();
    const first = await acquireEngineLock(root, { pid: process.pid, app: "EnvoyMesh", port: 18790 });
    const second = await acquireEngineLock(root, { pid: process.pid, app: "EnvoyMesh", port: 18790 });
    expect(first.acquired).toBe(true);
    expect(second.acquired).toBe(true);
    expect(second.acquired === true && second.reacquired).toBe(true);
  });

  it("treats a reused pid as stale instead of waiting for an unrelated process", async () => {
    // A claim is only as good as its pid *and* the process behind it: pids are recycled, so a
    // lock naming pid 4242 can end up pointing at an unrelated program that is very much alive.
    // Without this check the next start waits out the whole startup timeout and then reports a
    // holder that has nothing to do with the engine.
    const root = tempRoot();
    const claimedStart = Date.now() - 3_600_000;
    await acquireEngineLock(root, { pid: process.ppid, app: "EnvoyMesh", port: 18790 }, {
      processStartTimeOf: () => claimedStart,
    });

    // Same pid, but the OS now says that pid started two minutes ago: a different process.
    const result = await acquireEngineLock(
      root,
      { pid: process.pid, app: "EnvoyCoder", port: 18790 },
      { processStartTimeOf: () => Date.now() - 120_000 },
    );
    expect(result.acquired).toBe(true);
    expect(result.acquired === true && result.tookOverStale).toBe(true);
    expect(readEngineLock(root)?.pid).toBe(process.pid);
  });

  it("still honours a live holder whose start time agrees", async () => {
    const root = tempRoot();
    // The claim records *this* process's real start time (that is what the writer can know), so
    // "agrees" means the OS reports that same value back within tolerance — the normal case.
    await acquireEngineLock(root, { pid: process.ppid, app: "EnvoyMesh", port: 18790 });
    const result = await acquireEngineLock(
      root,
      { pid: process.pid, app: "EnvoyCoder", port: 18790 },
      { processStartTimeOf: () => currentProcessStartedAt() + 1_500 },
    );
    expect(result.acquired).toBe(false);
    expect(result.acquired === false && result.holder?.app).toBe("EnvoyMesh");
  });

  it("treats a claim from another host as stale", async () => {
    const root = tempRoot();
    await acquireEngineLock(root, { pid: process.ppid, app: "EnvoyMesh", port: 18790 }, {
      hostname: "someone-elses-laptop",
    });
    // The pid means nothing here — a shared home on a network mount must not block this machine.
    const result = await acquireEngineLock(root, { pid: process.pid, app: "EnvoyMesh", port: 18790 }, {
      hostname: osHostname(),
    });
    expect(result.acquired).toBe(true);
  });

  it("records this process's start time, so the next reader can detect reuse", async () => {
    const root = tempRoot();
    await acquireEngineLock(root, { pid: process.pid, app: "EnvoyMesh", port: 18790 });
    const holder = readEngineLock(root);
    expect(holder?.host).toBe(osHostname());
    // `Date.now() - process.uptime()`: this process started before now, and not in 1970.
    expect(holder?.pidStartedAt).toBeGreaterThan(Date.now() - 86_400_000);
    expect(holder?.pidStartedAt).toBeLessThanOrEqual(Date.now());
  });

  it("takes over a claim whose holder is gone, and says that it did", async () => {
    const root = tempRoot();
    await acquireEngineLock(root, { pid: DEAD_PID, app: "CrashedCoder", port: 18790 });

    const result = await acquireEngineLock(root, {
      pid: process.pid,
      app: "EnvoyMesh",
      port: 18790,
    });
    expect(result.acquired).toBe(true);
    // A takeover means the previous engine did not stop cleanly — the caller logs it.
    expect(result.acquired === true && result.tookOverStale).toBe(true);
    expect(readEngineLock(root)?.app).toBe("EnvoyMesh");
  });

  it("takes over an unreadable or empty claim file rather than deadlocking", async () => {
    const root = tempRoot();
    mkdirSync(join(root, "runtime"), { recursive: true });
    writeFileSync(engineLockPath(root), "not json at all");
    const result = await acquireEngineLock(root, { pid: process.pid, app: "EnvoyMesh", port: 18790 });
    expect(result.acquired).toBe(true);
    expect(readEngineLock(root)?.pid).toBe(process.pid);
  });
});

describe("releaseEngineLock", () => {
  it("does not release a role it does not hold", async () => {
    const root = tempRoot();
    await acquireEngineLock(root, { role: "embed", pid: process.pid, app: "EnvoyMesh", port: 18791 });
    // The default role is `chat`, which is not the claim we hold.
    expect(await releaseEngineLock(root, process.pid)).toBe(false);
    expect(hasEngineLock(root, "embed")).toBe(true);
  });

  it("releases only for the process that holds it", async () => {
    const root = tempRoot();
    await acquireEngineLock(root, { pid: process.pid, app: "EnvoyMesh", port: 18790 });

    // Somebody else's pid must not be able to delete a live claim — that is how a second
    // process gets in while the first is still serving.
    expect(await releaseEngineLock(root, DEAD_PID)).toBe(false);
    expect(hasEngineLock(root)).toBe(true);

    expect(await releaseEngineLock(root, process.pid)).toBe(true);
    expect(hasEngineLock(root)).toBe(false);
  });

  it("has a synchronous counterpart for exit handlers, with the same ownership rule", async () => {
    const root = tempRoot();
    await acquireEngineLock(root, { pid: process.pid, app: "EnvoyMesh", port: 18790 });
    expect(releaseEngineLockSync(root, DEAD_PID)).toBe(false);
    expect(releaseEngineLockSync(root, process.pid)).toBe(true);
    expect(hasEngineLock(root)).toBe(false);
    // Nothing to release twice.
    expect(releaseEngineLockSync(root, process.pid)).toBe(false);
  });

  it("reports false when there was never a claim", () => {
    const root = tempRoot();
    expect(readEngineLock(root)).toBeNull();
    expect(hasEngineLock(root)).toBe(false);
    expect(releaseEngineLockSync(root, process.pid)).toBe(false);
  });
});
