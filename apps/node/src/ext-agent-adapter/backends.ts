import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import type { ExtAgentBackend, ExtAgentSidecarKind } from "./types.js";
// Phase 55B — codex backend. Imported at the top so the sidecar
// factory can hand it out without a dynamic import; the codex
// module is small (~700 LOC) and tree-shake friendly.
import { createCodexBackend } from "./codex-backend.js";
// Phase 55C — claudecode backend. In-process
// `@anthropic-ai/claude-agent-sdk`; the SDK module itself is lazy
// (only loaded on first `ask()` / `probe()` / `start()`) so a missing
// install surfaces a clear error at runtime, not at boot.
import { createClaudeCodeBackend } from "./claudecode-backend.js";
// Phase 55E — optional autostart wrappers for hermes / openhuman.
// Toggled via `ENVOYMESH_EXT_AGENT_AUTOSTART=1` (default off). When
// enabled, the supervised backends spawn the daemon lazily on the
// first `ask()` if it isn't already running. When disabled, the
// default HTTP backends (this file) are used unchanged — they
// assume the daemon is already running.
import { createHermesSupervisedBackend } from "./supervised-hermes-backend.js";
// OpenHuman uses the HTTP backend only (OpenHuman.app). Supervised
// spawn of openhuman-core was removed from the product path.
// Phase 56A — Cursor CLI (Anysphere) one-shot subprocess per ask
// via the shared `OneShotCliBackend` base. Phase 56B (aider) and
// 56C (mmx) follow the same pattern.
import { createCursorAgentBackend } from "./cursor-agent-backend.js";
import { createAiderBackend } from "./aider-backend.js";
import { createMmxBackend } from "./mmx-backend.js";
import { getExtAgentSessionModel } from "./session-model-store.js";
import {
  fetchOpenAiCompatibleModels,
  type ExtAgentModelListEntry,
} from "./model-list.js";

/**
 * Phase 55E — when `true`, `createBackend("hermes")` returns a
 * supervised backend that can spawn `hermes gateway run` on demand
 * (probe-first: reuses an already-running gateway).
 *
 * OpenHuman is **not** supervised: use OpenHuman.app only.
 *
 * Default: `true` for Hermes. Force off with
 * `ENVOYMESH_EXT_AGENT_AUTOSTART=0|false|off`.
 */
function isAutostartEnabled(): boolean {
  const v = process.env.ENVOYMESH_EXT_AGENT_AUTOSTART?.trim().toLowerCase();
  if (v === "0" || v === "false" || v === "no" || v === "off") return false;
  if (v === "1" || v === "true" || v === "yes" || v === "on") return true;
  return true;
}

/** OpenHuman auth-profile provider id for the stable `/v1` bearer. */
export const OPENHUMAN_EXTERNAL_V1_PROVIDER = "external-openai-compat";
const OPENHUMAN_EXTERNAL_V1_PROFILE = `${OPENHUMAN_EXTERNAL_V1_PROVIDER}:default`;

const HERMES_TIMEOUT_MS = 280_000;
const OPENHUMAN_TIMEOUT_MS = 280_000;

/** Parse a single KEY from a dotenv-style file (no expansion). */
export function readDotEnvKey(fileContents: string, key: string): string | undefined {
  const re = new RegExp(`^\\s*${key}\\s*=\\s*(.*)$`, "m");
  const m = fileContents.match(re);
  if (!m) return undefined;
  let v = m[1].trim();
  if (!v || v.startsWith("#")) return undefined;
  const q = v[0];
  if (q === '"' || q === "'") {
    const end = v.indexOf(q, 1);
    if (end > 0) return v.slice(1, end) || undefined;
  }
  const hash = v.indexOf(" #");
  if (hash >= 0) v = v.slice(0, hash).trim();
  return v.trim() || undefined;
}

/** Unique, non-empty path list helper. */
function pushPath(out: string[], p: string | undefined): void {
  const t = p?.trim();
  if (t && !out.includes(t)) out.push(t);
}

/**
 * Home-directory candidates across OS / shells.
 *
 * `os.homedir()` is primary; also honor `HOME` / `USERPROFILE` when present
 * (Windows Node, Git Bash, WSL, service accounts).
 */
export function homeDirCandidates(env: NodeJS.ProcessEnv = process.env): string[] {
  const out: string[] = [];
  pushPath(out, homedir());
  pushPath(out, env.HOME);
  pushPath(out, env.USERPROFILE);
  return out;
}

/**
 * Candidate Hermes `.env` paths (best-effort — home is not fixed across OS / installers).
 *
 * Order:
 * 1. `HERMES_ENV_FILE` — explicit file override
 * 2. `$HERMES_HOME/.env` — Hermes’s own home override (Windows installer sets this)
 * 3. `~/.hermes/.env` (+ `USERPROFILE` / `HOME` variants) — Linux / macOS / WSL / Windows home
 * 4. `%LOCALAPPDATA%/hermes/.env` — native Windows installer default when HERMES_HOME unset
 * 5. `%APPDATA%/hermes/.env` — roaming profile fallback
 */
