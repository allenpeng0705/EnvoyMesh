/**
 * The shared EnvoyMesh home — resolution, marker and profile detection.
 *
 * These are the rules a second product depends on to find the owner's profile
 * *without* inventing a second identity, so each one is pinned here rather than
 * left to a convention: the per-OS default, the `ENVOYMESH_HOME` override, the
 * legacy `~/.envoymesh` adoption, and the three detection states.
 *
 * Design: `docs/envoymesh-multi-product-design.md` §4–5.
 */

import { chmodSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ENVOYMESH_HOME_MARKER,
  ENVOYMESH_HOME_SCHEMA,
  HOME_ENV_VAR,
  defaultHomeDir,
  ensureHomeDirs,
  homeForProfileDir,
  inspectProfile,
  legacyHomeDir,
  productDirIn,
  profileDirIn,
  readHomeMarker,
  profileDirHasProductState,
  resolveHomeDir,
  resolveProductStateDir,
  runtimeDirIn,
  touchHomeMarker,
  writeHomeMarker,
} from "../src/envoymesh-home.js";

let tmpRoot: string;

beforeEach(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "envoymesh-home-"));
});

afterEach(async () => {
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

describe("defaultHomeDir", () => {
  it("uses the per-OS convention, with LOCALAPPDATA on Windows", () => {
    const home = "/Users/alice";
    expect(defaultHomeDir({ platform: "darwin", homeDir: home, env: {} })).toBe(
      "/Users/alice/Library/Application Support/EnvoyMesh",
    );
    // Roaming (`APPDATA`) is deliberately not used: this tree holds the owner key.
    expect(
      defaultHomeDir({
        platform: "win32",
        homeDir: "C:\\Users\\alice",
        env: { LOCALAPPDATA: "C:\\Users\\alice\\AppData\\Local", APPDATA: "C:\\Users\\alice\\AppData\\Roaming" },
      }),
    ).toBe(path.join("C:\\Users\\alice\\AppData\\Local", "EnvoyMesh"));
    expect(
      defaultHomeDir({ platform: "win32", homeDir: "C:\\Users\\alice", env: {} }),
    ).toBe(path.join("C:\\Users\\alice", "AppData", "Local", "EnvoyMesh"));
    expect(defaultHomeDir({ platform: "linux", homeDir: home, env: {} })).toBe(
      path.join("/Users/alice", ".local", "share", "EnvoyMesh"),
    );
    expect(
      defaultHomeDir({ platform: "linux", homeDir: home, env: { XDG_DATA_HOME: "/data" } }),
    ).toBe(path.join("/data", "EnvoyMesh"));
  });
});

describe("resolveHomeDir", () => {
  it("prefers ENVOYMESH_HOME over everything, and resolves it", () => {
    const explicit = path.join(tmpRoot, "custom", "..", "custom");
    expect(
      resolveHomeDir({
        platform: "darwin",
        homeDir: tmpRoot,
        env: { [HOME_ENV_VAR]: explicit },
        exists: () => true,
      }),
    ).toBe(path.join(tmpRoot, "custom"));
  });

  it("falls back to the per-OS default when nothing exists yet", () => {
    expect(
      resolveHomeDir({ platform: "darwin", homeDir: tmpRoot, env: {}, exists: () => false }),
    ).toBe(path.join(tmpRoot, "Library", "Application Support", "EnvoyMesh"));
  });

  it("adopts a legacy ~/.envoymesh that holds a profile", async () => {
    const legacy = legacyHomeDir({ homeDir: tmpRoot, env: {} });
    mkdirSync(path.join(legacy, "profile"), { recursive: true });
    // A legacy directory with *content* is adopted; an empty one is not.
    expect(resolveHomeDir({ platform: "darwin", homeDir: tmpRoot, env: {} })).toBe(legacy);
    expect(
      resolveHomeDir({
        platform: "darwin",
        homeDir: tmpRoot,
        env: {},
        exists: () => false,
      }),
    ).toBe(path.join(tmpRoot, "Library", "Application Support", "EnvoyMesh"));
  });

  it("prefers a real home at the default root over the legacy one", async () => {
    const preferred = defaultHomeDir({ platform: "darwin", homeDir: tmpRoot, env: {} });
    const legacy = legacyHomeDir({ homeDir: tmpRoot, env: {} });
    mkdirSync(preferred, { recursive: true });
    writeFileSync(path.join(preferred, ENVOYMESH_HOME_MARKER), "{}\n");
    mkdirSync(path.join(legacy, "profile"), { recursive: true });
    expect(resolveHomeDir({ platform: "darwin", homeDir: tmpRoot, env: {} })).toBe(preferred);
  });
});

describe("path helpers", () => {
  it("places the profile, product state and runtime inside the home", () => {
    const home = "/home/alice/envoymesh";
    expect(profileDirIn(home)).toBe(path.join(home, "profile"));
    expect(productDirIn(home, "EnvoyCoder")).toBe(path.join(home, "EnvoyCoder"));
    expect(runtimeDirIn(home)).toBe(path.join(home, "runtime"));
  });

  it("refuses a product name that would escape the home", () => {
    expect(() => productDirIn("/home", "../etc")).toThrow(/invalid product name/);
    expect(() => productDirIn("/home", "a/b")).toThrow(/invalid product name/);
    expect(() => productDirIn("/home", "  ")).toThrow(/required/);
  });

  it("maps a `<home>/profile` back to its home, and anything else to itself", () => {
    expect(homeForProfileDir("/home/alice/envoymesh/profile")).toBe("/home/alice/envoymesh");
    // An explicit ENVOYMESH_PROFILE (or an old checkout's ./data/default) keeps its
    // marker beside it rather than inventing a parent.
    expect(homeForProfileDir("/tmp/scratch")).toBe("/tmp/scratch");
    expect(homeForProfileDir("data/default")).toBe(path.resolve("data/default"));
  });

  it("creates the root with owner-only permissions", () => {
    const home = path.join(tmpRoot, "made");
    ensureHomeDirs(home);
    expect(statSync(home).isDirectory()).toBe(true);
    expect(statSync(path.join(home, "profile")).isDirectory()).toBe(true);
    if (process.platform !== "win32") {
      expect(statSync(home).mode & 0o777).toBe(0o700);
    }
  });
});

describe("the home marker", () => {
  it("round-trips, is created once, and keeps the newer schema", async () => {
    const home = path.join(tmpRoot, "marker-home");
    expect(await readHomeMarker(home)).toBeNull();

    const first = await touchHomeMarker(home, { app: "EnvoyMesh", version: "0.5.0" });
    expect(first.created).toBe(true);
    expect(first.marker.schema).toBe(ENVOYMESH_HOME_SCHEMA);
    expect(first.marker.lastUsedBy).toMatchObject({ app: "EnvoyMesh", version: "0.5.0" });

    // A different app finds the same marker and only refreshes lastUsedBy.
    const second = await touchHomeMarker(home, { app: "EnvoyCoder", version: "1.0.0" });
    expect(second.created).toBe(false);
    expect(second.marker.createdAt).toBe(first.marker.createdAt);
    expect(second.marker.lastUsedBy).toMatchObject({ app: "EnvoyCoder", version: "1.0.0" });

    const read = await readHomeMarker(home);
    expect(read?.lastUsedBy?.app).toBe("EnvoyCoder");
  });

  it("never downgrades a newer schema", async () => {
    const home = path.join(tmpRoot, "future-home");
    await writeHomeMarker(home, {
      schema: ENVOYMESH_HOME_SCHEMA + 1,
      createdAt: new Date().toISOString(),
    });
    const touched = await touchHomeMarker(home, { app: "EnvoyMesh", version: "0.5.0" });
    expect(touched.marker.schema).toBe(ENVOYMESH_HOME_SCHEMA + 1);
  });

  it("writes 0600 and survives a corrupt marker by reporting null", async () => {
    const home = path.join(tmpRoot, "perms-home");
    await touchHomeMarker(home, { app: "EnvoyMesh", version: "0.5.0" });
    const file = path.join(home, ENVOYMESH_HOME_MARKER);
    if (process.platform !== "win32") {
      expect(statSync(file).mode & 0o777).toBe(0o600);
    }
    expect(readFileSync(file, "utf8")).toContain('"schema"');

    chmodSync(file, 0o600);
    writeFileSync(file, "{ this is not json");
    expect(await readHomeMarker(home)).toBeNull();
  });

  it("tolerates a marker with missing or wrong-typed fields", async () => {
    const home = path.join(tmpRoot, "loose-home");
    mkdirSync(home, { recursive: true });
    writeFileSync(
      path.join(home, ENVOYMESH_HOME_MARKER),
      JSON.stringify({ schema: "one", createdAt: 42, lastUsedBy: { app: "x" } }),
    );
    const marker = await readHomeMarker(home);
    expect(marker?.schema).toBe(ENVOYMESH_HOME_SCHEMA);
    expect(marker?.lastUsedBy).toBeUndefined();
  });
});

describe("inspectProfile", () => {
  function writeProfile(dir: string, files: Record<string, string>): void {
    mkdirSync(dir, { recursive: true });
    for (const [name, content] of Object.entries(files)) {
      writeFileSync(path.join(dir, name), content);
    }
  }

  const COMPLETE = {
    "profile.json": JSON.stringify({ owner: { ownerId: "envoy:owner:abc" }, device: { deviceId: "envoy:device:def" } }),
    "human-profile.json": JSON.stringify({ ownerId: "envoy:owner:abc", displayName: "Alice" }),
    "libp2p-private.key": "-----BEGIN PRIVATE KEY-----\n",
  };

  it("reports a missing profile when the directory does not exist", async () => {
    const result = await inspectProfile(path.join(tmpRoot, "nope"));
    expect(result.state).toBe("missing");
    // Identity is the node profile + the peer key; `human-profile.json` is optional now
    // (see the fresh-profile test below), so it is not in the missing list.
    expect(result.missing).toEqual(["profile.json", "libp2p-private.key"]);
  });

  it("reports an empty directory as missing, not damaged", async () => {
    const dir = path.join(tmpRoot, "empty-profile");
    mkdirSync(dir, { recursive: true });
    const result = await inspectProfile(dir);
    expect(result.state).toBe("missing");
    expect(result.unreadable).toEqual([]);
  });

  it("finds a complete profile and reports who it belongs to", async () => {
    const dir = path.join(tmpRoot, "good-profile");
    writeProfile(dir, COMPLETE);
    const result = await inspectProfile(dir);
    expect(result.state).toBe("found");
    expect(result.ownerId).toBe("envoy:owner:abc");
    expect(result.displayName).toBe("Alice");
    expect(result.deviceId).toBe("envoy:device:def");
    expect(result.missing).toEqual([]);
  });

  it("reports a partial profile as damaged, naming what is absent", async () => {
    const dir = path.join(tmpRoot, "partial-profile");
    const { ["libp2p-private.key"]: _omitted, ...partial } = COMPLETE;
    writeProfile(dir, partial);
    const result = await inspectProfile(dir);
    expect(result.state).toBe("damaged");
    expect(result.missing).toEqual(["libp2p-private.key"]);
    expect(result.ownerId).toBe("envoy:owner:abc");
  });

  it("treats a profile without a social profile as found, not damaged", async () => {
    // `human-profile.json` only exists once the owner has filled one in, so requiring it
    // made a healthy fresh install report "the profile looks incomplete" on first run —
    // found by running the node twice and reading its own output. Identity is
    // `profile.json` plus the peer key; the social profile is a display name.
    const dir = path.join(tmpRoot, "fresh-profile");
    const { ["human-profile.json"]: _unused, ...identityOnly } = COMPLETE;
    writeProfile(dir, identityOnly);
    const result = await inspectProfile(dir);
    expect(result.state).toBe("found");
    expect(result.missing).toEqual([]);
    expect(result.ownerId).toBe("envoy:owner:abc");
    expect(result.displayName).toBeUndefined();
  });

  it("still reports a corrupt social profile as damage", async () => {
    const dir = path.join(tmpRoot, "broken-human-profile");
    writeProfile(dir, { ...COMPLETE, "human-profile.json": "{ truncated" });
    const result = await inspectProfile(dir);
    expect(result.state).toBe("damaged");
    expect(result.unreadable).toEqual(["human-profile.json"]);
  });

  it("reports an unparseable marker as damaged rather than missing", async () => {
    const dir = path.join(tmpRoot, "broken-profile");
    writeProfile(dir, { ...COMPLETE, "profile.json": "{ truncated" });
    const result = await inspectProfile(dir);
    expect(result.state).toBe("damaged");
    expect(result.unreadable).toEqual(["profile.json"]);
    expect(result.missing).toEqual([]);
  });

describe("resolveProductStateDir (§5 layout)", () => {
  const HOME = "/home/alice/envoymesh";
  const LEGACY = "/home/alice/envoymesh/profile";

  it("gives a fresh install its own directory", () => {
    const result = resolveProductStateDir({
      home: HOME,
      product: "EnvoyMesh",
      legacyDir: LEGACY,
      legacyHasState: false,
      exists: () => false,
    });
    expect(result).toEqual({ dir: path.join(HOME, "EnvoyMesh"), adoptedLegacy: false });
  });

  it("adopts the pre-§5 location for an existing install, and says so", () => {
    // Every install that exists today keeps product state inside `profile/`. Moving it
    // silently would be a data migration performed by a version upgrade, so the resolve
    // adopts it and reports — the move stays the user's decision.
    const result = resolveProductStateDir({
      home: HOME,
      product: "EnvoyMesh",
      legacyDir: LEGACY,
      legacyHasState: true,
      exists: () => false,
    });
    expect(result).toEqual({ dir: LEGACY, adoptedLegacy: true });
  });

  it("prefers a product directory that already exists — the migration ran", () => {
    const result = resolveProductStateDir({
      home: HOME,
      product: "EnvoyMesh",
      legacyDir: LEGACY,
      legacyHasState: true,
      exists: (candidate) => candidate === path.join(HOME, "EnvoyMesh"),
    });
    expect(result).toEqual({ dir: path.join(HOME, "EnvoyMesh"), adoptedLegacy: false });
  });

  it("rejects a product name that would escape the home", () => {
    expect(() =>
      resolveProductStateDir({
        home: HOME,
        product: "../other",
        legacyDir: LEGACY,
        legacyHasState: false,
      }),
    ).toThrow(/invalid product name/);
  });

  it("recognises a profile that holds product state, and one that does not", async () => {
    const bare = path.join(tmpRoot, "bare-profile");
    ensureHomeDirs(tmpRoot);
    mkdirSync(bare, { recursive: true });
    writeFileSync(path.join(bare, "profile.json"), "{}"); // kernel identity only
    writeFileSync(path.join(bare, "libp2p-private.key"), "k");
    expect(profileDirHasProductState(bare)).toBe(false);

    const used = path.join(tmpRoot, "used-profile");
    mkdirSync(used, { recursive: true });
    writeFileSync(path.join(used, "family-profiles.json"), "{}");
    expect(profileDirHasProductState(used)).toBe(true);
  });
});
});
