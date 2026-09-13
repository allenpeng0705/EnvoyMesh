/**
 * The engine asset root, decided **once per home** (design §8 / S4).
 *
 * ## The problem this solves
 *
 * `localEngineAssetsDir()` answers "shared `<home>/runtime/envoy-local`, or the legacy
 * `{profile}/envoy-local`?" from `exists()` — per process, per call. That is fine while one
 * process asks, and wrong the moment two do: if a process resolves the legacy root and
 * something later creates the shared root (a second product, a different profile on the same
 * home, a user unzipping weights), the next process resolves *shared*. Both then hold a
 * **different lock file for the same engine port**, which is exactly the case the spawn lock
 * exists to prevent — neither claim is visible to the other, so both start an engine and the
 * loser's port bind fails.
 *
 * ## The fix: record the decision, then obey it
 *
 * The first process to resolve writes the answer to `<home>/runtime/engine-root.json`
 * (`dir`, `reason`, `decidedAt`). Every later resolution reads it and returns the same path,
 * whatever has appeared on disk since — so the lock file, the binary and the weights are the
 * same for every product on the machine. The marker is not a cache; it is the decision.
 *
 * **A recorded answer is obeyed even if its directory does not exist yet**, which is the
 * normal state of a fresh install (the shared root is created by the first download, after the
 * decision is written). Invalidating the decision on a missing directory would reopen the race
 * during exactly that window: the second process would re-decide, and if a legacy copy had
 * appeared in the meantime it would choose differently. To change the decision, delete the
 * marker — that is the explicit act, and it is the only one that can move the assets.
 *
 * The one case that re-decides is there being **no marker at all**, which is every install
 * upgrading from before this change: it adopts exactly as it did before, and records the
 * answer on the way out.
 *
 * Pure by design: the caller supplies the marker IO, because where the home lives and what
 * counts as an unconfigured profile are the app's business, not this package's.
 */

import { existsSync } from "node:fs";
import * as path from "node:path";
import { homeForProfileDir, localEngineAssetsDir, runtimeDirIn } from "./envoymesh-home.js";

export const ENGINE_ROOT_MARKER_FILE = "engine-root.json";

/** Why a root was chosen — carried into the marker and the log, so it stays diagnosable. */
export type EngineRootReason = "shared" | "adopted-legacy";

export interface EngineRootMarker {
  /** Absolute path of the chosen asset root. */
  dir: string;
  reason: EngineRootReason;
  /** ISO timestamp, so a reader can tell when the machine made up its mind. */
  decidedAt: string;
}

/** `<home>/runtime/engine-root.json` — beside the assets it describes. */
export function engineRootMarkerPath(home: string): string {
  return path.join(runtimeDirIn(home), ENGINE_ROOT_MARKER_FILE);
}

export interface ResolveEngineRootInput {
  /** The node's profile directory — where assets lived before S4. */
  profileDir: string;
  /** Injectable for tests. */
  exists?: (candidate: string) => boolean;
  /** Read the recorded decision, or `null` when there is none (or it is unreadable). */
  readMarker?: (home: string) => EngineRootMarker | null;
  /**
   * Record the decision. The caller decides whether it can (an unwritable home must not break
   * startup) — this function never throws because of it.
   */
  writeMarker?: (home: string, marker: EngineRootMarker) => void;
  /** Injectable clock, so `decidedAt` is testable. */
  now?: () => Date;
}

export interface EngineRootResolution {
  dir: string;
  reason: EngineRootReason;
  /** True when this call chose the root (and recorded it) rather than reading an earlier answer. */
  decidedNow: boolean;
  /** The home the decision belongs to — the same one every process on this machine computes. */
  home: string;
}

/**
 * Resolve the engine asset root for a profile directory, stickily.
 *
 * The rule is unchanged from `localEngineAssetsDir` (the shared root when it exists, else the
 * legacy profile copy, else the shared root); what changes is that the first answer is
 * remembered, so a later process cannot compute a different one.
 */
export function resolveEngineRoot(input: ResolveEngineRootInput): EngineRootResolution {
  const exists = input.exists ?? existsSync;
  const home = homeForProfileDir(input.profileDir);
  const recorded = input.readMarker?.(home) ?? null;
  if (recorded?.dir) {
    // Obeyed whether or not it exists yet — see the note at the top of this file.
    return {
      dir: recorded.dir,
      reason: recorded.reason ?? "shared",
      decidedNow: false,
      home,
    };
  }

  // The rule itself lives in one place — `localEngineAssetsDir` — so the sticky layer cannot
  // drift from it. (It is also what the pre-record versions of this repo used directly.)
  const decision = localEngineAssetsDir({ profileDir: input.profileDir, exists });
  const dir = decision.dir;
  const reason: EngineRootReason = decision.adoptedLegacy ? "adopted-legacy" : "shared";
  input.writeMarker?.(home, {
    dir,
    reason,
    decidedAt: (input.now?.() ?? new Date()).toISOString(),
  });
  return { dir, reason, decidedNow: true, home };
}
