// @ts-nocheck - runtime is loosely typed by design.

/**
 * device.pair.approve arm of `handleInboundMeshMessage` (extracted from
 * `apps/node/src/index.ts`).
 *
 * The arm body was a ~45-line block:
 *   1. Parse device.pair.approve payload
 *   2. Verify the device certificate matches the local profile
 *   3. If mismatch: audit + return (no save)
 *   4. Save the rotated device certificate to the node profile
 *   5. Audit verified + log
 *
 * Now it is a 1-line call to this runtime.
 */

export interface DevicePairApproveParams {
  envelope: unknown;
  remotePeerId: string;
  receivedAt: number;
  correlationId: string | undefined;
  /** Top-level arg.args.profileDir. */
  profileDir: string;
}

export async function handleDevicePairApproveViaRuntime(
  ctx: any,
  params: DevicePairApproveParams,
): Promise<void> {
  const { envelope, remotePeerId, receivedAt, correlationId: corrId } = params;

  // 1. Parse + verify.
  const payload = ctx.parseDevicePairApprovePayload(envelope.payload);
  const cert = payload.deviceCertificate;
  const profile = ctx.getProfile();
  const certValid =
    cert.deviceId === profile.device.deviceId &&
    cert.ownerId === profile.owner.ownerId &&
    ctx.verifyDeviceCertificate(cert, profile.owner.publicKeyPem);

  if (!certValid) {
    await ctx.appendAuditEvent({
      type: "message.rejected",
      intent: "device.pair.approve",
      messageId: envelope.messageId,
      correlationId: corrId,
      remotePeerId,
      direction: "inbound",
      verificationStatus: "rejected",
      latencyMs: Date.now() - receivedAt,
      outcome: "deny",
      summary:
        "Rejected device.pair.approve: certificate mismatch or invalid signature.",
      createdAt: envelope.createdAt,
    });
    return;
  }

  // 2. Apply + audit.
  await ctx.saveNodeProfile(params.profileDir, {
    ...profile,
    deviceCertificate: cert,
  });
  await ctx.appendAuditEvent({
    type: "message.verified",
    intent: "device.pair.approve",
    messageId: envelope.messageId,
    correlationId: corrId,
    remotePeerId,
    direction: "inbound",
    verificationStatus: "verified",
    latencyMs: Date.now() - receivedAt,
    outcome: "allow",
    summary: `Applied paired device certificate for request ${payload.requestId}.`,
    createdAt: envelope.createdAt,
  });
  ctx.log(`[pairing approved] request=${payload.requestId}`);
}