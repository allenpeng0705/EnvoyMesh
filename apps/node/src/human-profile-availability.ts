/**
 * Human-profile availability — the §6.2 kernel-composability seam.
 *
 * ## Why this exists
 *
 * `docs/envoymesh-refactoring-plan.md` §6.2 records that a product's desktop app
 * must be able to construct a node runtime **without social inputs**. The probe
 * makes `humanProfileStore` optional and supplies this store when it is absent,
 * so the kernel still constructs — and any code path that genuinely needs a
 * human profile fails with a **typed, nameable error** instead of a crash.
 *
 * The point of throwing rather than returning `undefined` is *measurement*: a
 * null-object would silently hide the dependency, while a typed error makes the
 * probe's output an **exact list of the code paths that still require a human
 * profile** — which is the extraction target if the probe fails (E8's stop rule).
 *
 * ## Probe result (measured)
 *
 * `apps/node/test/kernel-composability-probe.test.ts` drives **104 zero-arg
 * RPCs** against a kernel constructed with no human profile store and no
 * `NodeProfile`. Two extractions took profile-coupled RPCs from **15 to 2**:
 *
 * | Iteration | `served` | require a human profile |
 * |---|---|---|
 * | initial | 84 | **15** |
 * | after fixing `_ensureFamilyOwnerMigrated()` (one call site → 9 cleared) | 93 | 6 |
 * | after `_humanProfileOrUndefined()` on the owner-id fallback pattern (7+2 sites) | **94** | **2** |
 *
 * The remaining two — `getHumanProfile` and `syncProfileToBonds` — are the two
 * that are *about* the human profile, which is correct. **E8's stop rule is
 * satisfied: no further `node-service-impl.ts` extraction is required for V1.**
 *
 * ## Inputs, and the one still outstanding
 *
 * | Input | Status |
 * |---|---|
 * | `profile?: NodeProfile` | **Already optional and fully null-safe** — 32 `this._profile?.` uses, 0 unguarded |
 * | `humanProfileStore` | **This seam.** Optional here; the two extractions above removed the incidental coupling |
 * | `profileDir` | **Still the real gate, and NOT addressed by this probe** — it conditions **29** store creations in the constructor, mixing core stores (trust, peer directory, agent identity) with product ones (family profiles, family rooms, shop, market, commerce, social proxy, agent circles). A product host must still supply one, so construction is not yet product-free |
 *
 * This module is deliberately small and dependency-free so it can move with the
 * host/connect layer when that is extracted (§6.1, Step 6).
 */

import type { HumanProfileStore } from "@envoymesh/local-store";

/**
 * `HumanProfilePayload` is declared inside `@envoymesh/local-store` but not
 * re-exported from its index, so it is derived structurally here rather than
 * reaching past the package's public surface.
 */
type HumanProfilePayload = Parameters<HumanProfileStore["saveHumanProfile"]>[0];

/** Stable error code, so callers and tests can match without string parsing. */
export const HUMAN_PROFILE_UNAVAILABLE_CODE = "human-profile-unavailable";

/**
 * Thrown when a code path requires a human profile but the kernel was
 * constructed without a `humanProfileStore`.
 *
 * Callers that can degrade should catch this and continue; callers that cannot
 * should surface it. It is **not** a programming error — it is the expected
 * result of running the kernel without social inputs.
 */
export class HumanProfileUnavailableError extends Error {
  readonly code = HUMAN_PROFILE_UNAVAILABLE_CODE;

  constructor(
    /** The capability that needed the profile, for the probe's report. */
    readonly operation: string = "human profile access",
  ) {
    super(
      `This node was started without a human profile store, so ${operation} is unavailable. ` +
        "Start the node with a profile directory to enable profile-backed features.",
    );
    this.name = "HumanProfileUnavailableError";
  }
}

export function isHumanProfileUnavailable(err: unknown): err is HumanProfileUnavailableError {
  return (
    err instanceof HumanProfileUnavailableError ||
    (typeof err === "object" &&
      err !== null &&
      (err as { code?: unknown }).code === HUMAN_PROFILE_UNAVAILABLE_CODE)
  );
}

/**
 * Load a human profile, treating **"no store configured"** as **"no profile"**
 * rather than an error.
 *
 * This is the seam for code paths that already have a fallback for a missing
 * profile. `_ensureFamilyOwnerMigrated()` is the canonical case: it falls back
 * to the owner id and then to `"Owner"`, so a node without a human profile has
 * every ingredient it needs — it simply could not get past a *throwing* load.
 *
 * Only {@link HumanProfileUnavailableError} degrades. A genuine store failure
 * (I/O error, corrupt JSON) still propagates, so this never hides a real fault.
 */
export async function tryLoadHumanProfile(
  store: HumanProfileStore,
  operation = "human profile access",
): Promise<HumanProfilePayload | undefined> {
  try {
    return await store.loadHumanProfile();
  } catch (err) {
    if (isHumanProfileUnavailable(err)) return undefined;
    throw err;
  }
}

/**
 * A `HumanProfileStore` that reports the absence of a profile rather than
 * pretending there is an empty one.
 *
 * Both operations throw: reading cannot answer, and writing has nowhere to go.
 */
export function createUnavailableHumanProfileStore(
  operation = "human profile access",
): HumanProfileStore {
  return {
    async loadHumanProfile(): Promise<HumanProfilePayload | undefined> {
      throw new HumanProfileUnavailableError(operation);
    },
    async saveHumanProfile(): Promise<void> {
      throw new HumanProfileUnavailableError(`${operation} (save)`);
    },
  };
}
