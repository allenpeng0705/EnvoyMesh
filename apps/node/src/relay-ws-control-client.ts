/**
 * relay.checkin / relay.lookup over the relay's `/ws/client` WebSocket endpoint.
 * Works when libp2p dial to the relay fails (NO_RESERVATION, NAT) but the home
 * node already has outbound WebSocket connectivity to the relay.
 */
import { randomUUID } from "node:crypto";
import { WebSocket } from "ws";
import type { EnvoyEnvelope, RelayLookupPayload, RelayLookupResponsePayload } from "@envoymesh/protocol";
import {
  createRelayCheckinPayload,
  createRelayLookupPayload,
  createUnsignedEnvelope,
  parseRelayLookupResponsePayload,
} from "@envoymesh/protocol";
import { derivePeerId, signUnsignedEnvelope } from "@envoymesh/identity";
import type { EnvoyMesh } from "@envoymesh/network";
import type { NodeProfile } from "@envoymesh/api";
import { relayDirectClientWsUrl } from "./relay-ws-url.js";

const DEFAULT_WS_TIMEOUT_MS = 15_000;

function relayCheckinCapabilities(capabilities: readonly string[]): string[] {
  return [...new Set(["mesh.discovery", ...capabilities])];
}

function expiresAtFromNow(ms: number): string {
  return new Date(Date.now() + ms).toISOString();
}

async function openRelayWs(relayWsUrl: string, timeoutMs: number): Promise<WebSocket> {
  const url = relayDirectClientWsUrl(relayWsUrl);
  const ws = new WebSocket(url);
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.terminate();
      reject(new Error(`relay ws connect timeout (${timeoutMs}ms)`));
    }, timeoutMs);
    ws.once("open", () => {
      clearTimeout(timer);
      resolve();
    });
    ws.once("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
  return ws;
}

async function sendEnvelopeOnWs(
  ws: WebSocket,
  envelope: EnvoyEnvelope,
  opts?: { expectReplyIntent?: string; timeoutMs?: number },
): Promise<EnvoyEnvelope | undefined> {
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_WS_TIMEOUT_MS;
  const expectIntent = opts?.expectReplyIntent;
  if (!expectIntent) {
    ws.send(JSON.stringify(envelope));
    return undefined;
  }
  return new Promise<EnvoyEnvelope>((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`relay ws reply timeout (${timeoutMs}ms) intent=${expectIntent}`));
    }, timeoutMs);

    const onMessage = (raw: WebSocket.RawData) => {
      const text =
        typeof raw === "string"
          ? raw
          : Buffer.isBuffer(raw)
            ? raw.toString("utf-8")
            : Array.isArray(raw)
              ? Buffer.concat(raw).toString("utf-8")
              : new TextDecoder().decode(new Uint8Array(raw as ArrayBuffer));
      let parsed: EnvoyEnvelope;
      try {
        parsed = JSON.parse(text) as EnvoyEnvelope;
      } catch {
        return;
      }
      if (parsed.intent !== expectIntent) {
        return;
      }
      if (envelope.correlationId && parsed.correlationId && parsed.correlationId !== envelope.correlationId) {
        return;
      }
      cleanup();
      resolve(parsed);
    };

    const onError = (err: Error) => {
      cleanup();
      reject(err);
    };

    const onClose = () => {
      cleanup();
      reject(new Error("relay ws closed before reply"));
    };

    function cleanup(): void {
      clearTimeout(timer);
      ws.off("message", onMessage);
      ws.off("error", onError);
      ws.off("close", onClose);
    }

    ws.on("message", onMessage);
    ws.on("error", onError);
    ws.on("close", onClose);
    ws.send(JSON.stringify(envelope));
  });
}

