import { signUnsignedEnvelope } from "@envoymesh/identity";
import {
  createUnsignedEnvelope,
  createBroadcastRequestPayload,
  createBroadcastResponsePayload,
  createBroadcastCancelPayload,
  type BroadcastRequestPayload,
  type BroadcastResponsePayload,
  type EnvoyEnvelope,
} from "@envoymesh/protocol";
import { randomUUID } from "node:crypto";

export interface SendBroadcastRequestInput {
  targetRelayPeerId: string;
  queryId: string;
  ttl?: number;
  maxResponses?: number;
  requestedTagHashes?: string[];
  requestedCapabilities?: string[];
  requestedSensitivity?: "public" | "friends" | "private";
  timeoutMs?: number;
  profile: {
    owner: { ownerId: string };
    device: { publicKeyPem: string; privateKeyPem: string };
  };
  mesh: {
    send(target: string, envelope: EnvoyEnvelope): Promise<number>;
    peerId: string;
  };
}

/**
 * Send a broadcast.request to a relay for fan-out to all connected peers.
 */
export async function sendBroadcastRequest(input: SendBroadcastRequestInput): Promise<void> {
  const {
    targetRelayPeerId,
    queryId,
    ttl = 1,
    maxResponses = 10,
    requestedTagHashes = [],
    requestedCapabilities = [],
    requestedSensitivity = "public",
    timeoutMs = 30_000,
    profile,
    mesh,
  } = input;

  const payload = createBroadcastRequestPayload({
    queryId,
    ttl,
    maxResponses,
    requestedTagHashes,
    requestedCapabilities,
    requestedSensitivity,
    senderOwnerId: profile.owner.ownerId,
    timeoutMs,
  });

  const envelope = signUnsignedEnvelope(
    {
      ...createUnsignedEnvelope({
        senderPeerId: mesh.peerId,
        senderPublicKey: profile.device.publicKeyPem,
        intent: "broadcast.request",
        payload,
        createdAt: new Date().toISOString(),
        messageId: randomUUID(),
      }),
    },
    profile.device.privateKeyPem,
  );

  await mesh.send(targetRelayPeerId, envelope);
}

export interface SendBroadcastResponseInput {
  targetPeerId: string;
  targetPublicKey: string;
  responsePayload: BroadcastResponsePayload;
  profile: {
    device: { publicKeyPem: string; privateKeyPem: string };
  };
  mesh: {
    send(target: string, envelope: EnvoyEnvelope): Promise<number>;
    peerId: string;
  };
}

/**
 * Send a broadcast.response directly to the broadcaster (peer-to-peer, not via relay).
 */
export async function sendBroadcastResponse(input: SendBroadcastResponseInput): Promise<void> {
  const { targetPeerId, targetPublicKey, responsePayload, profile, mesh } = input;

  const envelope = signUnsignedEnvelope(
    {
      ...createUnsignedEnvelope({
        senderPeerId: mesh.peerId,
        senderPublicKey: profile.device.publicKeyPem,
        intent: "broadcast.response",
        payload: responsePayload,
        createdAt: new Date().toISOString(),
        messageId: randomUUID(),
        recipientPeerId: targetPeerId,
      }),
    },
    profile.device.privateKeyPem,
  );

  await mesh.send(targetPeerId, envelope);
}

export interface SendBroadcastCancelInput {
  targetRelayPeerId: string;
  queryId: string;
  reason?: string;
  profile: {
    device: { publicKeyPem: string; privateKeyPem: string };
  };
  mesh: {
    send(target: string, envelope: EnvoyEnvelope): Promise<number>;
    peerId: string;
  };
}

/**
 * Send a broadcast.cancel to a relay to stop an in-progress broadcast.
 */
export async function sendBroadcastCancel(input: SendBroadcastCancelInput): Promise<void> {
  const { targetRelayPeerId, queryId, reason = "cancelled", profile, mesh } = input;

  const payload = createBroadcastCancelPayload({ queryId, reason });

  const envelope = signUnsignedEnvelope(
    {
      ...createUnsignedEnvelope({
        senderPeerId: mesh.peerId,
        senderPublicKey: profile.device.publicKeyPem,
        intent: "broadcast.cancel",
        payload,
        createdAt: new Date().toISOString(),
        messageId: randomUUID(),
      }),
    },
    profile.device.privateKeyPem,
  );

  await mesh.send(targetRelayPeerId, envelope);
}
