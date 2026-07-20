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
import { cidForCapabilityTopic, filterRelayControlTargets } from "@envoymesh/network";
import type { NodeProfile } from "@envoymesh/api";
import type { InboundMessageGuard } from "./inbound-guard.js";
import type { DiscoverySeedStore } from "./discovery-seed-store.js";
import { logClientRelayLookupResponse, logRelayReachableAddrsForCheckin } from "./relay-checkin-log.js";
import { recordRelayCheckinCycle, recordRelayLookupResult, type RelayCheckinAttempt } from "./relay-diagnostics-state.js";

const RELAY_CLIENT_CYCLE_INTERVAL_MS = 30_000;
const RELAY_LOOKUP_REPLY_TIMEOUT_MS = 30_000;
const RELAY_CONTROL_TTL_MS = 300_000;

/**
 * Topics currently advertised via DHT (`provideCapabilityTopic`). The relay
 * checkin uses these to publish `advertisements[]` with topicHash entries so
 * the relay server's roster (indexed by topicHash) can answer cross-NAT
 * `relay.lookup` queries when the local DHT routing table is empty.
 */
let currentAdvertisedTopics: string[] = [];

/** Called from the identity runtime when the advertised topic set changes. */
export function setRelayClientAdvertisedTopics(topics: string[]): void {
  const cleaned = dedupeTopics(topics);
  if (cleaned.length === currentAdvertisedTopics.length &&
      cleaned.every((t, i) => t === currentAdvertisedTopics[i])) {
    return;
  }
  currentAdvertisedTopics = cleaned;
}

/**
 * Union-merge topics into the relay checkin advertisement set.
 * Used by the capability/publish discovery cycle so `publish:` topics
 * are not clobbered when identity later sets interest/displayname topics
 * (and vice versa).
 */
export function mergeRelayClientAdvertisedTopics(topics: readonly string[]): void {
  setRelayClientAdvertisedTopics([...currentAdvertisedTopics, ...topics]);
}

export function getRelayClientAdvertisedTopics(): string[] {
  return [...currentAdvertisedTopics];
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
  inboundGuard: InboundMessageGuard;
  discoverySeedStore: DiscoverySeedStore;
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
    relayReachableAddrs: mesh.multiaddrs,
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
  const results: RelayCheckinAttempt[] = [];
  for (const target of targets) {
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
      await sendEnvelopeWithRetry({
        mesh,
        transportPeerId: target,
        envelope: signedEnvelope,
        dialHints: [target.startsWith("/") ? target : `/p2p/${target}`],
      });
      console.log(`[relay-client] relay.checkin ok target=${target}`);
      // Tag the relay peer so libp2p keeps the connection alive and
      // reconnects after disconnect (key fix for relay churn under NAT).
      await tagRelayOk(mesh, target);
      results.push({ target, ok: true });
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      console.warn(`[relay-client] relay.checkin failed target=${target} error=${detail}`);
      results.push({ target, ok: false, error: detail });
    }
  }
  return results;
}

async function applyRelayLookupResponse(
  envelope: EnvoyEnvelope,
  deps: RelayClientCycleDeps,
): Promise<number> {
  const payload = parseRelayLookupResponsePayload(envelope.payload);
  const flat = dedupeAddrs(payload.peers.flatMap((peer) => peer.multiaddrs));
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
  const responses: import("@envoymesh/protocol").RelayLookupResponsePayload[] = [];
  for (const target of targets) {
    try {
      const payload = createRelayLookupPayload({
        queryId: `node_service_relay_lookup_${randomUUID()}`,
        ...(query.capability ? { capability: query.capability } : {}),
        ...(query.topicHash ? { topicHash: query.topicHash } : {}),
        maxResults: query.maxResults ?? 32,
        maxHops: 0,
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
      const reply = await sendExpectReplyWithRetry({
        mesh,
        transportPeerId: target,
        envelope: signedEnvelope,
        dialHints: [target.startsWith("/") ? target : `/p2p/${target}`],
        timeoutMs: RELAY_LOOKUP_REPLY_TIMEOUT_MS,
      });
      const guardDecision = inboundGuard.inspect(reply);
      if (guardDecision.action === "reject") {
        const reason = guardDecision.reason ?? "rejected";
        console.warn(`[relay-client] relay.lookup rejected target=${target} reason=${reason}`);
        continue;
      }
      if (guardDecision.envelope.intent !== "relay.lookup.response") {
        const msg = `unexpected intent ${guardDecision.envelope.intent}`;
        console.warn(`[relay-client] relay.lookup ${msg} target=${target}`);
        continue;
      }
      const responsePayload = parseRelayLookupResponsePayload(guardDecision.envelope.payload);
      await applyRelayLookupResponse(guardDecision.envelope, deps);
      console.log(`[relay-client] relay.lookup ok target=${target}`);
      responses.push(responsePayload);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      console.warn(`[relay-client] relay.lookup failed target=${target} error=${detail}`);
    }
  }
  return responses;
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
  const targets = filterRelayControlTargets(deps.bootstrapPeers);
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