export function hermesEnvCandidatePaths(
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const out: string[] = [];
  pushPath(out, env.HERMES_ENV_FILE);
  const home = env.HERMES_HOME?.trim();
  if (home) pushPath(out, join(home, ".env"));
  for (const homeDir of homeDirCandidates(env)) {
    pushPath(out, join(homeDir, ".hermes", ".env"));
  }
  const localAppData = env.LOCALAPPDATA?.trim();
  if (localAppData) pushPath(out, join(localAppData, "hermes", ".env"));
  const appData = env.APPDATA?.trim();
  if (appData) pushPath(out, join(appData, "hermes", ".env"));
  return out;
}

function readHermesDotEnvApiKey(): string | undefined {
  for (const path of hermesEnvCandidatePaths()) {
    try {
      if (!existsSync(path)) continue;
      const key = readDotEnvKey(readFileSync(path, "utf8"), "API_SERVER_KEY");
      if (key) return key;
    } catch {
      // try next candidate
    }
  }
  return undefined;
}

function sessionId(ownerOrKey: string): string {
  const digest = createHash("sha256").update(ownerOrKey).digest("hex").slice(0, 16);
  return `envoymesh-${digest}`;
}

function extractOpenAiContent(data: unknown): string {
  const choices = (data as { choices?: Array<{ message?: { content?: unknown } }> })?.choices;
  const content = choices?.[0]?.message?.content;
  if (typeof content === "string" && content.trim()) return content.trim();
  if (Array.isArray(content)) {
    const text = content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && "text" in part) {
          return String((part as { text?: unknown }).text ?? "");
        }
        return "";
      })
      .join("")
      .trim();
    if (text) return text;
  }
  throw new Error("Hermes API returned empty content");
}

function extractOpenHumanText(data: unknown): string {
  const root = data as {
    result?: unknown;
    error?: { message?: string };
  };
  if (root?.error?.message) {
    throw new Error(`OpenHuman RPC error: ${root.error.message}`);
  }
  const result = root?.result;
  if (typeof result === "string" && result.trim()) return result.trim();
  if (result && typeof result === "object") {
    const obj = result as Record<string, unknown>;
    for (const key of ["value", "response", "text", "message", "content"]) {
      const v = obj[key];
      if (typeof v === "string" && v.trim()) return v.trim();
      if (v && typeof v === "object" && "text" in (v as object)) {
        const t = String((v as { text?: unknown }).text ?? "").trim();
        if (t) return t;
      }
    }
    // RpcOutcome-style: { ok: true, logs: [...], value: "..." }
    if (typeof obj.data === "string" && obj.data.trim()) return obj.data.trim();
  }
  throw new Error(`OpenHuman RPC returned unparseable result: ${JSON.stringify(result)?.slice(0, 200)}`);
}

export function hermesApiBase(): string {
  return (process.env.HERMES_API_BASE?.trim() || "http://127.0.0.1:8642").replace(/\/$/, "");
}

/**
 * Bearer key for Hermes `/v1/*`.
 *
 * Prefer process env (portable across OS / custom Hermes homes). File discovery
 * is a best-effort convenience when Hermes runs on the same machine.
 */
export function hermesApiKey(): string | undefined {
  const key =
    process.env.HERMES_API_KEY?.trim() ||
    process.env.API_SERVER_KEY?.trim() ||
    readHermesDotEnvApiKey() ||
    "";
  return key || undefined;
}

function hermesAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const key = hermesApiKey();
  if (key) headers.Authorization = `Bearer ${key}`;
  return headers;
}

function hermesFetchError(err: unknown, base: string): Error {
  const msg = err instanceof Error ? err.message : String(err);
  if (/fetch failed|ECONNREFUSED|ENOTFOUND|network/i.test(msg)) {
    return new Error(
      `${msg} (Hermes API unreachable at ${base} — enable API server in Hermes .env (API_SERVER_ENABLED=true + API_SERVER_KEY), restart \`hermes gateway run\`; set HERMES_API_KEY on EnvoyMesh if auth fails)`,
    );
  }
  return err instanceof Error ? err : new Error(msg);
}

export function openHumanRpcUrl(): string {
  const explicit = process.env.OPENHUMAN_CORE_RPC_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const port = process.env.OPENHUMAN_CORE_PORT?.trim() || "7788";
  const host = process.env.OPENHUMAN_CORE_HOST?.trim() || "127.0.0.1";
  return `http://${host}:${port}/rpc`;
}

/** OpenHuman root folder names (`~/.openhuman` vs staging). */
function openHumanRootDirNames(env: NodeJS.ProcessEnv = process.env): string[] {
  const appEnv = (env.OPENHUMAN_APP_ENV ?? "").trim().toLowerCase();
  if (appEnv === "staging") return [".openhuman-staging", ".openhuman"];
  return [".openhuman", ".openhuman-staging"];
}

