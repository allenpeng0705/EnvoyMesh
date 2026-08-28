/**
 * Fleet roster sync: pull newer copies, merge self, publish to all known relays.
 * Eventual consistency — every relay ends with the newest issuedAt document.
 */
import {
  coerceRelayRosterDocument,
  collectRelayRosterHttpUrls,
  isRelayRosterExpired,
  isRelayRosterNewer,
  RELAY_ROSTER_HTTP_PATH,
  upsertRelayRosterEntry,
  type RelayRosterDocument,
  type RelayRosterEntry,
} from "@envoymesh/api";
import {
  loadRelayRosterDocument,
  RELAY_ROSTER_JOIN_TOKEN_HEADER,
  RELAY_ROSTER_MAX_SYNC_DEPTH,
  RELAY_ROSTER_SYNC_DEPTH_HEADER,
  writeRelayRosterDocument,
} from "./relay-roster-http.js";

export async function fetchRelayRosterFromHttpUrl(
  url: string,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<RelayRosterDocument | null> {
  if (typeof fetchImpl !== "function") return null;
  try {
    const res = await fetchImpl(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as unknown;
    const doc = coerceRelayRosterDocument(json);
    if (isRelayRosterExpired(doc)) return null;
    return doc;
  } catch {
    return null;
  }
}

export async function putRelayRosterToHttpUrl(input: {
  url: string;
  document: RelayRosterDocument;
  joinToken: string;
  syncDepth: number;
  fetchImpl?: typeof fetch;
}): Promise<{ ok: true; applied: boolean } | { ok: false; reason: string }> {
  const fetchFn = input.fetchImpl ?? globalThis.fetch;
  if (typeof fetchFn !== "function") return { ok: false, reason: "fetch-unavailable" };
  try {
    const res = await fetchFn(input.url, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        [RELAY_ROSTER_JOIN_TOKEN_HEADER]: input.joinToken,
        [RELAY_ROSTER_SYNC_DEPTH_HEADER]: String(input.syncDepth),
      },
      body: JSON.stringify(input.document),
      signal: AbortSignal.timeout(30_000),
    });
    if (res.status === 401) return { ok: false, reason: "unauthorized" };
    if (!res.ok) return { ok: false, reason: `http-${res.status}` };
    let json: { applied?: boolean } = {};
    try {
      json = (await res.json()) as { applied?: boolean };
    } catch {
      // ignore
    }
    return { ok: true, applied: json.applied !== false };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: `fetch-failed:${msg}` };
  }
}

/** Pull the newest roster among candidate URLs (and optional local file). */
export async function pullNewestRelayRoster(input: {
  candidateUrls: readonly string[];
  localPath: string;
  fetchImpl?: typeof fetch;
}): Promise<RelayRosterDocument | null> {
  let best: RelayRosterDocument | null = await loadRelayRosterDocument(input.localPath);
  for (const url of input.candidateUrls) {
    const doc = await fetchRelayRosterFromHttpUrl(url, input.fetchImpl);
    if (!doc) continue;
    if (isRelayRosterNewer(doc, best)) best = doc;
  }
  return best;
}

export function buildSelfRosterEntry(input: {
  peerId: string;
  publicAddrs: readonly string[];
  id?: string | null;
  region?: string | null;
  priority?: number | null;
  role?: "hub" | "regional" | "spare" | null;
}): RelayRosterEntry | null {
  const multiaddrs = input.publicAddrs
    .map((a) => a.trim())
    .filter((a) => a.includes("/p2p/") && !a.includes("/p2p-circuit"));
  if (multiaddrs.length === 0) return null;
  const id =
    input.id?.trim() ||
    `relay-${input.peerId.slice(0, 8).toLowerCase()}`;
  return {
    id,
    peerId: input.peerId,
    multiaddrs: multiaddrs.slice(0, 8),
    region: input.region?.trim() || undefined,
    role: input.role ?? "regional",
    priority: input.priority ?? 50,
    enabled: true,
  };
}

export function rosterPublishTargetUrls(
  doc: RelayRosterDocument,
  excludeUrls: readonly string[] = [],
): string[] {
  const exclude = new Set(excludeUrls);
  return collectRelayRosterHttpUrls({
    includeCommunityDefaults: true,
    multiaddrs: doc.relays.flatMap((r) => r.multiaddrs),
  }).filter((u) => !exclude.has(u));
}

/**
 * Merge self into newest known roster, write local, PUT to all fleet peers.
 */
