/**
 * Periodic relay.checkin + relay.lookup for NodeService (Social / Tauri path).
 * CLI `index.ts` runs equivalent cycles; without this, cross-NAT chat lacks /p2p-circuit/ dial hints.
 */
import { randomUUID } from "node:crypto";
import type { EnvoyEnvelope } from "@envoymesh/protocol";
import {
  createRelayCheckinPayload,
  createRelayLookupPayload,
  createUnsignedEnvelope,
  parseRelayLookupResponsePayload,
} from "@envoymesh/protocol";
import { derivePeerId, signUnsignedEnvelope } from "@envoymesh/identity";
import type { EnvoyMesh } from "@envoymesh/network";
import { sendEnvelopeWithRetry, sendExpectReplyWithRetry } from "./chat-outbound-deliver.js";
import { cidForCapabilityTopic } from "@envoymesh/network";
import type { NodeProfile } from "@envoymesh/api";
import type { InboundMessageGuard } from "./inbound-guard.js";
import type { DiscoverySeedStore } from "./discovery-seed-store.js";
import { logClientRelayLookupResponse, logRelayReachableAddrsForCheckin } from "./relay-checkin-log.js";
import { recordRelayCheckinCycle, recordRelayLookupResult, type RelayCheckinAttempt } from "./relay-diagnostics-state.js";
import { collectRelayControlTargets } from "./relay-reservation-health.js";

const RELAY_CLIENT_CYCLE_INTERVAL_MS = 30_000;
const RELAY_LOOKUP_REPLY_TIMEOUT_MS = 30_000;
const RELAY_CHECKIN_TIMEOUT_MS = 30_000;
const RELAY_CONTROL_TTL_MS = 25 * 60_000; // align with circuit reservation (~30 min public); roster caps further
const RELAY_TARGET_CONCURRENCY = 3;


/**
 * Topics currently advertised via DHT (`provideCapabilityTopic`). The relay
 * checkin uses these to publish `advertisements[]` with topicHash entries so
 * the relay server's roster (indexed by topicHash) can answer cross-NAT
 * `relay.lookup` queries when the local DHT routing table is empty.
 *
 * Maintained as two replaceable scopes so identity interests and
 * capability/publish topics coexist without unbounded union growth:
 * removing an interest or publish tag shrinks that scope on the next cycle.
 */
export type RelayClientAdvertisementScope = "identity" | "capability";

const advertisedByScope: Record<RelayClientAdvertisementScope, string[]> = {
  identity: [],
  capability: [],
};

let currentAdvertisedTopics: string[] = [];

function rebuildAdvertisedTopics(): void {
  const cleaned = dedupeTopics([
    ...advertisedByScope.identity,
    ...advertisedByScope.capability,
  ]);
  if (
    cleaned.length === currentAdvertisedTopics.length &&
    cleaned.every((t, i) => t === currentAdvertisedTopics[i])
  ) {
    return;
  }
  currentAdvertisedTopics = cleaned;
}

/**
 * Replace one advertisement scope and rebuild the flat checkin roster.
 * Pass `[]` to clear that scope only (the other scope is preserved).
 */
export function replaceRelayClientAdvertisedTopics(
  scope: RelayClientAdvertisementScope,
  topics: readonly string[],
): void {
  advertisedByScope[scope] = dedupeTopics(topics);
  rebuildAdvertisedTopics();
}

/**
 * Full reset of both scopes. Empty list = private-profile clear.
 * Non-empty = replace entire roster via the identity scope (test / legacy).
 */
export function setRelayClientAdvertisedTopics(topics: string[]): void {
  advertisedByScope.identity = dedupeTopics(topics);
  advertisedByScope.capability = [];
  rebuildAdvertisedTopics();
}

/**
 * Replace the capability/publish scope (identity interests preserved).
 * Prefer `replaceRelayClientAdvertisedTopics("capability", …)` at new call sites.
 */
export function mergeRelayClientAdvertisedTopics(topics: readonly string[]): void {
  replaceRelayClientAdvertisedTopics("capability", topics);
}

export function getRelayClientAdvertisedTopics(): string[] {
  return [...currentAdvertisedTopics];
}

