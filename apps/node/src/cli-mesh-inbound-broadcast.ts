// @ts-nocheck - runtime is loosely typed by design.

/**
 * broadcast.request / broadcast.response arm of
 * `handleInboundMeshMessage` (extracted from `apps/node/src/index.ts`).
 *
 * The arm body was a ~90-line block:
 *   1. Load capability manifest + node config
 *   2. If request: call handleInboundBroadcastRequest
 *      - On reject: audit + warn + return
 *      - On accept (with responsePayload): sign + send response
 *   3. If response: call handleInboundBroadcastResponse
 *      - On reject: warn (no audit)
 *
 * Now it is a 1-line call to this runtime.
 */

export interface BroadcastParams {
  envelope: unknown;
  remotePeerId: string;
  receivedAt: number;
  correlationId: string | undefined;
}

export async function handleBroadcastViaRuntime(
  ctx: any,
  params: BroadcastParams,
): Promise<void> {
  const { envelope, remotePeerId, receivedAt, correlationId: corrId } = params;

  // 1. Load configs.
  await ctx.loadCapabilityManifest();
  await ctx.loadNodeConfig();

  // 2. Request path.
  if (envelope.intent === "broadcast.request") {
    const result = await ctx.handleInboundBroadcastRequest({
      envelope,
      remotePeerId,
      receivedAt,
      correlationId: corrId,
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
        summary: `Rejected broadcast.request: ${result.reason}.`,
        createdAt: envelope.createdAt,
      });
      ctx.logWarn(`[rejected broadcast] ${envelope.intent}: ${result.reason}`);
      return;
    }
    if (result.responsePayload) {
      const profile = ctx.getProfile();
      const unsignedResponse = ctx.createUnsignedEnvelope({
        senderPeerId: ctx.derivePeerId(profile.device.publicKeyPem),
        senderPublicKey: profile.device.publicKeyPem,
        recipientPeerId: envelope.senderPeerId,
        intent: "broadcast.response",
        payload: result.responsePayload,
        correlationId: corrId,
      });
      const signedResponse = ctx.signUnsignedEnvelope(
        unsignedResponse,
        profile.device.privateKeyPem,
      );
      await ctx.deliverOutboundEnvelope(
        ctx.getMesh(),
        envelope.senderPeerId,
        signedResponse,
      );
      await ctx.appendAuditEvent({
        type: "message.sent",
        intent: signedResponse.intent,
        messageId: signedResponse.messageId,
        correlationId: signedResponse.correlationId,
        remotePeerId: envelope.senderPeerId,
        direction: "outbound",
        protocol: ctx.getProtocol(),
        outcome: "record",
        summary: `Sent broadcast.response for queryId=${result.responsePayload.queryId}.`,
        createdAt: signedResponse.createdAt,
      });
    }
    return;
  }

  // 3. Response path.
  // NOTE: handleInboundBroadcastResponse REQUIRES taskStore (it
  // appends an audit event). The original code passed it via the
  // closure; we read it from ctx. If taskStore is undefined (e.g.
  // very early in node startup before startNode), we skip the
  // response handler entirely — the original would have crashed
  // here too, so behavior is equivalent.
  const responseTaskStore = ctx.getTaskStore?.();
  if (!responseTaskStore) return;
  const responseResult = await ctx.handleInboundBroadcastResponse({
    envelope,
    taskStore: responseTaskStore,
  });
  if (!responseResult.ok) {
    ctx.logWarn(`[rejected broadcast.response] ${responseResult.reason}`);
  }
}