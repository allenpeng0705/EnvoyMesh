/**
 * The shared EnvoyMesh home — one place on a machine where the owner's profile
 * lives, so every EnvoyMesh-family product can find it.
 *
 * ## Why this module exists
 *
 * Before this, "where is my profile" had no answer a second product could use:
 * the node's default was `./data/default` — a path **relative to the working
 * directory** — and the desktop passes its own Tauri app-data directory. So two
 * products, or the same product started twice from different folders, silently
 * produced two identities, and nothing could tell which one was the owner's.
 *
 * Design: `docs/envoymesh-multi-product-design.md` §4–5. Decisions recorded there
 * that this module implements:
 *
 *   * one **common root** per machine, per-OS by convention, overridable;
 *   * `ENVOYMESH_HOME` wins over everything (scripted/dev use);
 *   * `%LOCALAPPDATA%` on Windows, **not** `%APPDATA%` — the root holds the owner
 *     private key (`profile.json` → `owner.privateKeyPem`) and roaming syncs it;
 *   * a marker file so an app can say *which* home it found and who created it;
 *   * a profile is recognized by the files the node already writes, and a
 *     **partial** profile is reported as damaged rather than replaced.
 *
 * Kernel/product split (which stores go where) is §5 of that document and belongs
 * to the callers; this module only resolves paths and reports what is on disk.
 */
import * as nodeFs from "node:fs";
import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { homedir as osHomedir, platform as osPlatform } from "node:os";
import path from "node:path";

/** Marker file that identifies a directory as an EnvoyMesh home. */
export const ENVOYMESH_HOME_MARKER = "envoymesh.json";
/** Directory inside the home that holds the identity and the kernel stores. */
export const ENVOYMESH_PROFILE_DIRNAME = "profile";
/** Directory inside the home for assets shared by products (e.g. a local engine). */
export const ENVOYMESH_RUNTIME_DIRNAME = "runtime";
/** Schema this build reads and writes. See {@link EnvoyMeshHomeMarker}. */
export const ENVOYMESH_HOME_SCHEMA = 1;
/** Pre-existing directory name used before the common root existed. */
export const LEGACY_HOME_DIRNAME = ".envoymesh";
/** Environment variable that overrides the root outright. */
export const HOME_ENV_VAR = "ENVOYMESH_HOME";

/**
 * Contents of {@link ENVOYMESH_HOME_MARKER}.
 *
 * `ownerId` is *recorded*, not trusted: it is copied from the signed human
 * profile so a discovery dialog can name the profile. Verification needs the
 * owner key and belongs to the loader, not here.
 */
export interface EnvoyMeshHomeMarker {
  schema: number;
  createdAt: string;
  ownerId?: string;
  lastUsedBy?: { app: string; version: string; at: string };
}

export interface ResolveHomeOptions {
  env?: NodeJS.ProcessEnv;
  /** Injectable for tests; defaults to `process.platform`. */
  platform?: NodeJS.Platform;
  /** Injectable for tests; defaults to `os.homedir()`. */
  homeDir?: string;
  /** Injectable for tests; defaults to `fs.existsSync`. */
  exists?: (candidate: string) => boolean;
}

function optionsWithDefaults(opts: ResolveHomeOptions = {}) {
  return {
    env: opts.env ?? process.env,
    platform: opts.platform ?? osPlatform(),
    homeDir: opts.homeDir ?? osHomedir(),
    exists: opts.exists ?? existsSync,
  };
}

/**
 * The conventional root for this OS.
 *
 * `LOCALAPPDATA` is deliberate on Windows: the root contains the owner private
 * key, and `APPDATA` (roaming) would sync it to a domain or cloud profile.
 */
export function defaultHomeDir(opts: ResolveHomeOptions = {}): string {
  const { env, platform, homeDir } = optionsWithDefaults(opts);
  if (platform === "win32") {
    const localAppData = env["LOCALAPPDATA"]?.trim();
    // Fall back to the conventional location rather than `homedir()`: on Windows
    // they differ, and writing the key into the profile root is the legacy layout.
    return path.join(
      localAppData && localAppData.length > 0
        ? localAppData
        : path.join(homeDir, "AppData", "Local"),
      "EnvoyMesh",
    );
  }
  if (platform === "darwin") {
    return path.join(homeDir, "Library", "Application Support", "EnvoyMesh");
  }
  // Linux and everything else: XDG data dir.
  const xdg = env["XDG_DATA_HOME"]?.trim();
  return path.join(xdg && xdg.length > 0 ? xdg : path.join(homeDir, ".local", "share"), "EnvoyMesh");
}

