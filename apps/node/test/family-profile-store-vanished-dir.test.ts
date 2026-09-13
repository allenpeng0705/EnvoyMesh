/**
 * The atomic write when its directory disappears mid-write.
 *
 * ## The failure this pins
 *
 * Full-suite runs intermittently report `Errors 1 error` — an **unhandled
 * rejection**:
 *
 * ```
 * Error: ENOENT: no such file or directory, rename '…/family-profiles.json.tmp.…'
 *     -> '…/family-profiles.json'
 *  ❯ writeFileShape packages/local-store/src/family-profile-store.ts
 * ```
 *
 * The window is real but tiny: `writeFile(tmp)` succeeds, then something removes
 * the profile directory (a wipe, shutdown, or a test's `afterEach` teardown)
 * before `rename`. Rejecting there is both pointless — there is no longer
 * anything to persist — and dangerous, because the store's callers include
 * fire-and-forget writes, and Node's default `--unhandled-rejections=throw` can
 * terminate a node process.
 *
 * ## Why the test sabotages `rename` instead of racing it
 *
 * A timing-based version of this test passed with *and* without the guard: the
 * window is narrow enough that it simply never hit, so the test proved nothing.
 * Removing the directory immediately before the rename makes the race
 * deterministic, which makes the negative control meaningful — with the guard
 * removed this file fails.
 */

import { mkdtemp, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * One-shot hook: fires immediately before the store's `rename`, so a test can
 * arrange the exact state the race produces. Each test decides *what* vanishes —
 * the directory, or only the tmp file — which is what separates the two cases.
 */
let sabotage: ((paths: { from: string; to: string }) => Promise<void>) | null = null;

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    rename: async (from: string, to: string) => {
      if (sabotage) {
        const action = sabotage;
        sabotage = null; // one shot
        await action({ from, to });
      }
      return actual.rename(from, to);
    },
  };
});

const { createFamilyProfileStore, OWNER_FAMILY_PROFILE_ID } = await import(
  "../src/family-profile-store.js"
);

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "family-store-vanish-"));
});
afterEach(async () => {
  sabotage = null;
  await rm(dir, { recursive: true, force: true }).catch(() => undefined);
});

describe("a write whose directory vanished before the rename", () => {
  it("does not produce an unhandled rejection", async () => {
    const store = createFamilyProfileStore(dir);
    await store.ensureOwnerProfile({ name: "Owner" });

    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on("unhandledRejection", onUnhandled);
    try {
      // Remove the directory between `writeFile` and `rename`.
      sabotage = async ({ to }) => {
        await rm(dirname(to), { recursive: true, force: true });
      };
      // Fire-and-forget, which is the shape that produced the report.
      void store.update({ id: OWNER_FAMILY_PROFILE_ID, name: "Renamed" });
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(unhandled).toEqual([]);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });

  it("still rejects when the directory exists and the rename fails for another reason", async () => {
    // The guard is narrow on purpose: a rename failure that is *not* "the store
    // is gone" must still surface, so a real anomaly is not swallowed.
    const store = createFamilyProfileStore(dir);
    await store.ensureOwnerProfile({ name: "Owner" });
    // Wipe the tmp file only; the directory stays, so the guard must not apply.
    sabotage = async ({ from }) => {
      await rm(from, { force: true });
    };
    await expect(store.update({ id: OWNER_FAMILY_PROFILE_ID, name: "Renamed" })).rejects.toThrow();
  });
});
