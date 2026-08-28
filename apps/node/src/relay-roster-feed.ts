/**
 * Phase 46E Path C — fetch / cache fleet roster from ANY known relay HTTP
 * endpoint (not only CN/US), with optional CDN URL + DMG seed for first boot.
 */
import { access, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  acceptRelayRosterDocument,
  coerceRelayRosterDocument,
  collectRelayRosterHttpUrls,
  DEFAULT_ENVOY_RELAY_ROSTER_URL,
  isRelayRosterExpired,
  RELAY_ROSTER_HTTP_PATH,
  selectActiveRelayTargets,
  verifyRelayRosterDocument,
  type RelayRosterDocument,
  type UnsignedRelayRosterDocument,
} from "@envoymesh/api";

const CACHE_FILE = "relay-roster-cache.json";
const SEED_FILE = "relay-roster.json";

export interface RelayRosterFeedConfig {
  profileDir: string;
  url?: string | null;
  trustPublicKeyPems?: readonly string[];
  enabled?: boolean;
  pollMs?: number;
  preferredRegion?: string | null;
  pinnedAddrs?: readonly string[];
  vouchedAddrs?: readonly string[];
  /** Dialable multiaddrs of known relays (configured + community + prior roster). */
  knownMultiaddrs?: readonly string[];
  /** Tauri `resources/node` (or env) for first-boot seed. */
  nodeBundleDir?: string | null;
  fetchImpl?: typeof fetch;
  onRosterApplied?: (addrs: string[], doc: UnsignedRelayRosterDocument) => void | Promise<void>;
  log?: (msg: string) => void;
  warn?: (msg: string) => void;
}

export interface RelayRosterFeedState {
  document: RelayRosterDocument | null;
  selectedAddrs: string[];
  lastFetchOkAt?: string;
  lastError?: string;
  lastSourceUrl?: string;
}

function cachePath(profileDir: string): string {
  return join(profileDir, CACHE_FILE);
}

function isKnownRelayRosterUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const pathOk =
      u.pathname === RELAY_ROSTER_HTTP_PATH || u.pathname.endsWith("/relay-roster.json");
    if (!pathOk) return false;
    // Fleet relays serve HTTP on the community admin port; CDN/HTTPS is not auto-trusted.
    if (u.protocol === "http:" && (u.port === "15432" || u.port === "")) return true;
    return false;
  } catch {
    return false;
  }
}

