/**
 * The engine asset root, and the pid-reuse guard built on process start times (§8 / S4).
 *
 * The first half is the race the sticky marker exists for: `localEngineAssetsDir` answers from
 * `exists()`, so two processes asking at different moments could get different roots — and
 * therefore different lock files for the same engine port. The tests below drive exactly that
 * sequence (decide → the other directory appears → ask again) and require the same answer.
 *
 * The second half is `processStartedAt`, whose whole job is to be *right* on this machine: it
 * is checked against real processes, not only against injected values.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ENGINE_ROOT_MARKER_FILE,
  type EngineRootMarker,
  engineRootMarkerPath,
  parsePsElapsedSeconds,
  processStartedAt,
  resolveEngineRoot,
} from "../src/index.js";
import { currentProcessStartedAt } from "../src/engine-lock.js";

const roots: string[] = [];

function tempHome(): { home: string; profile: string; shared: string; legacy: string } {
  const home = mkdtempSync(join(tmpdir(), "envoy-engine-root-"));
  roots.push(home);
  const profile = join(home, "profile");
  mkdirSync(profile, { recursive: true });
  return {
    home,
    profile,
    shared: join(home, "runtime", "envoy-local"),
    legacy: join(profile, "envoy-local"),
  };
}

/** A tiny in-memory "disk" so the race is expressible without touching the filesystem. */
function memoryFs() {
  const dirs = new Set<string>();
  const markers = new Map<string, EngineRootMarker>();
  return {
    dirs,
    markers,
    exists: (candidate: string) => dirs.has(candidate),
    readMarker: (home: string) => markers.get(home) ?? null,
    writeMarker: (home: string, marker: EngineRootMarker) => {
      markers.set(home, marker);
    },
  };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("resolveEngineRoot", () => {
  it("puts a fresh install on the shared root and records the decision", () => {
    const { home, profile, shared } = tempHome();
    const fs = memoryFs();
    const first = resolveEngineRoot({ profileDir: profile, ...fs });
    expect(first.dir).toBe(shared);
    expect(first.reason).toBe("shared");
    expect(first.decidedNow).toBe(true);
    expect(fs.markers.get(home)?.dir).toBe(shared);
    expect(fs.markers.get(home)?.decidedAt).toMatch(/^\d{4}-/);
  });

  it("adopts a legacy profile copy, and records that instead", () => {
    const { profile, legacy } = tempHome();
    const fs = memoryFs();
    fs.dirs.add(legacy);
    const first = resolveEngineRoot({ profileDir: profile, ...fs });
    expect(first.dir).toBe(legacy);
    expect(first.reason).toBe("adopted-legacy");
  });

  it("keeps the recorded answer when the other directory appears later (the race)", () => {
    const { profile, shared, legacy } = tempHome();
    const fs = memoryFs();
    fs.dirs.add(legacy);
    // Process A: legacy assets only → adopts the legacy copy and records it.
    expect(resolveEngineRoot({ profileDir: profile, ...fs }).dir).toBe(legacy);
    // Something creates the shared root afterwards (a second product, a different profile).
    fs.dirs.add(shared);
    // Process B: without the marker this would now resolve `shared` — a different lock file for
    // the same engine port, so neither process can see the other's claim. It must not.
    const second = resolveEngineRoot({ profileDir: profile, ...fs });
    expect(second.dir).toBe(legacy);
    expect(second.decidedNow).toBe(false);
  });

  it("keeps the recorded shared answer even if a legacy directory appears later", () => {
    const { profile, shared, legacy } = tempHome();
    const fs = memoryFs();
    fs.dirs.add(shared);
    expect(resolveEngineRoot({ profileDir: profile, ...fs }).dir).toBe(shared);
    fs.dirs.add(legacy);
    expect(resolveEngineRoot({ profileDir: profile, ...fs }).dir).toBe(shared);
  });

  it("obeys a recorded directory that does not exist yet (a fresh install's normal state)", () => {
    // The shared root is created by the first download, *after* the decision is written. If a
    // missing directory invalidated the decision, every resolution until that download would
    // re-decide — reopening the race during exactly the window this marker closes.
    const { home, profile } = tempHome();
    const fs = memoryFs(); // no dirs at all: nothing exists yet
    const first = resolveEngineRoot({ profileDir: profile, ...fs });
    expect(first.decidedNow).toBe(true);
    const second = resolveEngineRoot({ profileDir: profile, ...fs });
    expect(second.dir).toBe(first.dir);
    expect(second.decidedNow).toBe(false);
    expect(fs.markers.get(home)?.dir).toBe(first.dir);
  });

  it("changes the decision only when the marker is removed (the explicit act)", () => {
    const { home, profile, shared, legacy } = tempHome();
    const fs = memoryFs();
    fs.dirs.add(legacy);
    expect(resolveEngineRoot({ profileDir: profile, ...fs }).dir).toBe(legacy);

    // Deleting the marker is how a user (or a script) moves the assets; the next resolution
    // then takes a fresh decision, which now prefers the shared root.
    fs.markers.delete(home);
    fs.dirs.add(shared);
    const after = resolveEngineRoot({ profileDir: profile, ...fs });
    expect(after.dir).toBe(shared);
    expect(after.decidedNow).toBe(true);
  });

  it("works with no marker IO at all (a read-only home still starts an engine)", () => {
    const { profile, shared } = tempHome();
    const resolution = resolveEngineRoot({ profileDir: profile, exists: () => false });
    expect(resolution.dir).toBe(shared);
    expect(resolution.decidedNow).toBe(true);
  });

  it("writes the marker beside the assets it describes", () => {
    const { home } = tempHome();
    expect(engineRootMarkerPath(home)).toBe(
      join(home, "runtime", ENGINE_ROOT_MARKER_FILE),
    );
  });

  it("survives an unreadable marker by re-deciding", () => {
    const { profile, shared } = tempHome();
    const resolution = resolveEngineRoot({
      profileDir: profile,
      exists: () => false,
      readMarker: () => null, // unreadable reads as absent
    });
    expect(resolution.dir).toBe(shared);
    expect(resolution.decidedNow).toBe(true);
  });
});

describe("parsePsElapsedSeconds", () => {
  it("parses the three shapes `ps -o etime=` produces", () => {
    expect(parsePsElapsedSeconds("00:05")).toBe(5);
    expect(parsePsElapsedSeconds("01:02")).toBe(62);
    expect(parsePsElapsedSeconds("01:02:03")).toBe(3_723);
    expect(parsePsElapsedSeconds("2-01:02:03")).toBe(2 * 86_400 + 3_723);
    expect(parsePsElapsedSeconds("03-23:05:43")).toBe(3 * 86_400 + 23 * 3_600 + 5 * 60 + 43);
    expect(parsePsElapsedSeconds(" 00:07\n")).toBe(7);
  });

  it("refuses anything that is not an elapsed time", () => {
    for (const bad of ["", "   ", "Sun Sep 13 20:48:20 2026", "1:2:3:4", "abc", "-5"]) {
      expect(parsePsElapsedSeconds(bad), bad).toBeNull();
    }
  });
});

describe("processStartedAt", () => {
  it("reads a real process's start time on this platform", () => {
    const actual = processStartedAt(process.pid);
    if (process.platform === "win32") {
      // Documented gap: no cheap equivalent, so the guard falls back to pid liveness there.
      expect(actual).toBeNull();
      return;
    }
    expect(actual, "a real start time is required for the pid-reuse guard").not.toBeNull();
    // Both are estimates of the same instant: /proc is exact, `ps -o etime=` is good to a
    // second. A minute of slack keeps the assertion about correctness, not about scheduling.
    expect(Math.abs((actual as number) - currentProcessStartedAt())).toBeLessThan(60_000);
  });

  it("returns null rather than guessing when the OS has no answer", () => {
    expect(processStartedAt(process.pid, { elapsed: () => null })).toBeNull();
    expect(processStartedAt(process.pid, { elapsed: () => "not a time" })).toBeNull();
    expect(processStartedAt(-1)).toBeNull();
    expect(processStartedAt(0)).toBeNull();
  });

  it("subtracts the elapsed time from now, which is what makes it comparable", () => {
    const now = 1_700_000_000_000;
    const started = processStartedAt(process.pid, { elapsed: () => "00:30", now });
    if (process.platform === "linux" || process.platform === "win32") return; // platform-specific path
    expect(started).toBe(now - 30_000);
  });
});
