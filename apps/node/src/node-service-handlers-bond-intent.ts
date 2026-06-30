/**
 * Inbound bond.* intent dispatcher (Step 38).
 *
 * Extracted from `_handleInboundMessage` in `node-service-impl.ts`.
 * Handles `bond.request`, `bond.accept`, `bond.challenge`, and
 * `bond.challenge.response` envelopes.
 */
import { createAuditEvent, deriveCorrelationIdFromEnvelope } from "@envoymesh/local-store";
import {
  parseBondAcceptPayload,
  parseBondRequestPayload,
} from "@envoymesh/protocol";
import { dialableInboundRemoteAddrs } from "./inbound-dial-hint-learn.js";
import { handleInboundBondIntent } from "./bond-inbound.js";

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface BondHandlerContext {
  getTaskStore(): any;
  getProfile(): any;
  storePendingHelloRequest(data: any): void;
  emit(event: string, payload: unknown): void;
  flushPendingRoomSyncs(): Promise<void> | void;
  flushPendingRoomMessages(): Promise<void> | void;
  ensurePeerFromInboundChat(input: {
    ownerId: string;
    peerId: string;
    listenAddrs: string[];
  }): Promise<void>;
  tagBondedContactReachability(remotePeerId: string): Promise<void> | void;
}

export interface BondHandlerParams {
  envelope: any;
  remotePeerId: string;
  remoteAddr: string;
}

const BOND_INTENTS = new Set([
  "bond.request",
  "bond.accept",
  "bond.challenge",
  "bond.challenge.response",
]);

export function isBondIntent(intent: string): boolean {
  return BOND_INTENTS.has(intent);
}

export async function handleBondIntentViaRuntime(
  ctx: BondHandlerContext,
  params: BondHandlerParams,
): Promise<boolean> {
  const { envelope, remotePeerId, remoteAddr } = params;
  if (!BOND_INTENTS.has(envelope.intent)) return false;

  const receivedAt = Date.now();
  const correlationId = deriveCorrelationIdFromEnvelope(envelope);
  const profile = ctx.getProfile();
  const taskStore = ctx.getTaskStore();
  const bond = await handleInboundBondIntent(
    {
      envelope,
      profile,
      remotePeerId,
      receivedAt,
      correlationId,
      taskStore,
      trustStore: undefined as never,
    },
    (helloData: unknown) => {
      ctx.storePendingHelloRequest(helloData);
      ctx.emit("hello:request", helloData);
    },
    async (bondData: unknown): Promise<void> => {
      ctx.emit("bond:established", bondData);
      await ctx.flushPendingRoomSyncs();
      await ctx.flushPendingRoomMessages();
      if (envelope.intent === "bond.request") {
        try {
          const payload = parseBondRequestPayload(envelope.payload);
          await ctx.ensurePeerFromInboundChat({
            ownerId: payload.requesterOwnerId,
            peerId: remotePeerId,
            listenAddrs: dialableInboundRemoteAddrs(remoteAddr, remotePeerId),
          });
        } catch (err) {
          console.error("[bond:established] failed to store peer in directory:", err);
        }
      } else if (envelope.intent === "bond.accept") {
        try {
          const payload = parseBondAcceptPayload(envelope.payload);
          await ctx.ensurePeerFromInboundChat({
            ownerId: payload.responderOwnerId,
            peerId: remotePeerId,
            listenAddrs: dialableInboundRemoteAddrs(remoteAddr, remotePeerId),
          });
        } catch (err) {
          console.error("[bond:established] failed to store peer from bond.accept:", err);
        }
      }
      await ctx.tagBondedContactReachability(remotePeerId);
    },
  );
  if (!bond.ok) {
    await taskStore.appendAuditEvent(
      createAuditEvent({
        type: "message.rejected",
        intent: envelope.intent,
        messageId: envelope.messageId,
        correlationId,
        remotePeerId,
        direction: "inbound",
        verificationStatus: "rejected",
        latencyMs: Date.now() - receivedAt,
        outcome: "deny",
        summary: `Rejected bond message: ${bond.reason}.`,
        createdAt: envelope.createdAt,
      }),
    );
    console.warn(`[rejected bond] ${envelope.intent}: ${bond.reason}`);
  }
  return true;
}