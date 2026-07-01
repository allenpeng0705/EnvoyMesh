// @ts-nocheck - runtime is loosely typed by design.

/**
 * relay.peers.request / relay.peers.response arm of
 * `handleInboundMeshMessage` (extracted from `apps/node/src/index.ts`).
 *
 * The arm body was a ~90-line block:
 *   1. Track observed relay peer ids
 *   2. Call handleInboundRelayPeersIntent
 *   3. If rejected: audit + warn + return
 *   4. If response: parse payload, dial each addr, audit per-dial-result
 *   5. If request: build + sign + deliver response, audit
 *
 * Now it is a 1-line call to this runtime.
 */

export interface RelayPeersParams {
  envelope: unknown;
  remotePeerId: string;
  receivedAt: number;
  correlationId: string | undefined;
  /** Advertise addrs (top-level arg.args.advertiseAddrs). */
  advertiseAddrs: string[];
}

export async function handleRelayPeersViaRuntime(
  ctx: any,
  params: RelayPeersParams,
): Promise<void> {
  const { envelope, remotePeerId, receivedAt, correlationId: corrId, advertiseAddrs } = params;

  // 1. Track observed relay peer ids.
  if (envelope.intent === "relay.peers.request") {
    ctx.addObservedRelayPeerId(remotePeerId);
  }
  const relayPeerIds = ctx.dedupeAddrs([
    ...ctx.getConnectedRelayPeerIds(),
    ...ctx.getObservedRelayPeerIds(),
  ]);
  ctx.log(`[mac-relay] received ${envelope.intent} from ${remotePeerId}, relayPeerIds=${JSON.stringify(relayPeerIds)}`);

  // 2. Delegate to the core handler.
  const relayPeers = await ctx.handleInboundRelayPeersIntent({
    envelope,
    profile: ctx.getProfile(),
    remotePeerId,
    receivedAt,
    correlationId: corrId,
    taskStore: ctx.getTaskStore(),
    relayPeerIds,
    relayMultiaddrs: ctx.relayDialMultiaddrsForCircuitRelay(advertiseAddrs),
  });
  if (!relayPeers.ok) {
    await ctx.appendAuditEvent({
      type: "message.rejected",
      intent: envelope.intent,
      messageId: envelope.messageId,
      correlationId: corrId,
      remotePeerId,
      direction: "inbound",
      verificationStatus: "rejected",
      latencyMs: Date.now() - receivedAt,
      outcome: "deny",
      summary: `Rejected ${envelope.intent}: ${relayPeers.reason}.`,
      createdAt: envelope.createdAt,
    });
    ctx.logWarn(`[rejected relay.peers] ${envelope.intent}: ${relayPeers.reason}`);
    return;
  }

  // 3. If response: dial each relayed addr + audit.
  if (envelope.intent === "relay.peers.response") {
    const payload = ctx.parseRelayPeersResponsePayload(envelope.payload);
    const relayedAddrs = ctx.dedupeAddrs(payload.peers.flatMap((peer: any) => peer.multiaddrs));
    if (relayedAddrs.length > 0) {
      await ctx.upsertManyDiscoverySeeds(relayedAddrs, "relay-peers");
      for (const addr of relayedAddrs) {
        try {
          await ctx.dial(addr);
          await ctx.appendAuditEvent({
            type: "p2p.trace",
            direction: "outbound",
            protocol: "relay.peers.dial.ok",
            remotePeerId: addr,
            outcome: "record",
            summary: `relay peer dial ok addr=${addr}`,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          await ctx.appendAuditEvent({
            type: "p2p.trace",
            direction: "outbound",
            protocol: "relay.peers.dial.fail",
            remotePeerId: addr,
            outcome: "record",
            summary: `relay peer dial failed addr=${addr} error=${message}`,
          });
        }
      }
    }
  }

  // 4. If request: build + sign + deliver response + audit.
  if (
    envelope.intent === "relay.peers.request" &&
    relayPeers.responsePayload
  ) {
    const profile = ctx.getProfile();
    const unsignedResponse = ctx.createUnsignedEnvelope({
      senderPeerId: ctx.derivePeerId(profile.device.publicKeyPem),
      senderPublicKey: profile.device.publicKeyPem,
      recipientPeerId: envelope.senderPeerId,
      intent: "relay.peers.response",
      payload: relayPeers.responsePayload,
      correlationId: corrId,
    });
    const signedResponse = ctx.signUnsignedEnvelope(
      unsignedResponse,
      profile.device.privateKeyPem,
    );
    await ctx.deliverOutboundEnvelope(ctx.getMesh(), remotePeerId, signedResponse);
    await ctx.appendAuditEvent({
      type: "message.sent",
      intent: signedResponse.intent,
      messageId: signedResponse.messageId,
      correlationId: signedResponse.correlationId,
      remotePeerId,
      direction: "outbound",
      protocol: ctx.getProtocol(),
      outcome: "record",
      summary: `Sent relay.peers.response with ${relayPeers.responsePayload.peers.length} peer(s).`,
      createdAt: signedResponse.createdAt,
    });
  }
}