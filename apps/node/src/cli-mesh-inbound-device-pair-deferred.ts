// @ts-nocheck - runtime is loosely typed by design.

/**
 * device.pair.deferred arm of `handleInboundMeshMessage` (extracted from
 * `apps/node/src/index.ts`).
 *
 * The arm body was an 18-line block that:
 *   1. Parses the device.pair.deferred payload
 *   2. Appends a "verified" audit event with the deferral reason
 *
 * Now it is a 1-line call to this runtime.
 */

export interface DevicePairDeferredParams {
  envelope: unknown;
  remotePeerId: string;
  receivedAt: number;
  correlationId: string | undefined;
}

export async function handleDevicePairDeferredViaRuntime(
  ctx: any,
  params: DevicePairDeferredParams,
): Promise<void> {
  const { envelope, remotePeerId, receivedAt, correlationId: corrId } = params;

  const payload = ctx.parseDevicePairDeferredPayload(envelope.payload);
  await ctx.appendAuditEvent({
    type: "message.verified",
    intent: "device.pair.deferred",
    messageId: envelope.messageId,
    correlationId: corrId,
    remotePeerId,
    direction: "inbound",
    verificationStatus: "verified",
    latencyMs: Date.now() - receivedAt,
    outcome: "record",
    summary: `Pairing request ${payload.requestId} deferred: ${payload.reason}`,
    createdAt: envelope.createdAt,
  });
}