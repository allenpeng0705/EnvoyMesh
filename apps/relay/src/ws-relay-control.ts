import { randomUUID } from "node:crypto";
import type { WebSocket } from "ws";
import {
  createRelayLookupResponsePayload,
  createUnsignedEnvelope,
  parseRelayCheckinPayload,
  parseRelayLookupPayload,
  RENDEZVOUS_RESPONSE_PLACEHOLDER_PUBLIC_KEY,
  RENDEZVOUS_RESPONSE_PLACEHOLDER_SIGNATURE,
  type EnvoyEnvelope,
} from "@envoymesh/protocol";
import { isLoopbackOrUnspecifiedDialHint } from "@envoymesh/network";
import type { WsRelayRoster } from "./ws-relay-roster.js";

function relayCircuitBases(meshMultiaddrs: string[], advertiseAddrs: string[], relayPeerId: string): string[] {
  const raw = advertiseAddrs.length > 0 ? advertiseAddrs : meshMultiaddrs;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const base of raw) {
    const trimmed = base.trim();
    if (!trimmed || isLoopbackOrUnspecifiedDialHint(trimmed)) {
      continue;
    }
    const withPeer = trimmed.includes("/p2p/")
      ? trimmed
      : `${trimmed.replace(/\/$/, "")}/p2p/${relayPeerId}`;
    if (!seen.has(withPeer)) {
      seen.add(withPeer);
      out.push(withPeer);
    }
  }
  return out;
}

function sendEnvelope(ws: WebSocket, envelope: EnvoyEnvelope): void {
  if (ws.readyState !== ws.OPEN) {
    return;
  }
  try {
    ws.send(JSON.stringify(envelope));
  } catch {
    /* ignore */
  }
}

/** Handle relay.checkin / relay.lookup on a WebSocket that speaks JSON EnvoyEnvelopes. */
export function handleWsRelayControlEnvelope(input: {
  ws: WebSocket;
  envelope: Record<string, unknown>;
  roster: WsRelayRoster;
  relayPeerId: string;
  meshMultiaddrs: string[];
  advertiseAddrs: string[];
  log?: (msg: string) => void;
}): boolean {
  const intent = input.envelope.intent as string | undefined;
  const payload = (input.envelope.payload as Record<string, unknown>) ?? {};
  const senderPeerId = (input.envelope.senderPeerId as string) ?? "";
  const correlationId = (input.envelope.correlationId as string) ?? undefined;

  if (intent === "relay.checkin") {
    try {
      const checkin = parseRelayCheckinPayload(payload);
      const entry = input.roster.checkin(checkin);
      input.log?.(
        `[relay-ws] checkin peer=${entry.peerId.slice(0, 12)}… addrs=${entry.relayReachableAddrs.length} roster=${input.roster.size()}`,
      );
    } catch (err) {
      input.log?.(
        `[relay-ws] checkin parse failed from ${senderPeerId.slice(0, 12)}…: ${err instanceof Error ? err.message : err}`,
      );
    }
    return true;
  }

  if (intent === "relay.lookup") {
    try {
      const lookupPayload = parseRelayLookupPayload(payload);
      const circuitBases = relayCircuitBases(input.meshMultiaddrs, input.advertiseAddrs, input.relayPeerId);
      const responsePayload = input.roster.lookup({
        payload: lookupPayload,
        requesterPeerId: senderPeerId,
        relayMultiaddrs: circuitBases,
        relayPeerId: input.relayPeerId,
      });
      const response = createUnsignedEnvelope({
        senderPeerId: input.relayPeerId,
        senderPublicKey: RENDEZVOUS_RESPONSE_PLACEHOLDER_PUBLIC_KEY,
        senderRole: "system",
        recipientPeerId: senderPeerId || undefined,
        intent: "relay.lookup.response",
        payload: createRelayLookupResponsePayload(responsePayload),
        correlationId,
      });
      sendEnvelope(input.ws, {
        ...response,
        messageId: randomUUID(),
        signature: RENDEZVOUS_RESPONSE_PLACEHOLDER_SIGNATURE,
      } as EnvoyEnvelope);
      input.log?.(
        `[relay-ws] lookup query=${lookupPayload.queryId} peers=${responsePayload.peers.length} requester=${senderPeerId.slice(0, 12)}…`,
      );
    } catch (err) {
      input.log?.(
        `[relay-ws] lookup failed from ${senderPeerId.slice(0, 12)}…: ${err instanceof Error ? err.message : err}`,
      );
    }
    return true;
  }

  return false;
}