/** The pre-common-root location (`~/.envoymesh`). */
export function legacyHomeDir(opts: ResolveHomeOptions = {}): string {
  const { homeDir } = optionsWithDefaults(opts);
  return path.join(homeDir, LEGACY_HOME_DIRNAME);
}

/** True when a directory holds something that identifies it as an EnvoyMesh home. */
export function looksLikeHome(dir: string, exists: (p: string) => boolean = existsSync): boolean {
  return (
    exists(path.join(dir, ENVOYMESH_HOME_MARKER)) ||
    exists(path.join(dir, ENVOYMESH_PROFILE_DIRNAME)) ||
    exists(path.join(dir, "profile.json"))
  );
}

/**
 * Resolve the home directory.
 *
 * Precedence: `ENVOYMESH_HOME` → whichever of {per-OS default, legacy
 * `~/.envoymesh`} already looks like a home → the per-OS default.
 *
 * The legacy branch is what makes an existing install keep working instead of
 * silently starting a second identity; it is only consulted when the default
 * root does **not** already hold a home. Adopting (moving) legacy state is a
 * separate, user-visible decision — see the design's O4.
 */
export function resolveHomeDir(opts: ResolveHomeOptions = {}): string {
  const { env, exists } = optionsWithDefaults(opts);
  const override = env[HOME_ENV_VAR]?.trim();
  if (override) return path.resolve(override);

  const preferred = defaultHomeDir(opts);
  if (looksLikeHome(preferred, exists)) return preferred;
  const legacy = legacyHomeDir(opts);
  if (looksLikeHome(legacy, exists)) return legacy;
  return preferred;
}

/** `<home>/profile` — identity plus the kernel stores. */
export function profileDirIn(home: string): string {
  return path.join(home, ENVOYMESH_PROFILE_DIRNAME);
}

/** `<home>/<product>` — one product's own state (chats, repos, sessions, …). */
export function productDirIn(home: string, product: string): string {
  const name = product.trim();
  if (!name) throw new Error("productDirIn: product name is required");
  if (name.includes("/") || name.includes("\\") || name === "." || name === "..") {
    throw new Error(`productDirIn: invalid product name ${JSON.stringify(product)}`);
  }
  return path.join(home, name);
}

/** `<home>/runtime` — assets shared by products (e.g. a local model engine). */
export function runtimeDirIn(home: string): string {
  return path.join(home, ENVOYMESH_RUNTIME_DIRNAME);
}

/**
 * The home a given profile directory belongs to.
 *
 * `<home>/profile` → `<home>`; anything else is treated as a home in its own
 * right, which is how an explicit `ENVOYMESH_PROFILE=/some/dir` (or an older
 * checkout's `./data/default`) keeps its marker beside it rather than inventing
 * a parent.
 */
