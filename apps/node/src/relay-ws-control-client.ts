/**
 * relay.checkin + relay.lookup over WebSocket (/ws/client) when libp2p tcp/4001 is blocked.
 * Uses the same relay URL as relay-tunnel (port 15432) which both Mac and Windows reach.
 */
import { randomUUID } from "node:crypto";
import { WebSocket } from "ws";
import type { NodeProfile } from "@envoymesh/api";
import type { EnvoyEnvelope, RelayLookupResponsePayload } from "@envoymesh/protocol";
import {
  createRelayCheckinPayload,
  createRelayLookupPayload,
  createUnsignedEnvelope,
  EnvoyEnvelopeSchema,
  parseRelayLookupResponsePayload,
} from "@envoymesh/protocol";
import { derivePeerId, signUnsignedEnvelope } from "@envoymesh/identity";
import type { EnvoyMesh } from "@envoymesh/network";
import type { InboundMessageGuard } from "./inbound-guard.js";
import type { DiscoverySeedStore } from "./discovery-seed-store.js";
import type { LocalPeerDirectoryStore } from "@envoymesh/local-store";
import { logClientRelayLookupResponse, logRelayReachableAddrsForCheckin } from "./relay-checkin-log.js";
import { persistRelayLookupResponse, type RelayClientCycleDeps } from "./relay-client-cycle.js";
import { relayDirectClientWsUrl } from "./relay-ws-url.js";

const RELAY_WS_LOOKUP_TIMEOUT_MS = 15_000;
const RELAY_WS_CONTROL_TTL_MS = 90_000;

function expiresAtFromNow(ms: number): string {
  return new Date(Date.now() + ms).toISOString();
}

function relayCheckinCapabilities(capabilities: readonly string[]): string[] {
  return [...new Set(["mesh.discovery", ...capabilities])];
}

function parseWsLookupResponse(text: string, guard: InboundMessageGuard): RelayLookupResponsePayload | undefined {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return undefined;
  }
  const guardDecision = guard.inspect(raw);
  if (guardDecision.action === "allow" && guardDecision.envelope.intent === "relay.lookup.response") {
    return parseRelayLookupResponsePayload(guardDecision.envelope.payload);
  }
  const parsed = EnvoyEnvelopeSchema.safeParse(raw);
  if (!parsed.success || parsed.data.intent !== "relay.lookup.response") {
    return undefined;
  }
  try {
    return parseRelayLookupResponsePayload(parsed.data.payload);
  } catch {
    return undefined;
  }
}

async function openRelayWsClient(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const timer = setTimeout(() => {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      reject(new Error("relay ws control connect timeout"));
    }, 10_000);
    ws.once("open", () => {
      clearTimeout(timer);
      resolve(ws);
    });
    ws.once("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

async function sendAndWaitLookupResponse(input: {
  ws: WebSocket;
  envelope: EnvoyEnvelope;
  guard: InboundMessageGuard;
  timeoutMs: number;
}): Promise<RelayLookupResponsePayload> {
  const queryId =
    typeof input.envelope.payload === "object" &&
    input.envelope.payload !== null &&
    "queryId" in input.envelope.payload
      ? String((input.envelope.payload as { queryId: string }).queryId)
      : "";

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("relay ws lookup timeout"));
    }, input.timeoutMs);

    const onMessage = (raw: WebSocket.RawData) => {
      const text =
        typeof raw === "string"
          ? raw
          : Buffer.isBuffer(raw)
            ? raw.toString("utf-8")
            : Buffer.concat(raw as Buffer[]).toString("utf-8");
      const payload = parseWsLookupResponse(text, input.guard);
      if (!payload) {
        return;
      }
      if (queryId && payload.queryId !== queryId) {
        return;
      }
      cleanup();
      resolve(payload);
    };

    const onError = (err: Error) => {
      cleanup();
      reject(err);
    };

    const cleanup = () => {
      clearTimeout(timer);
      input.ws.off("message", onMessage);
      input.ws.off("error", onError);
    };

    input.ws.on("message", onMessage);
    input.ws.on("error", onError);
    try {
      input.ws.send(JSON.stringify(input.envelope));
    } catch (err) {
      cleanup();
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}