export function getRelayClientAdvertisedTopicsForScope(
  scope: RelayClientAdvertisementScope,
): string[] {
  return [...advertisedByScope[scope]];
}

function dedupeTopics(topics: readonly string[]): string[] {
  return [...new Set(topics.map((t) => t.trim()).filter(Boolean))];
}

/** Map a topic string to the CID hash string the relay roster keys on. */
async function topicToHash(topic: string): Promise<string> {
  const cid = await cidForCapabilityTopic(topic);
  return cid.toString();
}

/**
 * Tag a relay peer for libp2p persistent reachability once checkin
 * succeeds, so the connection survives idle drops and churn.
 */
async function tagRelayOk(mesh: EnvoyMesh, target: string): Promise<void> {
  if (!target.startsWith("/")) return;
  const m = target.match(/\/p2p\/([^/]+)/);
  const relayId = m?.[1];
  if (!relayId || relayId.startsWith("envoy_")) return;
  try {
    await mesh.tagRelayForPersistentReachability(relayId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[relay-client] tagRelayForPersistentReachability failed target=${relayId} error=${msg}`);
  }
}

function expiresAtFromNow(ms: number): string {
  return new Date(Date.now() + ms).toISOString();
}

function relayIdFromAddr(addr: string): string {
  const m = addr.match(/\/p2p\/([^/]+)$/);
  return m?.[1] ?? addr.slice(0, 24);
}

function dedupeAddrs(addrs: string[]): string[] {
  return [...new Set(addrs.map((a) => a.trim()).filter(Boolean))];
}

function relayCheckinCapabilities(capabilities: readonly string[]): string[] {
  return [...new Set(["mesh.discovery", ...capabilities])];
}

export interface RelayClientCycleDeps {
  mesh: EnvoyMesh;
  profile: NodeProfile;
  displayName?: string;
  bootstrapPeers: string[];
  configuredRelays?: readonly { enabled?: boolean; addr?: string }[];
  bootstrapPresets?: readonly string[];
  activeRelayAddrs?: readonly string[];
  inboundGuard: InboundMessageGuard;
  discoverySeedStore: DiscoverySeedStore;
}

/** Shared target set for checkin / lookup / reserve (Phase 46A). */
export function resolveRelayClientControlTargets(deps: Pick<
  RelayClientCycleDeps,
  "bootstrapPeers" | "configuredRelays" | "bootstrapPresets" | "activeRelayAddrs"
>): string[] {
  return collectRelayControlTargets({
    bootstrapPeers: deps.bootstrapPeers,
    configuredRelays: deps.configuredRelays,
    bootstrapPresets: deps.bootstrapPresets,
    activeRelayAddrs: deps.activeRelayAddrs,
  });
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const results: R[] = new Array(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]!);
    }
  };
  const n = Math.min(Math.max(1, concurrency), items.length);
  await Promise.all(Array.from({ length: n }, () => worker()));
  return results;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function sendRelayCheckin(deps: RelayClientCycleDeps, targets: string[]): Promise<RelayCheckinAttempt[]> {
  const { mesh, profile } = deps;
  const expiresAt = expiresAtFromNow(RELAY_CONTROL_TTL_MS);
  const topicHashes = await Promise.all(
    currentAdvertisedTopics.map((topic) => topicToHash(topic).catch(() => null)),
  );
  const topicAds = currentAdvertisedTopics
    .map((topic, idx) =>
      topicHashes[idx] ? { topicHash: topicHashes[idx]!, visibility: "public" as const, expiresAt } : null,
    )
    .filter((ad): ad is { topicHash: string; visibility: "public"; expiresAt: string } => ad !== null);
  const payload = createRelayCheckinPayload({
    peerId: mesh.peerId,
    ownerId: profile.owner.ownerId,
    displayName: deps.displayName,
    relayReachableAddrs: mesh.getRelayAdvertisedMultiaddrs(),
    capabilities: relayCheckinCapabilities(profile.deviceCertificate.capabilities),
    advertisements: [
      { capability: "mesh.discovery", visibility: "public", expiresAt },
      ...topicAds,
    ],
    relayHints: targets.map((addr) => ({
      relayId: relayIdFromAddr(addr),
      multiaddrs: [addr],
      expiresAt,
    })),
    expiresAt,
  });
  if (topicAds.length > 0) {
    console.log(
      `[relay-client] including ${topicAds.length} topicHash advertisement(s) in relay.checkin (sample: ${topicAds[0].topicHash.slice(0, 12)}…)`,
    );
  }
  logRelayReachableAddrsForCheckin({
    prefix: "[relay-client]",
    source: "node-service",
    peerId: mesh.peerId,
    ownerId: profile.owner.ownerId,
    addrs: payload.relayReachableAddrs,
  });
  return mapWithConcurrency(targets, RELAY_TARGET_CONCURRENCY, async (target) => {
    try {
      const signedEnvelope = signUnsignedEnvelope(
        createUnsignedEnvelope({
          senderPeerId: derivePeerId(profile.device.publicKeyPem),
          senderPublicKey: profile.device.publicKeyPem,
          senderRole: "system",
          recipientPeerId: target.startsWith("/") ? undefined : target,
          intent: "relay.checkin",
          payload,
        }),
        profile.device.privateKeyPem,
      );
      await withTimeout(
        sendEnvelopeWithRetry({
          mesh,
          transportPeerId: target,
          envelope: signedEnvelope,
          dialHints: [target.startsWith("/") ? target : `/p2p/${target}`],
        }),
        RELAY_CHECKIN_TIMEOUT_MS,
        `relay.checkin ${target}`,
      );
      console.log(`[relay-client] relay.checkin ok target=${target}`);
      // Tag the relay peer so libp2p keeps the connection alive and
      // reconnects after disconnect (key fix for relay churn under NAT).
      await tagRelayOk(mesh, target);
      return { target, ok: true } satisfies RelayCheckinAttempt;
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      console.warn(`[relay-client] relay.checkin failed target=${target} error=${detail}`);
      return { target, ok: false, error: detail } satisfies RelayCheckinAttempt;
    }
  });
}

async function applyRelayLookupResponse(
  envelope: EnvoyEnvelope,
  deps: RelayClientCycleDeps,
): Promise<number> {
  const payload = parseRelayLookupResponsePayload(envelope.payload);
  // Only cache hoppable circuit paths. hasHopSlot === false means this relay
  // cannot hop the peer right now; undefined means an older relay (keep addrs).
  const flat = dedupeAddrs(
    payload.peers
      .filter((peer) => peer.hasHopSlot !== false)
      .flatMap((peer) => peer.multiaddrs),
  );
  logClientRelayLookupResponse({
    queryId: payload.queryId,
    peerCount: payload.peers.length,
    multiaddrs: flat,
  });
  if (flat.length > 0) {
    await deps.discoverySeedStore.upsertMany(flat, "relay-peers");
    console.log(`[relay-client] relay.lookup stored ${flat.length} circuit multiaddr(s)`);
  }
  return flat.length;
}

export interface RelayLookupQuery {
  /** capability token (e.g. "mesh.discovery") */
  capability?: string;
  /** topicHash from a capability topic CID — used to match advertised topics */
  topicHash?: string;
  /** Exact peer id lookup against the relay roster */
  targetPeerId?: string;
  maxResults?: number;
  visibilityScope?: "public" | "capability" | "bonded" | "private";
}

/**
 * Run a `relay.lookup` against one or more bootstrap relays and return the
 * union of all peer candidates returned. Used by both the periodic client
 * cycle and the discovery runtime's cross-NAT search fallback.
 */
export async function queryRelayLookupWithDeps(
  deps: RelayClientCycleDeps,
  targets: string[],
  query: RelayLookupQuery,
): Promise<import("@envoymesh/protocol").RelayLookupResponsePayload[]> {
  const { mesh, profile, inboundGuard } = deps;
  const perTarget = await mapWithConcurrency(targets, RELAY_TARGET_CONCURRENCY, async (target) => {
    try {
      const payload = createRelayLookupPayload({
        queryId: `node_service_relay_lookup_${randomUUID()}`,
        ...(query.capability ? { capability: query.capability } : {}),
        ...(query.topicHash ? { topicHash: query.topicHash } : {}),
        ...(query.targetPeerId ? { targetPeerId: query.targetPeerId } : {}),
        maxResults: query.maxResults ?? 32,
        maxHops: 1,
        maxFanout: 2,
        visibilityScope: query.visibilityScope ?? "public",
        expiresAt: expiresAtFromNow(RELAY_CONTROL_TTL_MS),
      });
      const signedEnvelope = signUnsignedEnvelope(
        createUnsignedEnvelope({
          senderPeerId: derivePeerId(profile.device.publicKeyPem),
          senderPublicKey: profile.device.publicKeyPem,
          senderRole: "system",
          recipientPeerId: target.startsWith("/") ? undefined : target,
          intent: "relay.lookup",
          payload,
        }),
        profile.device.privateKeyPem,
      );
      const reply = await withTimeout(
        sendExpectReplyWithRetry({
          mesh,
          transportPeerId: target,
          envelope: signedEnvelope,
          dialHints: [target.startsWith("/") ? target : `/p2p/${target}`],
          timeoutMs: RELAY_LOOKUP_REPLY_TIMEOUT_MS,
        }),
        RELAY_LOOKUP_REPLY_TIMEOUT_MS + 5_000,
        `relay.lookup ${target}`,
      );
      const guardDecision = inboundGuard.inspect(reply);
      if (guardDecision.action === "reject") {
        const reason = guardDecision.reason ?? "rejected";
        console.warn(`[relay-client] relay.lookup rejected target=${target} reason=${reason}`);
        return null;
      }
      if (guardDecision.envelope.intent !== "relay.lookup.response") {
        const msg = `unexpected intent ${guardDecision.envelope.intent}`;
        console.warn(`[relay-client] relay.lookup ${msg} target=${target}`);
        return null;
      }
      const responsePayload = parseRelayLookupResponsePayload(guardDecision.envelope.payload);
      await applyRelayLookupResponse(guardDecision.envelope, deps);
      console.log(`[relay-client] relay.lookup ok target=${target}`);
      return responsePayload;
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      console.warn(`[relay-client] relay.lookup failed target=${target} error=${detail}`);
      return null;
    }
  });
  return perTarget.filter(
    (r): r is import("@envoymesh/protocol").RelayLookupResponsePayload => r !== null,
  );
}

async function queryRelayLookup(deps: RelayClientCycleDeps, targets: string[]): Promise<void> {
  const responses = await queryRelayLookupWithDeps(deps, targets, {
    capability: "mesh.discovery",
  });
  const totalPeers = responses.reduce((sum, r) => sum + r.peers.length, 0);
  const totalAddrs = responses.reduce(
    (sum, r) => sum + r.peers.flatMap((peer) => peer.multiaddrs).length,
    0,
  );
  if (responses.length === 0) {
    recordRelayLookupResult({
      source: "node-service",
      targets,
      ok: false,
      peerCount: 0,
      circuitAddrsStored: 0,
      error: "no relay targets responded",
    });
    return;
  }
  recordRelayLookupResult({
    source: "node-service",
    targets,
    ok: true,
    peerCount: totalPeers,
    circuitAddrsStored: totalAddrs,
  });
}

export async function runRelayClientCycle(deps: RelayClientCycleDeps): Promise<void> {
  const targets = resolveRelayClientControlTargets(deps);
  if (targets.length === 0) {
    console.warn("[relay-client] no relay control targets configured (need cn-relay or a --relay-server bootstrap addr)");
    return;
  }
  const checkinResults = await sendRelayCheckin(deps, targets);
  recordRelayCheckinCycle({ source: "node-service", targets, results: checkinResults });
  await queryRelayLookup(deps, targets);
}

export function startRelayClientScheduler(
  deps: RelayClientCycleDeps & { intervalMs?: number },
): () => void {
  let cycleRunning = false;
  let stopped = false;
  const interval = deps.intervalMs ?? RELAY_CLIENT_CYCLE_INTERVAL_MS;

  const tick = async (): Promise<void> => {
    if (stopped || cycleRunning) {
      return;
    }
    cycleRunning = true;
    try {
      await runRelayClientCycle(deps);
    } catch (err) {
      console.warn("[relay-client] cycle error:", err);
    } finally {
      cycleRunning = false;
    }
  };

  void tick();
  const timer = setInterval(() => {
    void tick();
  }, interval);

  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
