/**
 * The engine asset root for this process — the app's half of `resolveEngineRoot` (§8 / S4).
 *
 * `@envoymesh/node-core` owns the decision (shared `<home>/runtime/envoy-local`, or the legacy
 * `{profile}/envoy-local`, recorded so every process agrees). This module owns the two things
 * the package cannot know: **where** the marker is written, and what an unconfigured profile
 * looks like — a host with no profile must not create `<sentinel>/runtime/engine-root.json`,
 * which would be a real directory (`/tmp/unknown`) that the next run would then adopt.
 *
 * Both runtimes resolve their engine root here, and so does the process-exit handler that
 * releases the spawn claim: if those two disagreed about the root, the release would target a
 * lock file that can never exist — which is exactly the bug this pairing fixes.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  type EngineRootMarker,
  type EngineRootReason,
  engineRootMarkerPath,
  resolveEngineRoot,
} from "@envoymesh/node-core";
import { hasProfileDir } from "./product-store-availability.js";

/** Read the recorded decision, or `null` when there is none or it is unreadable. */
function readMarker(home: string): EngineRootMarker | null {
  try {
    const parsed = JSON.parse(readFileSync(engineRootMarkerPath(home), "utf8")) as EngineRootMarker;
    return typeof parsed?.dir === "string" && parsed.dir.length > 0 ? parsed : null;
  } catch {
    return null;
  }
}

/** Record the decision. Best-effort: a read-only home must still start an engine. */
function writeMarker(home: string, marker: EngineRootMarker): void {
  try {
    const file = engineRootMarkerPath(home);
    mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
    writeFileSync(file, `${JSON.stringify(marker, null, 2)}\n`, { mode: 0o600 });
  } catch {
    /* the decision still holds for this process; the next one re-decides */
  }
}

export interface AppEngineRoot {
  dir: string;
  reason: EngineRootReason;
  home: string;
  /** True when this process made the decision rather than reading an earlier one. */
  decidedNow: boolean;
}

let announced: string | null = null;

/**
 * Resolve the engine asset root, remembering the decision in the home.
 *
 * An unconfigured profile gets the sentinel-relative path (as before) and no marker: there is
 * no home to record it in, and the caller is going to fail with a typed product-store error
 * anyway rather than start an engine.
 */
export function engineRootFor(profileDir: string | null | undefined): AppEngineRoot {
  if (!hasProfileDir(profileDir)) {
    const resolution = resolveEngineRoot({ profileDir: profileDir ?? "/tmp", readMarker: () => null });
    return {
      dir: resolution.dir,
      reason: resolution.reason,
      home: resolution.home,
      decidedNow: false,
    };
  }
  const resolution = resolveEngineRoot({
    profileDir,
    readMarker,
    writeMarker,
  });
  announceEngineRoot(resolution);
  return resolution;
}

/**
 * Say it once per process. A mismatch between two products shows up here as two different
 * paths in two logs, which is the whole reason the decision is written down.
 */
function announceEngineRoot(resolution: AppEngineRoot): void {
  if (announced === resolution.dir) return;
  announced = resolution.dir;
  const verb = resolution.decidedNow ? "decided" : "using the recorded decision";
  console.log(
    `[engine] shared engine assets: ${resolution.dir} (${resolution.reason}, ${verb})`,
  );
}

/** Test seam: forget the once-per-process announcement. */
export function resetEngineRootAnnouncement(): void {
  announced = null;
}
