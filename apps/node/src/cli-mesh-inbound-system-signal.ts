// @ts-nocheck - runtime is loosely typed by design.

/**
 * system.signal arm of `handleInboundMeshMessage` (extracted from
 * `apps/node/src/index.ts`).
 *
 * The arm body was a ~77-line block:
 *   1. Parse system.signal payload
 *   2. Verify authorized device + evaluate capability
 *   3. If !authorized: warn + audit + return
 *   4. If capability deny: warn + audit + return
 *   5. Log + audit verified event
 *   6. Upsert peer into peer directory from signal
 *
 * Now it is a 1-line call to this runtime.
 */

export interface SystemSignalParams {
  envelope: unknown;
  remotePeerId: string;
  receivedAt: number;
  correlationId: string | undefined;
}

export async function handleSystemSignalViaRuntime(
  ctx: any,
  params: SystemSignalParams,
): Promise<void> {
  const { envelope, remotePeerId, receivedAt, correlationId: corrId } = params;

  // 1. Parse + verify.
  const payload = ctx.parseSystemSignalPayload(envelope.payload);
  const authorized = ctx.verifyAuthorizedDeviceEnvelope(
    envelope,
    payload.deviceCertificate,
    payload.ownerPublicKeyPem,
  );
  const capabilityDecision = ctx.evaluateCapability(
    envelope.intent,
    payload.capabilities,
  );

  // 2. Reject + audit on auth failure.
  if (!authorized) {
    ctx.logWarn(
      `[rejected signal] from ${payload.ownerId}/${payload.deviceId} via libp2p peer ${remotePeerId}: unauthorized device`,
    );
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
      summary: "Rejected signal: unauthorized device certificate.",
      createdAt: envelope.createdAt,
    });
    return;
  }

  // 3. Reject + audit on capability deny.
  if (capabilityDecision.action === "deny") {
    ctx.logWarn(
      `[rejected signal] from ${payload.ownerId}/${payload.deviceId}: ${capabilityDecision.reason}`,
    );
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
      summary: `Rejected signal: ${capabilityDecision.reason}`,
      createdAt: envelope.createdAt,
    });
    return;
  }

  // 4. Verify + upsert peer.
  ctx.log(
    `[verified signal] owner=${payload.ownerId} device=${payload.deviceId} profile=${payload.deviceProfile} capabilities=${payload.capabilities.join(",")}`,
  );
  await ctx.appendAuditEvent({
    type: "message.verified",
    intent: envelope.intent,
    messageId: envelope.messageId,
    correlationId: corrId,
    remotePeerId,
    direction: "inbound",
    verificationStatus: "verified",
    latencyMs: Date.now() - receivedAt,
    outcome: "allow",
    summary: `Verified signal for owner ${payload.ownerId}.`,
    createdAt: envelope.createdAt,
  });
  await ctx.upsertPeerFromSignal({
    peerId: remotePeerId,
    payload,
    seenAt: envelope.createdAt,
  });
}