/**
 * Best-effort OpenHuman workspace / data roots across platforms and installs.
 *
 * Order:
 * 1. `OPENHUMAN_WORKSPACE` / `OPENHUMAN_HOME` — explicit overrides
 * 2. `$HOME|.USERPROFILE/.openhuman` (+ staging variant)
 * 3. `%LOCALAPPDATA%|%APPDATA%/openhuman` — Windows AppData fallbacks
 * 4. `$XDG_DATA_HOME|$XDG_CONFIG_HOME/openhuman` — Linux XDG fallbacks
 */
export function openHumanWorkspaceCandidateDirs(
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const out: string[] = [];
  pushPath(out, env.OPENHUMAN_WORKSPACE);
  pushPath(out, env.OPENHUMAN_HOME);

  for (const homeDir of homeDirCandidates(env)) {
    for (const root of openHumanRootDirNames(env)) {
      pushPath(out, join(homeDir, root));
    }
  }

  const localAppData = env.LOCALAPPDATA?.trim();
  if (localAppData) {
    pushPath(out, join(localAppData, "openhuman"));
    pushPath(out, join(localAppData, "OpenHuman"));
  }
  const appData = env.APPDATA?.trim();
  if (appData) {
    pushPath(out, join(appData, "openhuman"));
    pushPath(out, join(appData, "OpenHuman"));
  }

  const xdgData = env.XDG_DATA_HOME?.trim();
  if (xdgData) pushPath(out, join(xdgData, "openhuman"));
  const xdgConfig = env.XDG_CONFIG_HOME?.trim();
  if (xdgConfig) pushPath(out, join(xdgConfig, "openhuman"));

  return out;
}

/** Read `user_id = "…"` from OpenHuman `active_user.toml` (no TOML dep). */
export function readOpenHumanActiveUserId(fileContents: string): string | undefined {
  const m = fileContents.match(/^\s*user_id\s*=\s*"([^"]+)"\s*$/m);
  const id = m?.[1]?.trim();
  return id || undefined;
}

function activeUserWorkspaceTokenPaths(root: string): string[] {
  const out: string[] = [];
  try {
    const marker = join(root, "active_user.toml");
    if (!existsSync(marker)) return out;
    const userId = readOpenHumanActiveUserId(readFileSync(marker, "utf8"));
    if (userId) {
      pushPath(out, join(root, "users", userId, "workspace", "core.token"));
      pushPath(out, join(root, "users", userId, "core.token"));
    }
  } catch {
    // ignore unreadable marker
  }
  // Pre-login / local user layouts used by desktop + CLI.
  pushPath(out, join(root, "users", "local", "workspace", "core.token"));
  pushPath(out, join(root, "users", "local", "core.token"));
  return out;
}

/**
 * Candidate OpenHuman dotenv paths (may contain `OPENHUMAN_CORE_TOKEN`).
 *
 * Order:
 * 1. `OPENHUMAN_ENV_FILE`
 * 2. `$OPENHUMAN_WORKSPACE|$OPENHUMAN_HOME/.env`
 * 3. Each workspace-candidate `/.env`
 */
export function openHumanEnvCandidatePaths(
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const out: string[] = [];
  pushPath(out, env.OPENHUMAN_ENV_FILE);
  for (const dir of openHumanWorkspaceCandidateDirs(env)) {
    pushPath(out, join(dir, ".env"));
  }
  return out;
}

/**
 * Candidate OpenHuman `core.token` paths (standalone CLI / Docker path).
 *
 * Order (extends OpenHuman `print-core-token.sh` / `init_rpc_token` for
 * multi-platform / custom installs):
 * 1. `OPENHUMAN_TOKEN_FILE` — explicit file override
 * 2. `$OPENHUMAN_WORKSPACE/core.token` (+ other workspace candidates)
 * 3. Active-user / local user workspace tokens under those roots
 *
 * Note: OpenHuman.app (Tauri desktop) keeps a per-launch bearer in-memory only —
 * it does **not** write `core.token` or set `OPENHUMAN_CORE_TOKEN`. Ext Agent
 * cannot discover that token; use OpenHuman.app with `/v1` auto-key.
 * or set a shared `OPENHUMAN_CORE_TOKEN` on a non-desktop core.
 */
export function openHumanTokenCandidatePaths(
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const out: string[] = [];
  pushPath(out, env.OPENHUMAN_TOKEN_FILE);
  for (const dir of openHumanWorkspaceCandidateDirs(env)) {
    pushPath(out, join(dir, "core.token"));
    for (const p of activeUserWorkspaceTokenPaths(dir)) pushPath(out, p);
  }
  return out;
}

function readOpenHumanDotEnvKey(keys: string[]): string | undefined {
  for (const path of openHumanEnvCandidatePaths()) {
    try {
      if (!existsSync(path)) continue;
      const raw = readFileSync(path, "utf8");
      for (const key of keys) {
        const value = readDotEnvKey(raw, key);
        if (value) return value;
      }
    } catch {
      // try next candidate
    }
  }
  return undefined;
}

