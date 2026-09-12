/**
 * Enabling change 2 of the host extraction: `caller-context.ts` owns the
 * *mechanism* (an async-scoped caller slot), `rpc-caller-context.ts` owns the
 * *policy* (who a caller is, what they may do).
 *
 * The point of the split is that a host/connect package can take the mechanism
 * without inheriting EnvoyMesh's owner/family-profile authorisation model. That
 * claim is only worth anything if the mechanism genuinely works on its own and
 * genuinely names nothing — so this file asserts both.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createCallerContextStore } from "@envoymesh/host-connect";
import { stripCommentsAndStrings } from "../../../scripts/lib/source-files.mjs";

const MECHANISM = new URL("../../../packages/host-connect/src/caller-context.ts", import.meta.url);

interface FakeCaller {
  readonly label: string;
}

describe("caller-context — the transport-neutral mechanism", () => {
  it("exposes the caller inside run()", async () => {
    const store = createCallerContextStore<FakeCaller>();
    const seen = await store.run({ label: "alpha" }, async () => store.get());
    expect(seen).toEqual({ label: "alpha" });
  });

  it("has no caller outside run()", () => {
    const store = createCallerContextStore<FakeCaller>();
    expect(store.get()).toBeUndefined();
  });

  it("survives await boundaries inside run()", async () => {
    const store = createCallerContextStore<FakeCaller>();
    const seen = await store.run({ label: "alpha" }, async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
      const afterTick = store.get();
      await Promise.resolve();
      return [afterTick, store.get()];
    });
    expect(seen).toEqual([{ label: "alpha" }, { label: "alpha" }]);
  });

  it("nests — the inner run wins and the outer one is restored", async () => {
    const store = createCallerContextStore<FakeCaller>();
    const observed = await store.run({ label: "outer" }, async () => {
      const inner = await store.run({ label: "inner" }, async () => store.get());
      return [inner, store.get()];
    });
    expect(observed).toEqual([{ label: "inner" }, { label: "outer" }]);
  });

  it("does not leak one branch's caller into a concurrent sibling branch", async () => {
    const store = createCallerContextStore<FakeCaller>();
    const runBranch = (label: string) =>
      store.run({ label }, async () => {
        await new Promise((resolve) => setTimeout(resolve, label === "slow" ? 5 : 1));
        return store.get()?.label;
      });
    const [slow, fast] = await Promise.all([runBranch("slow"), runBranch("fast")]);
    expect([slow, fast]).toEqual(["slow", "fast"]);
  });

  it("keeps two stores independent", async () => {
    const first = createCallerContextStore<FakeCaller>();
    const second = createCallerContextStore<FakeCaller>();
    const observed = await first.run({ label: "one" }, async () => [
      first.get()?.label,
      second.get(),
    ]);
    expect(observed).toEqual(["one", undefined]);
  });

  it("runOptional() sets the caller when present", async () => {
    const store = createCallerContextStore<FakeCaller>();
    const seen = await store.runOptional({ label: "alpha" }, async () => store.get());
    expect(seen).toEqual({ label: "alpha" });
  });

  it("runOptional() runs with no caller when absent", async () => {
    const store = createCallerContextStore<FakeCaller>();
    const seen = await store.runOptional(undefined, async () => store.get());
    expect(seen).toBeUndefined();
  });

  it("propagates a rejection without swallowing the caller", async () => {
    const store = createCallerContextStore<FakeCaller>();
    await expect(
      store.run({ label: "alpha" }, async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(store.get()).toBeUndefined();
  });
});

describe("caller-context — the mechanism names no product concept", () => {
  /** Comments removed and string literals blanked — the *shared* scanner from
   * `scripts/lib/source-files.mjs`, not a local regex copy. The regex version
   * deleted real code here: a comment marker inside a log string opened a bogus
   * block comment and swallowed text up to the next terminator, so this scan was
   * reading a file with parts missing — caught by a guard asserting that an
   * identifier survives stripping. */
  const codeOf = stripCommentsAndStrings;

  it("has no import from a product module and no @envoymesh dependency", () => {
    const source = readFileSync(MECHANISM, "utf8");
    const imports = [...source.matchAll(/^import[\s\S]*?from\s+"([^"]+)"/gm)].map((m) => m[1]);
    expect(imports).toEqual(["node:async_hooks"]);
  });

  it("names no EnvoyMesh caller concept in its code", () => {
    const code = codeOf(readFileSync(MECHANISM, "utf8"));
    for (const concept of [
      "profileId",
      "isOwnerProfile",
      "ownerId",
      "session",
      "deviceId",
      "family",
      "RpcCaller",
      "Social",
    ]) {
      expect(code).not.toContain(concept);
    }
  });
});