export function homeForProfileDir(profileDir: string): string {
  const resolved = path.resolve(profileDir);
  return path.basename(resolved) === ENVOYMESH_PROFILE_DIRNAME
    ? path.dirname(resolved)
    : resolved;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

/** Read the marker, or `null` when absent or unparseable. */
export async function readHomeMarker(home: string): Promise<EnvoyMeshHomeMarker | null> {
  let raw: string;
  try {
    raw = readFileSync(path.join(home, ENVOYMESH_HOME_MARKER), "utf8");
  } catch {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const record = asRecord(parsed);
  if (!record) return null;
  const schema = typeof record["schema"] === "number" ? record["schema"] : ENVOYMESH_HOME_SCHEMA;
  const marker: EnvoyMeshHomeMarker = {
    schema,
    createdAt: nonEmptyString(record["createdAt"]) ?? new Date(0).toISOString(),
  };
  const ownerId = nonEmptyString(record["ownerId"]);
  if (ownerId) marker.ownerId = ownerId;
  const used = asRecord(record["lastUsedBy"]);
  const app = nonEmptyString(used?.["app"]);
  const version = nonEmptyString(used?.["version"]);
  const at = nonEmptyString(used?.["at"]);
  if (app && version && at) marker.lastUsedBy = { app, version, at };
  return marker;
}

/**
 * Write the marker atomically (`tmp` + rename) with mode `0600`.
 *
 * The mode matters: this file names the owner and the apps that touched the
 * profile. The repo's convention is `0o600` for data files.
 */
export async function writeHomeMarker(home: string, marker: EnvoyMeshHomeMarker): Promise<void> {
  await mkdir(home, { recursive: true, mode: 0o700 });
  const target = path.join(home, ENVOYMESH_HOME_MARKER);
  const tmp = `${target}.tmp`;
  await writeFile(tmp, `${JSON.stringify(marker, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(tmp, target);
}

/**
 * Create the marker on first use and refresh `lastUsedBy` afterwards.
 *
 * `schema` never moves backwards: an older build touching a newer home keeps the
 * newer number rather than downgrading the file to something it does not
 * understand.
 *
 * `ownerId` is optional because it is not known until the profile has been
 * loaded — the node writes the marker first (so the root is claimed and named)
 * and records the owner on a second pass. An absent value never clears a recorded
 * one.
 */
export async function touchHomeMarker(
  home: string,
  used: { app: string; version: string; at?: string; ownerId?: string },
): Promise<{ marker: EnvoyMeshHomeMarker; created: boolean }> {
  const existing = await readHomeMarker(home);
  const ownerId = used.ownerId ?? existing?.ownerId;
  const marker: EnvoyMeshHomeMarker = {
    schema: Math.max(existing?.schema ?? ENVOYMESH_HOME_SCHEMA, ENVOYMESH_HOME_SCHEMA),
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    ...(ownerId ? { ownerId } : {}),
    lastUsedBy: {
      app: used.app,
      version: used.version,
      at: used.at ?? new Date().toISOString(),
    },
  };
  await writeHomeMarker(home, marker);
  return { marker, created: existing === null };
}

/**
 * Whether this build understands the marker it found.
 *
 * A home written by a *newer* build is not an error — the profile itself may be
 * perfectly readable — but the marker must not be treated as describing a layout
 * this build knows. The design's "refuse politely" rule (§4.4) is this predicate:
 * callers warn or stop, and only they know which is right.
 */
export function isHomeSchemaSupported(marker: EnvoyMeshHomeMarker | null | undefined): boolean {
  if (!marker) return true;
  return marker.schema <= ENVOYMESH_HOME_SCHEMA;
}

export type ProfileState = "missing" | "found" | "damaged";

export interface ProfileInspection {
  state: ProfileState;
  dir: string;
  /** Marker files that are absent. */
  missing: string[];
  /** Marker files that exist but could not be read/parsed. */
  unreadable: string[];
  /** Present in every state that has any marker: good for a discovery dialog. */
  ownerId?: string;
  displayName?: string;
  deviceId?: string;
  marker?: EnvoyMeshHomeMarker | null;
}

/**
 * What is on disk, as {@link ProfileState}.
 *
 * The three markers are the files the node already writes: `profile.json`
 * (owner + device + device certificate), `human-profile.json` (the signed human
 * profile) and `libp2p-private.key` (the peer identity).
 *
 * A **damaged** profile is reported, never replaced: creating a fresh identity
 * beside a partial one is how a user loses contacts and bonds without being told.
 * Nothing here verifies signatures — that is the loader's job, and it needs the
 * owner key.
 */
export async function inspectProfile(profileDir: string): Promise<ProfileInspection> {
  const dir = path.resolve(profileDir);
  // Identity is two files: the node profile (owner + device + certificate) and the peer
  // key. `human-profile.json` is the *social* profile, and it only exists once the owner
  // has filled one in — requiring it made a perfectly healthy fresh install report "the
  // profile looks incomplete" on first run, which is a scary thing to show someone who
  // has just installed the app. It is checked when present (a corrupt one *is* damage)
  // and its absence is simply "no display name yet".
  const required = ["profile.json", "libp2p-private.key"];
  const optionalJson = ["human-profile.json"];
  const missing: string[] = [];
  const unreadable: string[] = [];
  let profileJson: Record<string, unknown> | null = null;
  let humanJson: Record<string, unknown> | null = null;

  const { existsSync: exists } = nodeFs;
  if (!exists(dir)) {
    return { state: "missing", dir, missing: [...required], unreadable: [] };
  }

  for (const name of required) {
    const file = path.join(dir, name);
    if (!exists(file)) {
      missing.push(name);
      continue;
    }
    if (name.endsWith(".json")) {
      try {
        const parsed = asRecord(JSON.parse(readFileSync(file, "utf8")));
        if (!parsed) unreadable.push(name);
        else if (name === "profile.json") profileJson = parsed;
        else humanJson = parsed;
      } catch {
        unreadable.push(name);
      }
    }
  }

  // Optional markers: present-and-read gives a better name, present-and-broken is damage,
  // absent is normal.
  for (const name of optionalJson) {
    const file = path.join(dir, name);
    if (!exists(file)) continue;
    try {
      const parsed = asRecord(JSON.parse(readFileSync(file, "utf8")));
      if (!parsed) unreadable.push(name);
      else humanJson = parsed;
    } catch {
      unreadable.push(name);
    }
  }

  if (missing.length === required.length) {
    return { state: "missing", dir, missing, unreadable };
  }

  // Identity fields are reported in **every** state that has readable markers —
  // including `damaged`. "A damaged profile belonging to Alice" is what a
  // discovery dialog has to say; "a damaged profile" with no owner is not.
  const owner = asRecord(profileJson?.["owner"]);
  const device = asRecord(profileJson?.["device"]);
  const ownerId =
    nonEmptyString(humanJson?.["ownerId"]) ?? nonEmptyString(owner?.["ownerId"]);
  const displayName =
    nonEmptyString(humanJson?.["displayName"]) ?? nonEmptyString(owner?.["displayName"]);
  const deviceId = nonEmptyString(device?.["deviceId"]);

  return {
    state: missing.length > 0 || unreadable.length > 0 ? "damaged" : "found",
    dir,
    missing,
    unreadable,
    ...(ownerId ? { ownerId } : {}),
    ...(displayName ? { displayName } : {}),
    ...(deviceId ? { deviceId } : {}),
    marker: await readHomeMarker(homeForProfileDir(dir)),
  };
}

/** Create the root (and the profile directory) with owner-only permissions. */
export function ensureHomeDirs(home: string): void {
  // Root first: `recursive` gives an intermediate directory the default mode, and
  // this tree holds the owner private key. An existing directory keeps its mode.
  mkdirSync(home, { recursive: true, mode: 0o700 });
  mkdirSync(path.join(home, ENVOYMESH_PROFILE_DIRNAME), { recursive: true, mode: 0o700 });
}

/**
 * Where a product's **own** state lives (design §5): `<home>/<product>`.
 *
 * `profile/` holds the identity and the 14 kernel stores, which every app shares;
 * a product's 34-ish stores belong in its own directory, so a second product cannot read
 * or write them. That is what "safe to install next to EnvoyMesh" means concretely.
 *
 * ## The adoption rule, and why it is not optional
 *
 * Every install that exists today keeps its product state *inside* `profile/`. Moving it
 * without asking would be a data migration performed by a version upgrade, so this
 * resolves instead: if the legacy directory holds state and no product directory exists
 * yet, the legacy one is used and `adoptedLegacy` says so — the caller logs it, and the
 * move stays the user's decision. A product directory that *does* exist wins, because it
 * means the migration already ran.
 */
export function resolveProductStateDir(input: {
  home: string;
  product: string;
  /** The shared profile directory — where product state lived before §5. */
  legacyDir: string;
  /** True when the legacy directory actually holds this product's state. */
  legacyHasState: boolean;
  /** Injectable for tests. */
  exists?: (candidate: string) => boolean;
}): { dir: string; adoptedLegacy: boolean } {
  const exists = input.exists ?? existsSync;
  const own = productDirIn(input.home, input.product);
  if (exists(own)) return { dir: own, adoptedLegacy: false };
  if (input.legacyHasState) {
    return { dir: path.resolve(input.legacyDir), adoptedLegacy: true };
  }
  return { dir: own, adoptedLegacy: false };
}

/**
 * Entries that only the **kernel** writes into `profile/` — identity, the 14 kernel stores,
 * the audit trail and the local engine. Anything else in a profile directory is product state.
 *
 * This is an *allowlist of the kernel*, deliberately, rather than a list of product files:
 * see `profileDirHasProductState` for why the direction matters.
 */
export const KERNEL_PROFILE_ENTRIES: readonly string[] = [
  // Identity (§4.3) — its presence is what makes a directory a profile at all.
  "profile.json",
  "human-profile.json",
  "libp2p-private.key",
  // The kernel stores (inventory: 14 kernel / 34 product).
  "node-config.json",
  "capability-manifest.json",
  "device-authorization.json",
  "contact-owner-keys.json",
  "peer-profile-cache.json",
  "multihop-discovery-sessions.json",
  "discovery-seeds.json",
  "peer-reputation.json",
  "vault-sensitivity-overrides.json",
  "intent-history.json",
  "continuity-sessions.json",
  "capability-index.json",
  "agent-identity.json",
  "session-tokens.json",
  // local-store kernel files: audit, journal, approvals, trust, peer directory.
  "audit-events.jsonl",
  "task-journal.jsonl",
  "approval-queue.jsonl",
  "trust-records.json",
  "trust-store.json",
  "peer-directory.json",
  // The vault index lives with the identity (§5), so it is not product state.
  "rag-hnsw",
  "rag-vectors.json",
  "rag-vectors.sqlite",
  "rag-vault-manifest.json",
  // The local model engine is shared runtime, not product state (§8 / S4).
  "envoy-local",
  "runtime",
];

/**
 * Does this directory hold product state that would have to be *kept* if the layout changed?
 *
 * True when the directory contains an entry that is not a known kernel entry. The direction
 * of this test is the whole point:
 *
 *   * **Wrong answer "yes"** (adopting the legacy layout when there is no product state)
 *     costs nothing: the install keeps writing to `profile/`, which is exactly what it did
 *     before §5. The only loss is that this install does not get the new layout.
 *   * **Wrong answer "no"** (migrating when there *is* product state) leaves the user's
 *     chats/published content behind and points the stores at a new, empty directory.
 *
 * So the list above is the *kernel* allowlist, and the test is its complement: an unknown
 * kernel file makes us adopt unnecessarily (harmless), while an unknown product file cannot
 * make us migrate by mistake (which is the failure that loses data).
 *
 * An earlier version listed five *product* markers and got this backwards — two of them
 * (`node-config.json`, `audit-events.jsonl`) are kernel files written on a first run, so a
 * brand-new install would have been judged "legacy" and the migration would have looked
 * correct while doing nothing.
 */
export function profileDirHasProductState(
  dir: string,
  list: (candidate: string) => readonly string[] = (candidate) => readdirSync(candidate),
): boolean {
  let entries: readonly string[];
  try {
    entries = list(dir);
  } catch {
    // Unreadable or absent: nothing to preserve, so a new layout is safe.
    return false;
  }
  return entries.some(
    (name) => !name.startsWith(".") && !KERNEL_PROFILE_ENTRIES.includes(name),
  );
}

/**
 * Where the **local model engine** keeps its assets (design §8 / S4).
 *
 * One engine and one copy of the weights for the whole family: `llama-server` is a
 * multi-hundred-MB binary and a GGUF is multi-GB, so a per-profile copy means a second
 * product downloads all of it again. Assets therefore live under `<root>/runtime/`, shared
 * the way the kernel stores are.
 *
 * Adoption, for the third time and for the same reason: an install that already has
 * `{profile}/envoy-local/` keeps using it. Re-downloading gigabytes is a worse outcome than
 * a directory in the old place, and the caller logs which one is in use.
 */
export function localEngineAssetsDir(input: {
  /** The node's profile directory — where assets lived before S4. */
  profileDir: string;
  /** Injectable for tests. */
  exists?: (candidate: string) => boolean;
}): { dir: string; adoptedLegacy: boolean } {
  const exists = input.exists ?? existsSync;
  const shared = path.join(runtimeDirIn(homeForProfileDir(input.profileDir)), "envoy-local");
  const legacy = path.resolve(input.profileDir, "envoy-local");
  if (exists(shared)) return { dir: shared, adoptedLegacy: false };
  if (exists(legacy)) return { dir: legacy, adoptedLegacy: true };
  return { dir: shared, adoptedLegacy: false };
}