function readOpenHumanTokenFile(): string | undefined {
  for (const path of openHumanTokenCandidatePaths()) {
    try {
      if (!existsSync(path)) continue;
      const token = readFileSync(path, "utf8").replace(/[\r\n]+/g, "").trim();
      if (token) return token;
    } catch {
      // try next candidate
    }
  }
  return undefined;
}

/**
 * Bearer for OpenHuman `POST /rpc` (CLI / Docker core).
 *
 * Prefer process env; then dotenv under common install roots; then `core.token`
 * when the core runs in CLI mode on the same machine.
 */
export function openHumanRpcToken(): string | undefined {
  const token =
    process.env.OPENHUMAN_RPC_TOKEN?.trim() ||
    process.env.OPENHUMAN_CORE_TOKEN?.trim() ||
    readOpenHumanDotEnvKey(["OPENHUMAN_CORE_TOKEN", "OPENHUMAN_RPC_TOKEN"]) ||
    readOpenHumanTokenFile() ||
    "";
  return token || undefined;
}

/**
 * EnvoyMesh-local cache paths for the OpenHuman `/v1` API key
 * (avoids requiring a shell `export OPENHUMAN_API_KEY=…`).
 */
export function openHumanApiKeyFileCandidates(
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const out: string[] = [];
  pushPath(out, env.OPENHUMAN_API_KEY_FILE);
  for (const homeDir of homeDirCandidates(env)) {
    pushPath(out, join(homeDir, ".envoymesh", "openhuman.api-key"));
    pushPath(out, join(homeDir, ".openhuman", "envoymesh.api-key"));
  }
  const localAppData = env.LOCALAPPDATA?.trim();
  if (localAppData) pushPath(out, join(localAppData, "EnvoyMesh", "openhuman.api-key"));
  return out;
}

function readRawSecretFile(path: string): string | undefined {
  try {
    if (!existsSync(path)) return undefined;
    const token = readFileSync(path, "utf8").replace(/[\r\n]+/g, "").trim();
    return token || undefined;
  } catch {
    return undefined;
  }
}

function readEnvoyMeshCachedApiKey(): string | undefined {
  for (const path of openHumanApiKeyFileCandidates()) {
    const key = readRawSecretFile(path);
    if (key) return key;
  }
  return undefined;
}

function writeEnvoyMeshCachedApiKey(key: string): void {
  const path = openHumanApiKeyFileCandidates()[0];
  if (!path) return;
  try {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    const tmp = `${path}.tmp`;
    writeFileSync(tmp, `${key}\n`, { encoding: "utf8", mode: 0o600 });
    renameSync(tmp, path);
  } catch {
    // best-effort cache
  }
}

/** Parse OpenHuman keychain JSON payload → bearer `token` field. */
export function parseOpenHumanKeychainTokenPayload(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  try {
    const obj = JSON.parse(trimmed) as { token?: unknown };
    if (typeof obj.token === "string" && obj.token.trim()) return obj.token.trim();
  } catch {
    // plain bearer (not JSON)
    if (!trimmed.startsWith("{")) return trimmed;
  }
  return undefined;
}

/** Active OpenHuman user ids from `active_user.toml` under workspace roots. */
export function openHumanActiveUserIds(env: NodeJS.ProcessEnv = process.env): string[] {
  const out: string[] = [];
  for (const root of openHumanWorkspaceCandidateDirs(env)) {
    try {
      const marker = join(root, "active_user.toml");
      if (!existsSync(marker)) continue;
      const id = readOpenHumanActiveUserId(readFileSync(marker, "utf8"));
      if (id && !out.includes(id)) out.push(id);
    } catch {
      // try next
    }
  }
  // Common pre-login id used by desktop installs.
  if (!out.includes("local")) out.push("local");
  return out;
}

export function openHumanDevKeychainPaths(env: NodeJS.ProcessEnv = process.env): string[] {
  const out: string[] = [];
  for (const root of openHumanWorkspaceCandidateDirs(env)) {
    pushPath(out, join(root, "dev-keychain.json"));
  }
  return out;
}

function readOpenHumanDevKeychainApiKey(): string | undefined {
  const userIds = openHumanActiveUserIds();
  const accounts = userIds.map(
    (id) => `${id}:auth:${OPENHUMAN_EXTERNAL_V1_PROFILE}`,
  );
  for (const path of openHumanDevKeychainPaths()) {
    try {
      if (!existsSync(path)) continue;
      const map = JSON.parse(readFileSync(path, "utf8")) as Record<string, string>;
      for (const account of accounts) {
        const raw = map[account];
        if (!raw) continue;
        const token = parseOpenHumanKeychainTokenPayload(raw);
        if (token) return token;
      }
      // Fallback: any external-openai-compat entry.
      for (const [k, raw] of Object.entries(map)) {
        if (!k.includes(`auth:${OPENHUMAN_EXTERNAL_V1_PROVIDER}`)) continue;
        const token = parseOpenHumanKeychainTokenPayload(raw);
        if (token) return token;
      }
    } catch {
      // try next file
    }
  }
  return undefined;
}