export async function runRelayWsControlCycle(deps: {
  relayWsUrl: string;
  mesh: Pick<EnvoyMesh, "peerId" | "multiaddrs">;
  profile: NodeProfile;
  inboundGuard: InboundMessageGuard;
  discoverySeedStore: DiscoverySeedStore;
  peerDirectoryStore?: Pick<LocalPeerDirectoryStore, "mergeListenAddrsForPeerId">;
  lookupOverrides?: Partial<Parameters<typeof createRelayLookupPayload>[0]>;
}): Promise<{ checkinOk: boolean; lookupOk: boolean; peerCount: number; storedAddrs: number }> {
  const clientUrl = relayDirectClientWsUrl(deps.relayWsUrl);
  let ws: WebSocket | undefined;
  try {
    ws = await openRelayWsClient(clientUrl);
    const expiresAt = expiresAtFromNow(RELAY_WS_CONTROL_TTL_MS);
    const checkinPayload = createRelayCheckinPayload({
      peerId: deps.mesh.peerId,
      ownerId: deps.profile.owner.ownerId,
      relayReachableAddrs: deps.mesh.multiaddrs,
      capabilities: relayCheckinCapabilities(deps.profile.deviceCertificate.capabilities),
      advertisements: [{ capability: "mesh.discovery", visibility: "public", expiresAt }],
      relayHints: [],
      expiresAt,
    });
    logRelayReachableAddrsForCheckin({
      prefix: "[relay-ws]",
      source: "node-service",
      peerId: deps.mesh.peerId,
      ownerId: deps.profile.owner.ownerId,
      addrs: checkinPayload.relayReachableAddrs,
    });
    const checkinEnvelope = signUnsignedEnvelope(
      createUnsignedEnvelope({
        senderPeerId: derivePeerId(deps.profile.device.publicKeyPem),
        senderPublicKey: deps.profile.device.publicKeyPem,
        senderRole: "system",
        intent: "relay.checkin",
        payload: checkinPayload,
      }),
      deps.profile.device.privateKeyPem,
    );
    ws.send(JSON.stringify(checkinEnvelope));
    console.log(`[relay-ws] relay.checkin sent via ${clientUrl}`);

    const lookupPayload = createRelayLookupPayload({
      queryId: `relay_ws_lookup_${randomUUID()}`,
      capability: "mesh.discovery",
      maxResults: 32,
      maxHops: 0,
      maxFanout: 2,
      visibilityScope: "public",
      expiresAt,
      ...deps.lookupOverrides,
    });
    const lookupEnvelope = signUnsignedEnvelope(
      createUnsignedEnvelope({
        senderPeerId: derivePeerId(deps.profile.device.publicKeyPem),
        senderPublicKey: deps.profile.device.publicKeyPem,
        senderRole: "system",
        intent: "relay.lookup",
        payload: lookupPayload,
        correlationId: lookupPayload.queryId,
      }),
      deps.profile.device.privateKeyPem,
    );
    const responsePayload = await sendAndWaitLookupResponse({
      ws,
      envelope: lookupEnvelope,
      guard: deps.inboundGuard,
      timeoutMs: RELAY_WS_LOOKUP_TIMEOUT_MS,
    });
    const cycleDeps: RelayClientCycleDeps = {
      mesh: deps.mesh as EnvoyMesh,
      profile: deps.profile,
      bootstrapPeers: [],
      inboundGuard: deps.inboundGuard,
      discoverySeedStore: deps.discoverySeedStore,
      peerDirectoryStore: deps.peerDirectoryStore,
    };
    const storedAddrs = await persistRelayLookupResponse(responsePayload, cycleDeps);
    logClientRelayLookupResponse({
      queryId: responsePayload.queryId,
      peerCount: responsePayload.peers.length,
      multiaddrs: responsePayload.peers.flatMap((p) => p.multiaddrs),
    });
    console.log(
      `[relay-ws] relay.lookup ok peers=${responsePayload.peers.length} stored=${storedAddrs} addrs`,
    );
    return {
      checkinOk: true,
      lookupOk: true,
      peerCount: responsePayload.peers.length,
      storedAddrs,
    };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.warn(`[relay-ws] cycle failed: ${detail}`);
    return { checkinOk: false, lookupOk: false, peerCount: 0, storedAddrs: 0 };
  } finally {
    if (ws) {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    }
  }
}

/** Targeted relay.lookup for one bonded peer over WebSocket. */
export async function queryRelayWsLookupForPeer(
  deps: Parameters<typeof runRelayWsControlCycle>[0] & {
    targetPeerId: string;
    targetOwnerId?: string;
  },
): Promise<boolean> {
  const result = await runRelayWsControlCycle({
    ...deps,
    lookupOverrides: {
      queryId: `relay_ws_lookup_peer_${randomUUID()}`,
      targetPeerId: deps.targetPeerId.trim(),
      targetOwnerId: deps.targetOwnerId?.trim() || undefined,
      visibilityScope: "bonded",
      maxResults: 4,
    },
  });
  return result.lookupOk && result.storedAddrs > 0;
}