export async function loadRelayRosterCache(profileDir: string): Promise<RelayRosterDocument | null> {
  try {
    const raw = await readFile(cachePath(profileDir), "utf8");
    const parsed = coerceRelayRosterDocument(JSON.parse(raw) as unknown);
    if (isRelayRosterExpired(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function saveRelayRosterCache(
  profileDir: string,
  doc: RelayRosterDocument,
): Promise<void> {
  const path = cachePath(profileDir);
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  await writeFile(tmp, `${JSON.stringify(doc, null, 2)}\n`, { mode: 0o600 });
  await rename(tmp, path);
}

/** First-boot seed from DMG/EXE `resources/node/relay-roster.json`. */
export async function loadBundledRelayRosterSeed(
  nodeBundleDir?: string | null,
): Promise<RelayRosterDocument | null> {
  const dir = nodeBundleDir?.trim();
  if (!dir) return null;
  try {
    const raw = await readFile(join(dir, SEED_FILE), "utf8");
    const parsed = coerceRelayRosterDocument(JSON.parse(raw) as unknown);
    if (isRelayRosterExpired(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function resolveRelayRosterFeedOptions(config: {
  relayRosterUrl?: string | null;
  relayRosterTrustKeys?: readonly string[] | null;
  relayRosterEnabled?: boolean | null;
  relayRosterPollMs?: number | null;
  env?: NodeJS.ProcessEnv;
}): {
  enabled: boolean;
  url: string | null;
  trustPublicKeyPems: string[];
  pollMs: number;
} {
  const env = config.env ?? process.env;
  const explicitUrl = config.relayRosterUrl?.trim() || env.ENVOYMESH_RELAY_ROSTER_URL?.trim() || null;
  // Path C default: poll fleet relays. Optional CDN only when explicitly set.
  const url = explicitUrl;
  const trustPublicKeyPems = [
    ...(config.relayRosterTrustKeys ?? []),
    ...(env.ENVOYMESH_RELAY_ROSTER_TRUST_KEY ? [env.ENVOYMESH_RELAY_ROSTER_TRUST_KEY] : []),
  ]
    .map((k) => k.trim())
    .filter(Boolean);
  const enabledExplicit = config.relayRosterEnabled;
  // Default ON for Path C (homes poll any known relay). Opt out with false.
  const enabled = enabledExplicit === false ? false : true;
  const pollMs = Math.max(
    60_000,
    config.relayRosterPollMs ??
      (env.ENVOYMESH_RELAY_ROSTER_POLL_MS
        ? Number(env.ENVOYMESH_RELAY_ROSTER_POLL_MS)
        : 20 * 60_000),
  );
  return { enabled, url, trustPublicKeyPems, pollMs };
}

export function buildRelayRosterCandidateUrls(input: {
  explicitUrl?: string | null;
  knownMultiaddrs?: readonly string[];
  roster?: UnsignedRelayRosterDocument | null;
}): string[] {
  const fromRoster = (input.roster?.relays ?? []).flatMap((r) => r.multiaddrs);
  return collectRelayRosterHttpUrls({
    explicitUrl: input.explicitUrl,
    includeCommunityDefaults: true,
    multiaddrs: [...(input.knownMultiaddrs ?? []), ...fromRoster],
  });
}

export async function fetchRelayRosterFromUrl(input: {
  url: string;
  trustPublicKeyPems: readonly string[];
  fromKnownRelayHost: boolean;
  fetchImpl?: typeof fetch;
}): Promise<{ ok: true; document: RelayRosterDocument } | { ok: false; reason: string }> {
  const fetchFn = input.fetchImpl ?? globalThis.fetch;
  if (typeof fetchFn !== "function") {
    return { ok: false, reason: "fetch-unavailable" };
  }
  let res: Response;
  try {
    res = await fetchFn(input.url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(30_000),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: `fetch-failed:${msg}` };
  }
  if (!res.ok) {
    return { ok: false, reason: `http-${res.status}` };
  }
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return { ok: false, reason: "invalid-json" };
  }
  let doc: RelayRosterDocument;
  try {
    doc = coerceRelayRosterDocument(json);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: `schema:${msg}` };
  }
  const accepted = acceptRelayRosterDocument({
    doc,
    trustPublicKeyPems: input.trustPublicKeyPems,
    fromKnownRelayHost: input.fromKnownRelayHost,
  });
  if (!accepted.ok) {
    return { ok: false, reason: accepted.reason };
  }
  return { ok: true, document: doc };
}

/** @deprecated Prefer fetchRelayRosterFromUrl / multi-URL refresh. */
export async function fetchAndVerifyRelayRoster(input: {
  url: string;
  trustPublicKeyPems: readonly string[];
  fetchImpl?: typeof fetch;
}): Promise<{ ok: true; document: RelayRosterDocument } | { ok: false; reason: string }> {
  return fetchRelayRosterFromUrl({
    ...input,
    fromKnownRelayHost: isKnownRelayRosterUrl(input.url),
  });
}

export function createRelayRosterFeed(config: RelayRosterFeedConfig) {
  const log = config.log ?? console.log;
  const warn = config.warn ?? console.warn;
  const state: RelayRosterFeedState = {
    document: null,
    selectedAddrs: [],
  };
  let timer: ReturnType<typeof setInterval> | undefined;
  let running = false;

  function reselect(): string[] {
    state.selectedAddrs = selectActiveRelayTargets({
      roster: state.document,
      pinnedAddrs: config.pinnedAddrs,
      vouchedAddrs: config.vouchedAddrs,
      preferredRegion: config.preferredRegion,
      maxActive: state.document?.maxActiveTargets,
    });
    return state.selectedAddrs;
  }

  async function applyDocument(doc: RelayRosterDocument, sourceUrl?: string): Promise<string[]> {
    state.document = doc;
    state.lastFetchOkAt = new Date().toISOString();
    state.lastError = undefined;
    state.lastSourceUrl = sourceUrl;
    await saveRelayRosterCache(config.profileDir, doc);
    const addrs = reselect();
    if (config.onRosterApplied) {
      await config.onRosterApplied(addrs, doc);
    }
    return addrs;
  }

  async function refresh(): Promise<RelayRosterFeedState> {
    const opts = resolveRelayRosterFeedOptions({
      relayRosterUrl: config.url,
      relayRosterTrustKeys: config.trustPublicKeyPems,
      relayRosterEnabled: config.enabled,
      relayRosterPollMs: config.pollMs,
    });
    if (!opts.enabled) {
      state.lastError = "disabled";
      return { ...state };
    }

    const candidates = buildRelayRosterCandidateUrls({
      explicitUrl: opts.url,
      knownMultiaddrs: [
        ...(config.knownMultiaddrs ?? []),
        ...(config.pinnedAddrs ?? []),
        ...(config.vouchedAddrs ?? []),
        ...state.selectedAddrs,
      ],
      roster: state.document,
    });

    if (candidates.length === 0) {
      candidates.push(DEFAULT_ENVOY_RELAY_ROSTER_URL);
    }

    const errors: string[] = [];
    for (const url of candidates) {
      const fromKnownRelayHost = isKnownRelayRosterUrl(url);
      const result = await fetchRelayRosterFromUrl({
        url,
        trustPublicKeyPems: opts.trustPublicKeyPems,
        fromKnownRelayHost,
        fetchImpl: config.fetchImpl,
      });
      if (!result.ok) {
        errors.push(`${url}→${result.reason}`);
        continue;
      }
      const addrs = await applyDocument(result.document, url);
      log(
        `[relay-roster] applied fleet=${result.document.fleetId} relays=${result.document.relays.length} active=${addrs.length} via=${url}`,
      );
      return { ...state, selectedAddrs: addrs };
    }

    state.lastError =
      errors.length > 0 ? `all-sources-failed:${errors.slice(0, 4).join("|")}` : "no-candidates";
    warn(`[relay-roster] fetch failed (${state.lastError}); keeping prior cache`);
    return { ...state };
  }

  async function start(): Promise<() => void> {
    const opts = resolveRelayRosterFeedOptions({
      relayRosterUrl: config.url,
      relayRosterTrustKeys: config.trustPublicKeyPems,
      relayRosterEnabled: config.enabled,
      relayRosterPollMs: config.pollMs,
    });
    if (!opts.enabled) {
      log("[relay-roster] feed disabled (relayRosterEnabled=false)");
      return () => undefined;
    }

    const cached = await loadRelayRosterCache(config.profileDir);
    if (cached) {
      const keys = opts.trustPublicKeyPems;
      const cacheOk =
        !cached.signature || keys.length === 0 || verifyRelayRosterDocument(cached, keys);
      if (cacheOk) {
        state.document = cached;
        reselect();
        log(`[relay-roster] loaded cache fleet=${cached.fleetId} active=${state.selectedAddrs.length}`);
      }
    }

    if (!state.document) {
      const seed = await loadBundledRelayRosterSeed(
        config.nodeBundleDir ?? process.env.ENVOYMESH_NODE_BUNDLE_DIR,
      );
      if (seed) {
        await applyDocument(seed, "bundled-seed");
        log(`[relay-roster] loaded DMG/EXE seed fleet=${seed.fleetId} active=${state.selectedAddrs.length}`);
      }
    }

    await refresh();
    if (!state.lastFetchOkAt && state.document && config.onRosterApplied) {
      await config.onRosterApplied(state.selectedAddrs, state.document);
    }

    const jitter = Math.floor(Math.random() * Math.min(60_000, opts.pollMs / 5));
    timer = setInterval(() => {
      if (running) return;
      running = true;
      void refresh().finally(() => {
        running = false;
      });
    }, opts.pollMs + jitter);

    return () => {
      if (timer) clearInterval(timer);
      timer = undefined;
    };
  }

  return {
    getState: (): RelayRosterFeedState => ({ ...state }),
    reselect,
    refresh,
    start,
    setPinnedAddrs: (addrs: readonly string[]) => {
      config.pinnedAddrs = addrs;
    },
    setVouchedAddrs: (addrs: readonly string[]) => {
      config.vouchedAddrs = addrs;
    },
    setKnownMultiaddrs: (addrs: readonly string[]) => {
      config.knownMultiaddrs = addrs;
    },
  };
}

export type RelayRosterFeed = ReturnType<typeof createRelayRosterFeed>;

export async function ensureRelayRosterProfileDir(profileDir: string): Promise<void> {
  try {
    await access(profileDir);
  } catch {
    await mkdir(profileDir, { recursive: true });
  }
}