function readMacOsOpenHumanKeychainApiKey(): string | undefined {
  if (process.platform !== "darwin") return undefined;
  for (const userId of openHumanActiveUserIds()) {
    const account = `${userId}:auth:${OPENHUMAN_EXTERNAL_V1_PROFILE}`;
    try {
      const res = spawnSync(
        "security",
        ["find-generic-password", "-s", "openhuman", "-a", account, "-w"],
        { encoding: "utf8", timeout: 2_000 },
      );
      if (res.status !== 0) continue;
      const token = parseOpenHumanKeychainTokenPayload(res.stdout || "");
      if (token) return token;
    } catch {
      // ignore
    }
  }
  return undefined;
}

function discoverOpenHumanV1ApiKey(): string | undefined {
  return (
    process.env.OPENHUMAN_API_KEY?.trim() ||
    process.env.OPENHUMAN_V1_API_KEY?.trim() ||
    process.env.OPENHUMAN_EXTERNAL_API_KEY?.trim() ||
    readOpenHumanDotEnvKey([
      "OPENHUMAN_API_KEY",
      "OPENHUMAN_V1_API_KEY",
      "OPENHUMAN_EXTERNAL_API_KEY",
    ]) ||
    readEnvoyMeshCachedApiKey() ||
    readOpenHumanDevKeychainApiKey() ||
    readMacOsOpenHumanKeychainApiKey() ||
    undefined
  );
}

function disableOpenHumanAutoProvision(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = (env.OPENHUMAN_AUTO_PROVISION_API_KEY ?? "1").trim().toLowerCase();
  return v === "0" || v === "false" || v === "no" || v === "off";
}

