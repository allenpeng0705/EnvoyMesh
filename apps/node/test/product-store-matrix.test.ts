/**
 * The `productStoreDir` test matrix (plan §8.9 / §8.17.7).
 *
 * The inventory rule is a *static* gate: it proves every product store is
 * constructed behind a guard. This is the runtime half — a kernel built with no
 * profile directory must end up with
 *
 *   * the **kernel** stores present and usable, and
 *   * the **product** stores either absent or the typed stand-in, so the first
 *     use names the store instead of writing to `/tmp/unknown`.
 *
 * Both halves matter. The first is why a non-social host is possible at all; the
 * second is why "this path needs the product" is measured rather than silent.
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLocalPeerDirectoryStore, createLocalTrustStore } from "@envoymesh/local-store";
import { afterEach, describe, expect, it } from "vitest";
import { NodeServiceImpl } from "../src/node-service-impl.js";
import {
  UNCONFIGURED_PROFILE_DIR,
  hasProfileDir,
  isProductStoreUnavailable,
} from "../src/product-store-availability.js";

const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true }).catch(() => undefined)));
});

/** A kernel with no profile directory at all — `undefined`, not a sentinel. */
async function bareKernel(): Promise<NodeServiceImpl> {
  const dir = await mkdtemp(join(tmpdir(), "store-matrix-"));
  dirs.push(dir);
  return new NodeServiceImpl(
    undefined,
    createLocalTrustStore(dir),
    createLocalPeerDirectoryStore(dir),
    undefined,
    undefined, // no profile directory
    undefined, // no NodeProfile
  );
}

/** A node with a real profile directory. */
async function fullKernel(): Promise<NodeServiceImpl> {
  const dir = await mkdtemp(join(tmpdir(), "store-matrix-full-"));
  dirs.push(dir);
  return new NodeServiceImpl(
    undefined,
    createLocalTrustStore(dir),
    createLocalPeerDirectoryStore(dir),
    undefined,
    dir,
    undefined,
  );
}

const field = (svc: NodeServiceImpl, name: string): unknown =>
  (svc as unknown as Record<string, unknown>)[name];

describe("the store matrix on a bare kernel", () => {
  it("treats an omitted profile directory as absence, not as /tmp/unknown", async () => {
    const svc = await bareKernel();
    try {
      const stored = field(svc, "_profileDir");
      // The field keeps a usable path for filesystem work, but nothing branches
      // on it: `hasProfileDir` is the single test for "configured or not".
      expect(stored).toBe(UNCONFIGURED_PROFILE_DIR);
      expect(hasProfileDir(stored as string)).toBe(false);
    } finally {
      svc.stopMemoryPruneTimer?.();
    }
  });

  it("has its kernel stores present and usable", async () => {
    const svc = await bareKernel();
    try {
      // Kernel group: what a host that is not EnvoyMesh social still needs.
      const configStore = field(svc, "_configStore") as { load?: () => Promise<unknown>; exists?: () => Promise<boolean> };
      expect(configStore, "the node-config store is kernel").toBeTruthy();
      // Not a stand-in: the stub fallback exists precisely so a host without a
      // profile directory still has configuration.
      expect(() => (configStore as Record<string, unknown>)["load"]).not.toThrow();
      expect(typeof configStore.load).toBe("function");
      expect(typeof configStore.exists).toBe("function");
      await expect(configStore.exists?.()).resolves.toBe(false); // stub: no config on disk
    } finally {
      svc.stopMemoryPruneTimer?.();
    }
  });

  it("does not hand out product stores: the first use names the store", async () => {
    const svc = await bareKernel();
    try {
      // Every product-grouped field the inventory knows about, plus the ones the
      // constructor used to build in place.
      const productFields = [
        "_chatLogStore",
        "_chatRoomStore",
        "_chatRoomPendingSyncStore",
        "_chatRoomPendingMessageStore",
        "_familyProfileStore",
        "_familyRoomStore",
        "_shopStore",
        "_marketCacheStore",
        "_marketSearchHistoryStore",
        "_commerceReceiptStore",
        "_reputationAnchorStore",
        "_socialProxySessionStore",
        "_documentAcquisitionJobStore",
        "_capabilityProviderJobStore",
        "_sessionTokenStore",
        "_codingHeartbeatStore",
        "_codingRuntimeStore",
        "_codingScheduleStore",
        "_chainStore",
        "_delegatedChainStore",
        "_publishedLibraryStore",
      ];
      const problems: string[] = [];
      for (const name of productFields) {
        const store = field(svc, name);
        if (store === null || store === undefined) continue; // absent is fine
        try {
          // A stand-in throws on *any* property access, so this discriminates
          // without depending on each store's method names — an earlier version
          // probed `load()`, which some stores simply do not have, and reported
          // "usable" for a store that had refused nothing.
          void (store as Record<string, unknown>)["__probe__"];
          problems.push(`${name}: was usable on a bare kernel`);
        } catch (err) {
          if (!isProductStoreUnavailable(err)) {
            problems.push(`${name}: threw ${(err as Error)?.constructor?.name ?? "something"} instead`);
          }
        }
      }
      expect(problems).toEqual([]);
    } finally {
      svc.stopMemoryPruneTimer?.();
    }
  });

  it("hands the same product stores out for real when a directory exists", async () => {
    // The non-negotiable constraint: with a profile directory, behaviour is
    // unchanged — the gate only decides *whether* the store exists.
    const svc = await fullKernel();
    try {
      const familyStore = field(svc, "_familyProfileStore") as { list?: () => unknown } | null;
      expect(familyStore, "with a directory the family store is real").toBeTruthy();
      let refused = false;
      try {
        void (familyStore as Record<string, unknown>)["list"];
      } catch (err) {
        refused = isProductStoreUnavailable(err);
      }
      expect(refused, "a real store must not be the typed stand-in").toBe(false);
    } finally {
      svc.stopMemoryPruneTimer?.();
    }
  });
});
