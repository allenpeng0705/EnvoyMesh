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
import { filterRelayControlTargets } from "@envoymesh/network";
import type { NodeProfile } from "@envoymesh/api";
import type { InboundMessageGuard } from "./inbound-guard.js";
import type { DiscoverySeedStore } from "./discovery-seed-store.js";
import { logClientRelayLookupResponse, logRelayReachableAddrsForCheckin } from "./relay-checkin-log.js";
import { recordRelayCheckinCycle, recordRelayLookupResult, type RelayCheckinAttempt } from "./relay-diagnostics-state.js";

const RELAY_CLIENT_CYCLE_INTERVAL_MS = 30_000;
const RELAY_LOOKUP_REPLY_TIMEOUT_MS = 30_000;
const RELAY_CONTROL_TTL_MS = 90_000;

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
  bootstrapPeers: string[];
  inboundGuard: InboundMessageGuard;
  discoverySeedStore: DiscoverySeedStore;
}

async function sendRelayCheckin(deps: RelayClientCycleDeps, targets: string[]): Promise<RelayCheckinAttempt[]> {
  const { mesh, profile } = deps;
  const expiresAt = expiresAtFromNow(RELAY_CONTROL_TTL_MS);
  const payload = createRelayCheckinPayload({
    peerId: mesh.peerId,
    ownerId: profile.owner.ownerId,
    relayReachableAddrs: mesh.multiaddrs,
    capabilities: relayCheckinCapabilities(profile.deviceCertificate.capabilities),
    advertisements: [{ capability: "mesh.discovery", visibility: "public", expiresAt }],
    relayHints: targets.map((addr) => ({
      relayId: relayIdFromAddr(addr),
      multiaddrs: [addr],
      expiresAt,
    })),
    expiresAt,
  });
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

async function queryRelayLookup(deps: RelayClientCycleDeps, targets: string[]): Promise<void> {
  const { mesh, profile, inboundGuard } = deps;
  let bestLookup:
    | { ok: true; peerCount: number; circuitAddrsStored: number }
    | { ok: false; error: string }
    | undefined;

  for (const target of targets) {
    try {
      const payload = createRelayLookupPayload({
        queryId: `node_service_relay_lookup_${randomUUID()}`,
        capability: "mesh.discovery",
        maxResults: 32,
        maxHops: 0,
        maxFanout: 2,
        visibilityScope: "public",
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
        bestLookup = { ok: false, error: reason };
        continue;
      }
      if (guardDecision.envelope.intent !== "relay.lookup.response") {
        const msg = `unexpected intent ${guardDecision.envelope.intent}`;
        console.warn(`[relay-client] relay.lookup ${msg} target=${target}`);
        bestLookup = { ok: false, error: msg };
        continue;
      }
      const responsePayload = parseRelayLookupResponsePayload(guardDecision.envelope.payload);
      const circuitAddrsStored = await applyRelayLookupResponse(guardDecision.envelope, deps);
      console.log(`[relay-client] relay.lookup ok target=${target}`);
      bestLookup = {
        ok: true,
        peerCount: responsePayload.peers.length,
        circuitAddrsStored,
      };
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      console.warn(`[relay-client] relay.lookup failed target=${target} error=${detail}`);
      bestLookup = { ok: false, error: detail };
    }
  }

  if (bestLookup) {
    recordRelayLookupResult({
      source: "node-service",
      targets,
      ok: bestLookup.ok,
      peerCount: bestLookup.ok ? bestLookup.peerCount : 0,
      circuitAddrsStored: bestLookup.ok ? bestLookup.circuitAddrsStored : 0,
      error: bestLookup.ok ? undefined : bestLookup.error,
    });
  }
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