function upsertOpenHumanAuthProfile(userId: string, root: string): boolean {
  const path = join(root, "users", userId, "auth-profiles.json");
  try {
    let store: {
      schema_version?: number;
      updated_at?: string;
      active_profiles?: Record<string, string>;
      profiles?: Record<string, Record<string, unknown>>;
    };
    if (existsSync(path)) {
      store = JSON.parse(readFileSync(path, "utf8")) as typeof store;
    } else {
      store = { schema_version: 1, active_profiles: {}, profiles: {} };
    }
    const now = new Date().toISOString();
    store.schema_version = store.schema_version ?? 1;
    store.active_profiles = store.active_profiles ?? {};
    store.profiles = store.profiles ?? {};
    store.active_profiles[OPENHUMAN_EXTERNAL_V1_PROVIDER] = OPENHUMAN_EXTERNAL_V1_PROFILE;
    const existing = store.profiles[OPENHUMAN_EXTERNAL_V1_PROFILE] ?? {};
    store.profiles[OPENHUMAN_EXTERNAL_V1_PROFILE] = {
      provider: OPENHUMAN_EXTERNAL_V1_PROVIDER,
      profile_name: "default",
      kind: "token",
      account_id: null,
      workspace_id: null,
      access_token: null,
      refresh_token: null,
      id_token: null,
      token: null,
      expires_at: null,
      token_type: null,
      scope: null,
      created_at: typeof existing.created_at === "string" ? existing.created_at : now,
      updated_at: now,
      metadata: existing.metadata && typeof existing.metadata === "object" ? existing.metadata : {},
    };
    store.updated_at = now;
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    const tmp = `${path}.tmp`;
    writeFileSync(tmp, `${JSON.stringify(store, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    renameSync(tmp, path);
    return true;
  } catch {
    return false;
  }
}

function writeOpenHumanDevKeychainApiKey(userId: string, key: string): boolean {
  const payload = JSON.stringify({
    token: key,
    access_token: null,
    refresh_token: null,
    id_token: null,
  });
  const account = `${userId}:auth:${OPENHUMAN_EXTERNAL_V1_PROFILE}`;
  for (const path of openHumanDevKeychainPaths()) {
    try {
      const root = dirname(path);
      if (!existsSync(root)) continue;
      let map: Record<string, string> = {};
      if (existsSync(path)) {
        map = JSON.parse(readFileSync(path, "utf8")) as Record<string, string>;
      } else if (!existsSync(join(root, "users")) && !existsSync(join(root, "active_user.toml"))) {
        // Avoid creating stray keychains in non-OpenHuman dirs.
        continue;
      }
      map[account] = payload;
      const tmp = `${path}.tmp`;
      writeFileSync(tmp, `${JSON.stringify(map, null, 2)}\n`, {
        encoding: "utf8",
        mode: 0o600,
      });
      renameSync(tmp, path);
      return true;
    } catch {
      // try next
    }
  }
  return false;
}

function writeMacOsOpenHumanKeychainApiKey(userId: string, key: string): boolean {
  if (process.platform !== "darwin") return false;
  const account = `${userId}:auth:${OPENHUMAN_EXTERNAL_V1_PROFILE}`;
  const payload = JSON.stringify({
    token: key,
    access_token: null,
    refresh_token: null,
    id_token: null,
  });
  try {
    const res = spawnSync(
      "security",
      [
        "add-generic-password",
        "-U",
        "-s",
        "openhuman",
        "-a",
        account,
        "-w",
        payload,
      ],
      { encoding: "utf8", timeout: 3_000 },
    );
    return res.status === 0;
  } catch {
    return false;
  }
}

/**
 * Stable external API key for OpenHuman `GET|POST /v1/*`.
 *
 * Auto-loads from env, EnvoyMesh cache, OpenHuman `dev-keychain.json`, or
 * macOS Keychain. If none exist, auto-provisions a shared key into OpenHuman’s
 * credential store (disable with `OPENHUMAN_AUTO_PROVISION_API_KEY=0`).
 */
export function openHumanV1ApiKey(): string | undefined {
  const found = discoverOpenHumanV1ApiKey();
  if (found) {
    if (!readEnvoyMeshCachedApiKey()) writeEnvoyMeshCachedApiKey(found);
    return found;
  }

  if (disableOpenHumanAutoProvision()) return undefined;

  const userIds = openHumanActiveUserIds();
  const userId = userIds[0];
  if (!userId) return undefined;

  const key = randomBytes(32).toString("hex");
  let registered = writeOpenHumanDevKeychainApiKey(userId, key);
  registered = writeMacOsOpenHumanKeychainApiKey(userId, key) || registered;

  for (const root of openHumanWorkspaceCandidateDirs()) {
    if (existsSync(join(root, "users", userId))) {
      registered = upsertOpenHumanAuthProfile(userId, root) || registered;
    }
  }

  if (!registered) return undefined;

  writeEnvoyMeshCachedApiKey(key);
  console.log(
    `[ext-agent:openhuman] auto-provisioned /v1 API key for user ${userId} ` +
      `(cached under ~/.envoymesh/openhuman.api-key; restart OpenHuman.app if /v1 still 401s)`,
  );
  return key;
}

/** HTTP origin for OpenHuman core (no `/rpc` suffix). */
export function openHumanHttpBase(): string {
  const rpc = openHumanRpcUrl();
  return rpc.replace(/\/rpc\/?$/, "") || rpc;
}

export type OpenHumanTransport = "rpc" | "v1";

/**
 * Choose OpenHuman transport.
 *
 * - `OPENHUMAN_TRANSPORT=rpc|v1` forces a mode
 * - otherwise: RPC when a core bearer is discoverable, else V1 when an
 *   external API key is set, else V1 (desktop-friendly default for errors)
 */
export function openHumanTransport(): OpenHumanTransport {
  const forced = process.env.OPENHUMAN_TRANSPORT?.trim().toLowerCase();
  if (forced === "rpc" || forced === "v1") return forced;
  if (openHumanRpcToken()) return "rpc";
  // Read-only discovery (do not auto-provision just to pick a transport).
  if (discoverOpenHumanV1ApiKey()) return "v1";
  return "v1";
}

function openHumanRpcAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = openHumanRpcToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

function openHumanV1AuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const key = openHumanV1ApiKey();
  if (key) headers.Authorization = `Bearer ${key}`;
  return headers;
}

function openHumanMissingCredsError(transport: OpenHumanTransport, endpoint: string): Error {
  if (transport === "rpc") {
    return new Error(
      `OpenHuman RPC missing bearer (${endpoint}). ` +
        `OpenHuman.app keeps the per-launch token in-memory — EnvoyMesh cannot read it. ` +
        `Preferred with the desktop app: /v1 auto-key (default) or export OPENHUMAN_API_KEY. ` +
        `Or quit the .app and run CLI core so <workspace>/core.token exists.`,
    );
  }
  return new Error(
    `OpenHuman /v1 missing API key (${endpoint}). ` +
      `Auto-provision failed or is disabled (OPENHUMAN_AUTO_PROVISION_API_KEY=0). ` +
      `Create an OpenAI-compatible key in OpenHuman Settings → AI, or write one to ~/.envoymesh/openhuman.api-key.`,
  );
}

function openHumanAuthError(
  status: number,
  body: string,
  transport: OpenHumanTransport,
  endpoint: string,
): Error {
  if (transport === "v1") {
    const hint = discoverOpenHumanV1ApiKey()
      ? `key rejected — restart OpenHuman.app so it reloads credentials, or set OPENHUMAN_API_KEY to match Settings → AI`
      : `no API key resolved — enable auto-provision or set OPENHUMAN_API_KEY / ~/.envoymesh/openhuman.api-key`;
    return new Error(
      `OpenHuman /v1 HTTP ${status}: ${body.slice(0, 200)} (${hint}; endpoint=${endpoint})`,
    );
  }
  const hint = openHumanRpcToken()
    ? `token present but rejected — set OPENHUMAN_RPC_TOKEN / OPENHUMAN_CORE_TOKEN to match the core (or refresh workspace core.token)`
    : `no RPC token found. OpenHuman.app desktop token is in-memory only — use /v1 auto-key, or CLI core with core.token`;
  return new Error(
    `OpenHuman RPC HTTP ${status}: ${body.slice(0, 200)} (${hint}; rpc=${endpoint})`,
  );
}

export function defaultHermesModel(): string {
  return process.env.HERMES_API_MODEL?.trim() || "hermes-agent";
}

export function defaultOpenHumanModel(): string {
  return process.env.OPENHUMAN_API_MODEL?.trim() || "openhuman";
}

export function defaultClaudeCodeModel(): string {
  return process.env.CLAUDE_CODE_MODEL?.trim() || "claude-sonnet-4-5";
}

export async function listHermesModels(): Promise<ExtAgentModelListEntry[]> {
  return fetchOpenAiCompatibleModels({
    url: `${hermesApiBase()}/v1/models`,
    headers: hermesAuthHeaders(),
    cacheKey: "hermes-v1-models",
  });
}

export async function listOpenHumanModels(): Promise<ExtAgentModelListEntry[]> {
  if (openHumanTransport() !== "v1") return [];
  return fetchOpenAiCompatibleModels({
    url: `${openHumanHttpBase()}/v1/models`,
    headers: openHumanV1AuthHeaders(),
    cacheKey: "openhuman-v1-models",
  });
}

export function createHermesBackend(): ExtAgentBackend {
  const base = hermesApiBase();
  return {
    kind: "hermes",
    label: `Hermes API ${base}`,
    async probe() {
      try {
        const res = await fetch(`${base}/v1/models`, {
          headers: hermesAuthHeaders(),
          signal: AbortSignal.timeout(2_000),
        });
        return res.ok || res.status < 500;
      } catch {
        return false;
      }
    },
    async ask(text, ownerKey) {
      const sid = sessionId(ownerKey);
      const model =
        getExtAgentSessionModel("hermes", ownerKey) ?? defaultHermesModel();
      let res: Response;
      try {
        res = await fetch(`${base}/v1/chat/completions`, {
          method: "POST",
          headers: {
            ...hermesAuthHeaders(),
            "X-Hermes-Session-Id": sid,
            "X-Hermes-Session-Key": sid,
          },
          body: JSON.stringify({
            model,
            messages: [{ role: "user", content: text }],
          }),
          signal: AbortSignal.timeout(HERMES_TIMEOUT_MS),
        });
      } catch (err) {
        throw hermesFetchError(err, base);
      }
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        if (res.status === 401 || res.status === 403) {
          throw new Error(
            `Hermes API ${res.status}: ${body.slice(0, 200)} (set HERMES_API_KEY on the EnvoyMesh node to match Hermes API_SERVER_KEY, or point HERMES_ENV_FILE / HERMES_HOME at Hermes’s .env)`,
          );
        }
        throw new Error(`Hermes API ${res.status}: ${body.slice(0, 300)}`);
      }
      return extractOpenAiContent(await res.json());
    },
  };
}

export function createOpenHumanBackend(): ExtAgentBackend {
  const base = openHumanHttpBase();
  const rpcUrl = openHumanRpcUrl();
  const transport = openHumanTransport();
  return {
    kind: "openhuman",
    label:
      transport === "v1"
        ? `OpenHuman /v1 ${base}`
        : `OpenHuman RPC ${rpcUrl}`,
    async probe() {
      try {
        const res = await fetch(`${base}/health`, { signal: AbortSignal.timeout(2_000) });
        return res.ok;
      } catch {
        return false;
      }
    },
    async ask(text, sessionKey) {
      const mode = openHumanTransport();
      if (mode === "v1") {
        const key = openHumanV1ApiKey();
        if (!key) throw openHumanMissingCredsError("v1", `${base}/v1/chat/completions`);
        const model =
          getExtAgentSessionModel("openhuman", sessionKey) ?? defaultOpenHumanModel();
        const res = await fetch(`${base}/v1/chat/completions`, {
          method: "POST",
          headers: openHumanV1AuthHeaders(),
          body: JSON.stringify({
            model,
            messages: [{ role: "user", content: text }],
          }),
          signal: AbortSignal.timeout(OPENHUMAN_TIMEOUT_MS),
        });
        if (!res.ok) {
          const body = await res.text().catch(() => "");
          if (res.status === 401 || res.status === 403) {
            throw openHumanAuthError(res.status, body, "v1", `${base}/v1/chat/completions`);
          }
          throw new Error(`OpenHuman /v1 HTTP ${res.status}: ${body.slice(0, 300)}`);
        }
        return extractOpenAiContent(await res.json());
      }

      if (!openHumanRpcToken()) throw openHumanMissingCredsError("rpc", rpcUrl);
      const res = await fetch(rpcUrl, {
        method: "POST",
        headers: openHumanRpcAuthHeaders(),
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "agent.chat",
          params: { message: text },
        }),
        signal: AbortSignal.timeout(OPENHUMAN_TIMEOUT_MS),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        if (res.status === 401 || res.status === 403) {
          throw openHumanAuthError(res.status, body, "rpc", rpcUrl);
        }
        throw new Error(`OpenHuman RPC HTTP ${res.status}: ${body.slice(0, 300)}`);
      }
      return extractOpenHumanText(await res.json());
    },
  };
}

