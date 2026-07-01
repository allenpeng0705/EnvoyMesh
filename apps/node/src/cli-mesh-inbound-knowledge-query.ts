// @ts-nocheck - runtime is loosely typed by design.

/**
 * knowledge.query arm of `handleInboundMeshMessage` (extracted from
 * `apps/node/src/index.ts`).
 *
 * The arm body used to be a ~95-line block in `handleInboundMeshMessage`:
 *   1. extract syndication-max-sensitivity from contact prefs
 *   2. call handleInboundKnowledgeQuery
 *   3. handle rejection with audit
 *   4. build unsigned response envelope
 *   5. sign + deliver
 *   6. audit + recordInboundKnowledgeAnswered
 *
 * Now it is a 1-line call to this runtime.
 *
 * The runtime uses the Proxy-pattern (via `// @ts-nocheck` + `ctx: any`)
 * so the CLI can pass any object with the needed methods without
 * us designing a typed context interface.
 */

export interface KnowledgeQueryParams {
  envelope: {
    messageId: string;
    intent: string;
    createdAt: string;
    senderPeerId: string;
    payload: unknown;
    agentCredential?: { ownerId?: string };
  };
  remotePeerId: string;
  receivedAt: number;
  correlationId: string | undefined;
}

/**
 * Run the knowledge.query arm with CLI-inbound semantics.
 *
 * The runtime expects the context to provide:
 *   - getContactSyndicationMaxSensitivity(senderPeerId, remotePeerId)
 *   - handleInboundKnowledgeQuery(input)
 *   - appendAuditEvent(event)
 *   - getProfile()
 *   - createUnsignedEnvelope(input)
 *   - signUnsignedEnvelope(unsigned, privateKey)
 *   - deliverOutboundEnvelope(mesh, peerId, envelope)
 *   - logWarn(msg)
 *   - recordInboundKnowledgeAnswered(input)
 *   - getProtocol()
 */
export async function handleKnowledgeQueryViaRuntime(
  ctx: any,
  params: KnowledgeQueryParams,
): Promise<void> {
  const { envelope, remotePeerId, receivedAt, correlationId: corrId } = params;

  // 1. Resolve syndication-max-sensitivity from the contact's prefs.
  const contactSyndicationMaxSensitivity =
    await ctx.getContactSyndicationMaxSensitivity(
      envelope,
      remotePeerId,
    );

  // 2. Hand off to the core handler.
  const kq = await ctx.handleInboundKnowledgeQuery({
    envelope,
    remotePeerId,
    receivedAt,
    correlationId: corrId,
  });
  if (!kq.ok) {
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
      summary: `Rejected knowledge.query: ${kq.reason}.`,
      createdAt: envelope.createdAt,
    });
    ctx.logWarn(`[rejected knowledge.query] ${kq.reason}`);
    return;
  }

  // 3. Build, sign, and deliver the response envelope.
  const profile = ctx.getProfile();
  const unsignedResponse = ctx.createUnsignedEnvelope({
    senderPeerId: ctx.derivePeerId(profile.device.publicKeyPem),
    senderPublicKey: profile.device.publicKeyPem,
    recipientPeerId: envelope.senderPeerId,
    intent: "knowledge.response",
    payload: ctx.createKnowledgeResponsePayload(kq.responsePayload),
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
    summary: `Sent knowledge.response for ${envelope.messageId}.`,
    createdAt: signedResponse.createdAt,
  });
  ctx.recordInboundKnowledgeAnswered({
    remoteOwnerId: kq.senderOwnerId,
    correlationId: corrId,
    queryPreview: `${kq.queryPreview} (${kq.syndicatedSensitivity})`,
  });
}