export async function publishSelfOntoFleetRoster(input: {
  localPath: string;
  joinToken: string;
  selfEntry: RelayRosterEntry;
  extraMultiaddrs?: readonly string[];
  selfHttpUrlsToSkip?: readonly string[];
  fetchImpl?: typeof fetch;
  log?: (msg: string) => void;
  warn?: (msg: string) => void;
}): Promise<{ ok: true; document: RelayRosterDocument; pushedOk: number; pushedFail: number } | { ok: false; reason: string }> {
  const log = input.log ?? console.log;
  const warn = input.warn ?? console.warn;
  const token = input.joinToken.trim();
  if (token.length < 8) return { ok: false, reason: "join-token-short" };

  const seedUrls = collectRelayRosterHttpUrls({
    includeCommunityDefaults: true,
    multiaddrs: input.extraMultiaddrs ?? [],
  });
  const base = await pullNewestRelayRoster({
    candidateUrls: seedUrls,
    localPath: input.localPath,
    fetchImpl: input.fetchImpl,
  });
  if (!base) {
    // Bootstrap a minimal fleet doc from self alone (first relay in a new org).
    const boot: RelayRosterDocument = {
      v: 1,
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60_000).toISOString(),
      fleetId: "envoymesh-community",
      maxActiveTargets: 4,
      relays: [input.selfEntry],
    };
    await writeRelayRosterDocument(input.localPath, boot);
    const targets = rosterPublishTargetUrls(boot, input.selfHttpUrlsToSkip ?? []);
    let pushedOk = 0;
    let pushedFail = 0;
    for (const url of targets) {
      const r = await putRelayRosterToHttpUrl({
        url,
        document: boot,
        joinToken: token,
        syncDepth: 0,
        fetchImpl: input.fetchImpl,
      });
      if (r.ok) pushedOk++;
      else {
        pushedFail++;
        warn(`[relay-roster-sync] push failed ${url}: ${r.reason}`);
      }
    }
    log(`[relay-roster-sync] published bootstrap fleet relays=1 pushOk=${pushedOk} pushFail=${pushedFail}`);
    return { ok: true, document: boot, pushedOk, pushedFail };
  }

  const merged = upsertRelayRosterEntry(base, input.selfEntry);
  await writeRelayRosterDocument(input.localPath, merged);
  const targets = rosterPublishTargetUrls(merged, input.selfHttpUrlsToSkip ?? []);
  let pushedOk = 0;
  let pushedFail = 0;
  for (const url of targets) {
    const r = await putRelayRosterToHttpUrl({
      url,
      document: merged,
      joinToken: token,
      syncDepth: 0,
      fetchImpl: input.fetchImpl,
    });
    if (r.ok) pushedOk++;
    else {
      pushedFail++;
      warn(`[relay-roster-sync] push failed ${url}: ${r.reason}`);
    }
  }
  log(
    `[relay-roster-sync] published fleet=${merged.fleetId} relays=${merged.relays.length} issuedAt=${merged.issuedAt} pushOk=${pushedOk} pushFail=${pushedFail}`,
  );
  return { ok: true, document: merged, pushedOk, pushedFail };
}

/** Fan-out a newly applied roster to other fleet peers (bounded depth). */
export async function fanoutRelayRoster(input: {
  document: RelayRosterDocument;
  joinToken: string;
  syncDepth: number;
  skipUrls?: readonly string[];
  fetchImpl?: typeof fetch;
  log?: (msg: string) => void;
  warn?: (msg: string) => void;
}): Promise<void> {
  if (input.syncDepth >= RELAY_ROSTER_MAX_SYNC_DEPTH) return;
  const token = input.joinToken.trim();
  if (token.length < 8) return;
  const log = input.log ?? console.log;
  const warn = input.warn ?? console.warn;
  const nextDepth = input.syncDepth + 1;
  const targets = rosterPublishTargetUrls(input.document, input.skipUrls ?? []);
  let ok = 0;
  let fail = 0;
  for (const url of targets) {
    const r = await putRelayRosterToHttpUrl({
      url,
      document: input.document,
      joinToken: token,
      syncDepth: nextDepth,
      fetchImpl: input.fetchImpl,
    });
    if (r.ok) ok++;
    else {
      fail++;
      warn(`[relay-roster-sync] fanout failed ${url}: ${r.reason}`);
    }
  }
  log(`[relay-roster-sync] fanout depth=${nextDepth} ok=${ok} fail=${fail}`);
}

/**
 * Periodic pull: adopt a newer roster from any known peer (no restart).
 */
export function startRelayRosterPullSync(input: {
  localPath: string;
  extraMultiaddrs?: () => string[];
  intervalMs?: number;
  fetchImpl?: typeof fetch;
  log?: (msg: string) => void;
  warn?: (msg: string) => void;
}): () => void {
  const log = input.log ?? console.log;
  const warn = input.warn ?? console.warn;
  const intervalMs = Math.max(60_000, input.intervalMs ?? 15 * 60_000);
  let running = false;

  const tick = async (): Promise<void> => {
    if (running) return;
    running = true;
    try {
      const current = await loadRelayRosterDocument(input.localPath);
      const urls = collectRelayRosterHttpUrls({
        includeCommunityDefaults: true,
        multiaddrs: [
          ...(input.extraMultiaddrs?.() ?? []),
          ...(current?.relays.flatMap((r) => r.multiaddrs) ?? []),
        ],
      });
      const newest = await pullNewestRelayRoster({
        candidateUrls: urls,
        localPath: input.localPath,
        fetchImpl: input.fetchImpl,
      });
      if (!newest) return;
      if (!isRelayRosterNewer(newest, current)) return;
      await writeRelayRosterDocument(input.localPath, newest);
      log(
        `[relay-roster-sync] pull-adopted fleet=${newest.fleetId} relays=${newest.relays.length} issuedAt=${newest.issuedAt}`,
      );
    } catch (err) {
      warn(
        `[relay-roster-sync] pull failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      running = false;
    }
  };

  void tick();
  const timer = setInterval(() => {
    void tick();
  }, intervalMs);
  if (timer.unref) timer.unref();
  return () => clearInterval(timer);
}

export function selfRosterHttpUrlsFromAddrs(
  publicAddrs: readonly string[],
  httpPort: number,
): string[] {
  return collectRelayRosterHttpUrls({
    includeCommunityDefaults: false,
    multiaddrs: [...publicAddrs],
    httpPort,
  }).filter((u) => u.includes(RELAY_ROSTER_HTTP_PATH));
}