/**
 * Built-in Pi Ext Agent — asks the NodeService Pi runtime (RPC, lazy-started
 * on first message). Wired via {@link setPiExtAgentAsk} at boot; tools are
 * auto-denied on this path so Ext Agent chat stays conversational (coding
 * stays in the Pi TUI).
 */
let piExtAgentAsk:
  | ((text: string, sessionKey: string) => Promise<string>)
  | null = null;

export function setPiExtAgentAsk(
  ask: ((text: string, sessionKey: string) => Promise<string>) | null,
): void {
  piExtAgentAsk = ask;
}

export function createPiBackend(): ExtAgentBackend {
  return {
    kind: "pi",
    label: "Pi",
    async ask(text, sessionKey) {
      if (!piExtAgentAsk) {
        throw new Error(
          "Pi Ext Agent is not ready — home node Pi runtime is not wired yet",
        );
      }
      return piExtAgentAsk(text, sessionKey);
    },
    async probe() {
      if (piExtAgentAsk == null) return false;
      // Wired ask alone is not enough — slim / CI-incomplete DMGs have no
      // Pi CLI under resources/pi. Do NOT HTTP-probe :8022/status here:
      // http-server /status awaits backend.probe(), which would deadlock.
      try {
        const { discoverPiCli } = await import("../pi-runtime.js");
        return discoverPiCli() != null;
      } catch {
        return false;
      }
    },
  };
}