export async function sendRelayCheckinOverWs(input: {
  relayWsUrl: string;
  mesh: EnvoyMesh;
  profile: NodeProfile;
  ttlMs?: number;
  timeoutMs?: number;
}): Promise<void> {
  const ttlMs = input.ttlMs ?? 90_000;
  const expiresAt = expiresAtFromNow(ttlMs);
  const capabilities = relayCheckinCapabilities(input.profile.deviceCertificate.capabilities);
  const payload = createRelayCheckinPayload({
    peerId: input.mesh.peerId,
    ownerId: input.profile.owner.ownerId,
    relayReachableAddrs: input.mesh.multiaddrs,
    capabilities,
    advertisements: capabilities.map((capability) => ({
      capability,
      visibility: capability === "mesh.discovery" ? "public" : "bonded",
      expiresAt,
    })),
    relayHints: [],
    expiresAt,
  });
  const signedEnvelope = signUnsignedEnvelope(
    createUnsignedEnvelope({
      senderPeerId: derivePeerId(input.profile.device.publicKeyPem),
      senderPublicKey: input.profile.device.publicKeyPem,
      senderRole: "system",
      intent: "relay.checkin",
      payload,
    }),
    input.profile.device.privateKeyPem,
  );
  const ws = await openRelayWs(input.relayWsUrl, input.timeoutMs ?? DEFAULT_WS_TIMEOUT_MS);
  try {
    await sendEnvelopeOnWs(ws, signedEnvelope);
  } finally {
    ws.close();
  }
}

export async function sendRelayLookupOverWs(input: {
  relayWsUrl: string;
  profile: NodeProfile;
  lookup: RelayLookupPayload;
  timeoutMs?: number;
}): Promise<RelayLookupResponsePayload> {
  const correlationId = randomUUID();
  const signedEnvelope = signUnsignedEnvelope(
    createUnsignedEnvelope({
      senderPeerId: derivePeerId(input.profile.device.publicKeyPem),
      senderPublicKey: input.profile.device.publicKeyPem,
      senderRole: "system",
      intent: "relay.lookup",
      payload: input.lookup,
      correlationId,
    }),
    input.profile.device.privateKeyPem,
  );
  const ws = await openRelayWs(input.relayWsUrl, input.timeoutMs ?? DEFAULT_WS_TIMEOUT_MS);
  try {
    const reply = await sendEnvelopeOnWs(ws, signedEnvelope, {
      expectReplyIntent: "relay.lookup.response",
      timeoutMs: input.timeoutMs ?? DEFAULT_WS_TIMEOUT_MS,
    });
    if (!reply) {
      throw new Error("relay ws lookup: empty reply");
    }
    return parseRelayLookupResponsePayload(reply.payload);
  } finally {
    ws.close();
  }
}

export async function lookupBondedOwnerOverRelayWs(input: {
  relayWsUrl: string;
  profile: NodeProfile;
  targetOwnerId: string;
  ttlMs?: number;
  timeoutMs?: number;
}): Promise<{ peerId: string; addrs: string[] } | undefined> {
  const ttlMs = input.ttlMs ?? 90_000;
  const response = await sendRelayLookupOverWs({
    relayWsUrl: input.relayWsUrl,
    profile: input.profile,
    lookup: createRelayLookupPayload({
      queryId: `bonded_lookup_${randomUUID()}`,
      targetOwnerId: input.targetOwnerId.trim(),
      maxResults: 4,
      maxHops: 0,
      maxFanout: 2,
      visibilityScope: "bonded",
      expiresAt: expiresAtFromNow(ttlMs),
    }),
    timeoutMs: input.timeoutMs,
  });
  const match =
    response.peers.find((p) => p.ownerId === input.targetOwnerId.trim()) ??
    response.peers[0];
  if (!match) {
    return undefined;
  }
  const addrs = match.multiaddrs.filter(
    (addr) => !addr.includes("/p2p-circuit/") && addr.includes(`/p2p/${match.peerId}`),
  );
  if (addrs.length === 0) {
    return undefined;
  }
  return { peerId: match.peerId, addrs };
}
