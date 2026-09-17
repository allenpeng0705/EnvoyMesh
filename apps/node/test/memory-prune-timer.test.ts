/**
 * The memory-prune interval's lifecycle.
 *
 * Why this test exists: `product-store-matrix.test.ts` and
 * `kernel-composability-probe.test.ts` contain seven `svc.stopMemoryPruneTimer?.()`
 * calls that were written before the method existed. Optional call made them a
 * silent no-op, so every bare kernel armed an hourly `setInterval` that nothing
 * ever cleared — and the interval was ref'd, so it held Node's event loop open
 * on its own. These assertions are what those seven calls were trying to make:
 *
 *   1. the interval is **unref'd**, so an hourly housekeeping tick can never by
 *      itself keep a daemon or a test worker alive, and
 *   2. `stopMemoryPruneTimer()` actually `clearInterval`s the armed handle —
 *      not merely nulls the field, because a null assignment without a clear
 *      is the same silent no-op one level down.
 *
 * The private-field reads mirror `product-store-matrix.test.ts`'s `field()`
 * helper: the field *is* the state under test, and a public accessor for it
 * would be testing the accessor rather than the lifecycle.
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLocalPeerDirectoryStore, createLocalTrustStore } from "@envoymesh/local-store";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NodeServiceImpl } from "../src/node-service-impl.js";

const PRUNE_INTERVAL_MS = 60 * 60 * 1000;
const dirs: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    dirs.splice(0).map((d) => rm(d, { recursive: true, force: true }).catch(() => undefined)),
  );
});

const field = (svc: NodeServiceImpl, name: string): unknown =>
  (svc as unknown as Record<string, unknown>)[name];

/** A bare kernel — the shape whose seven cleanup calls were no-ops. */
async function bareKernel(): Promise<NodeServiceImpl> {
  const dir = await mkdtemp(join(tmpdir(), "mem-prune-timer-"));
  dirs.push(dir);
  return new NodeServiceImpl(
    undefined,
    createLocalTrustStore(dir),
    createLocalPeerDirectoryStore(dir),
    undefined, // no human profile store
    undefined, // no profile directory
    undefined, // no NodeProfile
  );
}

describe("the node service's memory-prune interval", () => {
  it("is armed at construction and unref'd, so it cannot hold a process open", async () => {
    const svc = await bareKernel();
    const timer = field(svc, "_memoryPruneTimer") as
      | (ReturnType<typeof setInterval> & { hasRef?: () => boolean })
      | null;

    expect(timer, "the constructor arms the hourly prune").toBeTruthy();
    // `hasRef() === false` is the direct proof of `unref()`. A ref'd interval
    // keeps Node's event loop alive by itself; before the fix this was `true`.
    expect(timer?.hasRef?.(), "the prune interval must be unref'd").toBe(false);

    svc.stopMemoryPruneTimer();
  });

  it("clears the exact handle it armed, and is idempotent", async () => {
    const svc = await bareKernel();
    const timer = field(svc, "_memoryPruneTimer") as ReturnType<typeof setInterval>;
    expect(timer).toBeTruthy();

    const clearSpy = vi.spyOn(globalThis, "clearInterval");
    svc.stopMemoryPruneTimer();

    // Nulling the field is not enough on its own — this is the assertion that
    // separates a real clear from the silent-no-op class of bug.
    expect(clearSpy, "the armed handle is actually cleared").toHaveBeenCalledWith(timer);
    expect(field(svc, "_memoryPruneTimer")).toBeNull();

    // Idempotent: `stopNode` may run after a test's own `finally` already
    // stopped it, and it must not throw or clear twice.
    clearSpy.mockClear();
    svc.stopMemoryPruneTimer();
    expect(clearSpy, "a second stop is a no-op").not.toHaveBeenCalled();
  });

  it("re-arms at most one interval across a stop/start cycle (no compounding leak)", async () => {
    // `startNode()` re-arms through this same helper. Driving the helper
    // directly proves the guard without starting a mesh in a unit test.
    const setSpy = vi.spyOn(globalThis, "setInterval");
    const svc = await bareKernel();
    const arm = (): void =>
      (svc as unknown as { _startMemoryPruneTimer(): void })._startMemoryPruneTimer.call(svc);
    const pruneArms = (): number =>
      setSpy.mock.calls.filter((c) => c[1] === PRUNE_INTERVAL_MS).length;

    expect(pruneArms(), "the constructor arms one interval").toBe(1);
    arm(); // what `startNode()` does while the constructor's timer is still armed
    expect(pruneArms(), "the guard refuses a second arm").toBe(1);

    svc.stopMemoryPruneTimer();
    arm(); // what `startNode()` does after a `stopNode()`
    expect(pruneArms(), "a stop/start cycle re-arms exactly once more").toBe(2);
    expect(field(svc, "_memoryPruneTimer"), "and leaves one live handle").not.toBeNull();

    svc.stopMemoryPruneTimer();
  });
});
