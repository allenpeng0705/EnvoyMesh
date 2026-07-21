/**
 * Shared client helpers for Phase 46 multi-relay fleet E2E (in-process, process, live).
 */
import { randomUUID } from "node:crypto";
import { EnvoyMesh } from "@envoymesh/network";
import {
  createRelayCheckinPayload,
  createRelayLookupPayload,
  createUnsignedEnvelope,
  parseRelayLookupResponsePayload,
  type RelayLookupResponsePayload,
} from "@envoymesh/protocol";
import {
  derivePeerId,
  generateIdentity,
  signUnsignedEnvelope,
} from "@envoymesh/identity";

export async function waitFor(
  pred: () => boolean | Promise<boolean>,
  timeoutMs: number,
  label: string,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await pred()) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`timeout waiting for ${label} (${timeoutMs}ms)`);
}

export async function startRelayClient(meshes: EnvoyMesh[]): Promise<EnvoyMesh> {
  const client = new EnvoyMesh({
    listen: ["/ip4/127.0.0.1/tcp/0"],
    enableRelay: true,
    enableRelayServer: false,
    enableDht: false,
    enableMdns: false,
  });
  await client.start();
  meshes.push(client);
  return client;
}

export async function checkinToRelay(
  client: EnvoyMesh,
  relayAddr: string,
  identity: ReturnType<typeof generateIdentity>,
): Promise<void> {
  const expiresAt = new Date(Date.now() + 25 * 60_000).toISOString();
  const payload = createRelayCheckinPayload({
    peerId: client.peerId,
    relayReachableAddrs: client.multiaddrs,
    capabilities: ["mesh.discovery"],
    advertisements: [{ capability: "mesh.discovery", visibility: "public", expiresAt }],
    relayHints: [],
    expiresAt,
  });
  const envelope = signUnsignedEnvelope(
    createUnsignedEnvelope({
      senderPeerId: derivePeerId(identity.publicKeyPem),
      senderPublicKey: identity.publicKeyPem,
      senderRole: "system",
      intent: "relay.checkin",
      payload,
    }),
    identity.privateKeyPem,
  );
  await client.send(relayAddr, envelope);
}

export async function lookupPeerOnRelay(
  client: EnvoyMesh,
  relayAddr: string,
  identity: ReturnType<typeof generateIdentity>,
  targetPeerId: string,
  maxHops: number,
  timeoutMs = 20_000,
): Promise<RelayLookupResponsePayload> {
  const expiresAt = new Date(Date.now() + 25 * 60_000).toISOString();
  const payload = createRelayLookupPayload({
    queryId: `fleet_e2e_${randomUUID()}`,
    targetPeerId,
    capability: "mesh.discovery",
    maxResults: 8,
    maxHops,
    maxFanout: 2,
    visibilityScope: "public",
    expiresAt,
  });
  const envelope = signUnsignedEnvelope(
    createUnsignedEnvelope({
      senderPeerId: derivePeerId(identity.publicKeyPem),
      senderPublicKey: identity.publicKeyPem,
      senderRole: "system",
      intent: "relay.lookup",
      payload,
    }),
    identity.privateKeyPem,
  );
  const reply = await client.sendExpectReply(relayAddr, envelope, { timeoutMs });
  if (reply.intent !== "relay.lookup.response") {
    throw new Error(`expected relay.lookup.response, got ${reply.intent}`);
  }
  return parseRelayLookupResponsePayload(reply.payload);
}

export function peerIdFromMultiaddr(addr: string): string | undefined {
  const m = addr.trim().match(/\/p2p\/([^/]+)$/);
  return m?.[1];
}
