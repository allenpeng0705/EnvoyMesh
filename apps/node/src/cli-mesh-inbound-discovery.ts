// @ts-nocheck - runtime is loosely typed by design.

/**
 * discovery.request / discovery.response arm of
 * `handleInboundMeshMessage` (extracted from `apps/node/src/index.ts`).
 *
 * The arm body was a ~88-line block:
 *   1. Load capability manifest + node config + human profile
 *   2. Call handleInboundDiscoveryIntent
 *   3. If rejected: audit + warn + return
 *   4. If request (with responsePayload): build + sign + send
 *      response, audit
 *   5. Append a discovery event to the audit log
 *
 * Now it is a 1-line call to this runtime.
 */

export interface DiscoveryParams {
  envelope: unknown;
  remotePeerId: string;
  receivedAt: number;
  correlationId: string | undefined;
  /** Top-level arg.args.profileDir. */
  profileDir: string;
  /** Optional reply-with-envelope callback. */
  replyWithEnvelope?: (envelope: unknown) => Promise<void>;
}

export async function handleDiscoveryViaRuntime(
  ctx: any,
  params: DiscoveryParams,
): Promise<void> {
  const { envelope, remotePeerId, receivedAt, correlationId: corrId } = params;

  // 1. Load configs.
  const capabilityManifest = await ctx.loadCapabilityManifest();
  const nodeConfig = await ctx.loadNodeConfig();
  const humanProfile = await ctx
    .loadHumanProfile()
    .catch(() => undefined);

  // 2. Delegate to the core handler.
  const discovery = await ctx.handleInboundDiscoveryIntent({
    envelope,
    remotePeerId,
    receivedAt,
    correlationId: corrId,
    capabilityManifest,
    anonymousDiscoveryMode: nodeConfig?.anonymousDiscoveryMode ?? "off",
    anonymousIntentAllowlist: nodeConfig?.anonymousIntentAllowlist,
    anonymousSensitivityCeiling:
      nodeConfig?.anonymousSensitivityCeiling ?? "public",
    profileDir: params.profileDir,
    humanProfile: humanProfile ?? undefined,
  });
  if (!discovery.ok) {
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
      summary: `Rejected ${envelope.intent}: ${discovery.reason}.`,
      createdAt: envelope.createdAt,
    });
    ctx.logWarn(`[rejected discovery] ${envelope.intent}: ${discovery.reason}`);
    return;
  }

  // 3. If request + responsePayload: build + sign + send response.
  if (envelope.intent === "discovery.request" && discovery.responsePayload) {
    const profile = ctx.getProfile();
    const unsignedResponse = ctx.createUnsignedEnvelope({
      senderPeerId: ctx.derivePeerId(profile.device.publicKeyPem),
      senderPublicKey: profile.device.publicKeyPem,
      recipientPeerId: envelope.senderPeerId,
      intent: "discovery.response",
      payload: ctx.createDiscoveryResponsePayload(discovery.responsePayload),
      correlationId: corrId,
    });
    const signedResponse = ctx.signUnsignedEnvelope(
      unsignedResponse,
      profile.device.privateKeyPem,
    );
    const latencyMs = 0;
    if (params.replyWithEnvelope) {
      await params.replyWithEnvelope(signedResponse);
    } else {
      await ctx.deliverOutboundEnvelope(ctx.getMesh(), remotePeerId, signedResponse);
    }
    await ctx.appendAuditEvent({
      type: "message.sent",
      intent: signedResponse.intent,
      messageId: signedResponse.messageId,
      correlationId: signedResponse.correlationId,
      remotePeerId,
      direction: "outbound",
      latencyMs,
      protocol: ctx.getProtocol(),
      outcome: "record",
      summary: `Sent discovery.response for ${envelope.messageId}.`,
      createdAt: signedResponse.createdAt,
    });
    await ctx.appendDiscoveryEvent({
      version: "0.1",
      eventId: `discovery_${signedResponse.messageId}`,
      createdAt: signedResponse.createdAt,
      direction: "outbound",
      intent: "discovery.response",
      ownerId: profile.owner.ownerId,
      remotePeerId,
      correlationId: signedResponse.correlationId,
      requestMessageId: envelope.messageId,
      matchCount: discovery.responsePayload.matches.length,
      requestedTagHashes: [],
      requestedCapabilities: [],
      matchedTagHashes: discovery.responsePayload.matches.flatMap(
        (match: any) => match.matchedTagHashes,
      ),
      matchedCapabilities: discovery.responsePayload.matches.flatMap(
        (match: any) => match.matchedCapabilities,
      ),
      outcome: "record",
    });
  }
}