export function createBackend(kind: ExtAgentSidecarKind): ExtAgentBackend {
  if (kind === "pi") return createPiBackend();
  if (kind === "hermes") {
    // Phase 55E — supervised by default (probe-first; spawn only if down).
    // Force unwrapped HTTP with ENVOYMESH_EXT_AGENT_AUTOSTART=0.
    return isAutostartEnabled()
      ? createHermesSupervisedBackend()
      : createHermesBackend();
  }
  if (kind === "openhuman") {
    // OpenHuman.app only — reuse a running desktop core on :7788.
    // No headless spawn (openhuman-core is a separate advanced product path).
    return createOpenHumanBackend();
  }
  if (kind === "codex") {
    // Phase 55B — real codex app-server JSON-RPC over stdio,
    // supervised by the 55A `DaemonSupervisor`.
    return createCodexBackend();
  }
  if (kind === "claudecode") {
    // Phase 55C — in-process `@anthropic-ai/claude-agent-sdk`. No
    // subprocess lifecycle, no separate port from the agent side.
    // The SDK is loaded lazily inside the backend (see
    // `claudecode-backend.ts`).
    return createClaudeCodeBackend();
  }
  if (kind === "cursor") {
    // Phase 56A — Cursor CLI (`cursor-agent`) one-shot subprocess per
    // ask via the shared `OneShotCliBackend` base. Install via
    // `curl https://cursor.com/install -fsS | bash`.
    return createCursorAgentBackend();
  }
  if (kind === "aider") {
    // Phase 56B — Aider (`aider`) one-shot subprocess per ask via
    // the shared `OneShotCliBackend` base. Safety flags
    // (--no-pretty, --no-git, --yes-always) baked into the backend.
    return createAiderBackend();
  }
  if (kind === "mmx") {
    // Phase 56C — MiniMax MMX-CLI (`mmx`) one-shot subprocess per
    // ask via the shared `OneShotCliBackend` base. Install via
    // `npm install -g mmx-cli`; auth via `mmx auth login --api-key ...`.
    return createMmxBackend();
  }
  // Exhaustiveness guard — if a new sidecar kind is added, this will
  // type-error until the new branch is handled.
  const _exhaustive: never = kind;
  throw new Error(`[ext-agent] unknown sidecar kind: ${String(_exhaustive)}`);
}

/** @internal tests */
export const _test = {
  extractOpenAiContent,
  extractOpenHumanText,
  sessionId,
  readDotEnvKey,
  hermesEnvCandidatePaths,
  homeDirCandidates,
  openHumanWorkspaceCandidateDirs,
  openHumanEnvCandidatePaths,
  openHumanTokenCandidatePaths,
  openHumanApiKeyFileCandidates,
  readOpenHumanActiveUserId,
  parseOpenHumanKeychainTokenPayload,
  openHumanTransport,
  discoverOpenHumanV1ApiKey,
  isAutostartEnabled,
};
