/**
 * Default node-config.json bundled with the desktop app.
 *
 * The Tauri main.rs sets `ENVOYMESH_NODE_BUNDLE_DIR` to the bundled `node/`
 * directory, which is where this file lives. The runtime reads it as a
 * fallback when the profile dir has no `node-config.json` (i.e. first run
 * or after a profile reset). The profile dir's copy is the runtime source
 * of truth once written — it always takes precedence over the bundled one,
 * so a user who customizes their config via Settings → Network keeps their
 * settings across bundle updates.
 *
 * Why a bundled default (not just `createDefaultPersistedNodeConfig()`):
 * - The hardcoded default ships with empty `configuredRelays` and empty
 *   `bootstrapPresets`, so a fresh install sees the "first-run setup" log
 *   line and the libp2p mesh stays offline until the user manually opts in
 *   to a bootstrap preset via Settings. That UX is a 5-step walkthrough for
 *   "I just want the app to work."
 * - A bundled `node-config.json` lets us ship a sensible default (CN relay
 *   + standard bootstrap presets + `wan-default` profile) so a fresh install
 *   connects to the mesh on first launch. The user can still customize.
 * - Future bundle updates can ship new defaults (e.g. a different default
 *   relay) without touching the runtime code.
 *
 * Why no relative-path fallback (unlike the sponsor-friend loader):
 * The relative-path fallback ("walk up from this file's location and look
 * for node-config.json") would let a stray file at the repo root shadow the
 * hardcoded default in unit tests. With the fallback removed, tests get
 * the hardcoded `createDefaultPersistedNodeConfig()` default (lan-fast +
 * empty relays), and only an explicit `ENVOYMESH_BUNDLED_NODE_CONFIG_PATH`
 * / `ENVOYMESH_BUNDLED_NODE_CONFIG_JSON` / `bundleDir` arg activates the
 * bundled file. The Tauri main.rs always sets `ENVOYMESH_NODE_BUNDLE_DIR`,
 * so production is unaffected.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  isValidNodeConfig,
  type PersistedNodeConfig,
} from "./node-config-store.js";

const BUNDLED_FILENAME = "node-config.json";

function bundledNodeConfigCandidates(bundleDir?: string): string[] {
  const candidates: string[] = [];
  if (bundleDir?.trim()) {
    candidates.push(join(bundleDir.trim(), BUNDLED_FILENAME));
  }
  return candidates;
}

/**
 * Try to read the bundled `node-config.json`. Returns the parsed config on
 * success, or `null` if the file is missing, unreadable, or invalid (e.g.
 * a future-bundled config with a new schema version). The caller falls back
 * to `createDefaultPersistedNodeConfig()` in that case.
 *
 * Profile-dir override takes precedence — the caller reads
 * `<profileDir>/node-config.json` first and only calls this loader when
 * the profile dir has no copy.
 */
export async function loadBundledNodeConfig(
  bundleDir?: string,
): Promise<PersistedNodeConfig | null> {
  const envPath = process.env.ENVOYMESH_BUNDLED_NODE_CONFIG_PATH?.trim();
  if (envPath) {
    try {
      const raw = await readFile(envPath, "utf8");
      const parsed = JSON.parse(raw) as unknown;
      if (isValidNodeConfig(parsed)) {
        return parsed as PersistedNodeConfig;
      }
    } catch {
      // fall through to candidates
    }
  }

  const envJson = process.env.ENVOYMESH_BUNDLED_NODE_CONFIG_JSON?.trim();
  if (envJson) {
    try {
      const parsed = JSON.parse(envJson) as unknown;
      if (isValidNodeConfig(parsed)) {
        return parsed as PersistedNodeConfig;
      }
    } catch {
      // fall through
    }
  }

  for (const path of bundledNodeConfigCandidates(bundleDir)) {
    try {
      const raw = await readFile(path, "utf8");
      const parsed = JSON.parse(raw) as unknown;
      if (isValidNodeConfig(parsed)) {
        return parsed as PersistedNodeConfig;
      }
    } catch {
      // try next candidate
    }
  }
  return null;
}

/** Test helper — reset module-level state. No state to reset today; kept for symmetry with other loaders. */
export function resetBundledNodeConfigCache(): void {
  // No cache yet; the loader reads from disk each call. If we add caching,
  // reset here.
}

/** Test helper — expose candidate paths. */
export function _bundledNodeConfigCandidatesForTests(bundleDir?: string): string[] {
  return bundledNodeConfigCandidates(bundleDir);
}
