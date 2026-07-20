// @ts-nocheck - runtime is loosely typed by design.

/**
 * library.read arm of `handleInboundMeshMessage` (extracted from
 * `apps/node/src/index.ts`).
 *
 * Mirrors `cli-mesh-inbound-knowledge-query.ts`:
 *   1. call handleInboundLibraryRead
 *   2. handle rejection with audit
 *   3. build unsigned response envelope
 *   4. sign + deliver
 *   5. audit
 *
 * The runtime uses the Proxy-pattern (via `// @ts-nocheck` + `ctx: any`)
 * so the CLI can pass any object with the needed methods without
 * us designing a typed context interface.
 */

export interface LibraryReadParams {
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
  /** Same-stream reply (preferred for sendExpectReply callers). */
  replyWithEnvelope?: (envelope: unknown) => Promise<void>;
}

/**
 * Run the library.read arm with CLI-inbound semantics.
 *
 * The runtime expects the context to provide:
 *   - getTaskStore / getTrustStore / getPeerDirectoryStore / getProfile
 *   - getProfileDir()
 *   - handleInboundLibraryRead(input)
 *   - appendAuditEvent(event)
 *   - createUnsignedEnvelope(input)
 *   - signUnsignedEnvelope(unsigned, privateKey)
 *   - deliverOutboundEnvelope(mesh, peerId, envelope)
 *   - createLibraryReadResponsePayload(payload)
 *   - derivePeerId(publicKeyPem)
 *   - logWarn(msg)
 *   - getProtocol()
 */
export async function handleLibraryReadViaRuntime(
  ctx: any,
  params: LibraryReadParams,
): Promise<void> {
  const { envelope, remotePeerId, receivedAt, correlationId: corrId, replyWithEnvelope } = params;

  // 1. Hand off to the core handler.
  const result = await ctx.handleInboundLibraryRead({
    envelope,
    remotePeerId,
    receivedAt,
    correlationId: corrId,
    taskStore: ctx.getTaskStore(),
    trustStore: ctx.getTrustStore(),
    peerDirectoryStore: ctx.getPeerDirectoryStore(),
    profile: ctx.getProfile(),
    profileDir: ctx.getProfileDir(),
  });

  if (!result.ok) {
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
      summary: `Rejected library.read: ${result.reason}.`,
      createdAt: envelope.createdAt,
    });
    ctx.logWarn(`[rejected library.read] ${result.reason}`);
    return;
  }

  // 2. Build, sign, and deliver the response envelope.
  const profile = ctx.getProfile();
  const unsignedResponse = ctx.createUnsignedEnvelope({
    senderPeerId: ctx.derivePeerId(profile.device.publicKeyPem),
    senderPublicKey: profile.device.publicKeyPem,
    recipientPeerId: envelope.senderPeerId,
    intent: "library.read.response",
    payload: ctx.createLibraryReadResponsePayload(result.responsePayload),
    correlationId: corrId,
  });
  const signedResponse = ctx.signUnsignedEnvelope(
    unsignedResponse,
    profile.device.privateKeyPem,
  );
  // Prefer same-stream reply so sendExpectReply on the requester correlates.
  if (replyWithEnvelope) {
    try {
      await replyWithEnvelope(signedResponse);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      ctx.logWarn(
        `[library.read] same-stream reply failed (${detail}); falling back to mesh.send`,
      );
      await ctx.deliverOutboundEnvelope(ctx.getMesh(), remotePeerId, signedResponse);
    }
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
    protocol: ctx.getProtocol(),
    outcome: "record",
    summary: `Sent library.read.response for ${envelope.messageId} (${result.responsePayload.status}).`,
    createdAt: signedResponse.createdAt,
  });
}
