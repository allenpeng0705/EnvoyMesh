// @ts-nocheck - runtime is loosely typed by design.

/**
 * share.request arm of `handleInboundMeshMessage` (extracted from
 * `apps/node/src/index.ts`).
 *
 * The arm body used to be a ~113-line block in `handleInboundMeshMessage`:
 *   1. Load capability manifest + call handleInboundShareRequest
 *   2. If rejected: append reject audit + warn + return
 *   3. If accepted: build unsigned share.preview envelope, sign, deliver
 *   4. Append outbound-sent audit
 *   5. Parse the inbound share.request payload
 *   6. If payload is a file + nodeService is a NodeServiceImpl:
 *      - if fileOrigin === "responder": register the responder file send
 *      - if fileOrigin === "sender": record push share offer
 *      - if deliveryChannel === "chat" + NodeServiceImpl: maybe auto-accept
 *
 * Now it is a 1-line call to this runtime.
 *
 * The runtime uses the Proxy-pattern (`// @ts-nocheck` + `ctx: any`)
 * so the CLI can pass any object with the needed methods without
 * us designing a typed context interface.
 */

export interface ShareRequestParams {
  envelope: {
    messageId: string;
    createdAt: string;
    senderPeerId: string;
    intent: string;
    payload: unknown;
  };
  remotePeerId: string;
  remoteAddr?: string | undefined;
  receivedAt: number;
  correlationId: string | undefined;
}

/**
 * Run the share.request arm with CLI-inbound semantics.
 *
 * The runtime expects the context to provide:
 *   - loadCapabilityManifest()
 *   - handleInboundShareRequest(input)
 *   - appendAuditEvent(event)
 *   - derivePeerId(publicKey)
 *   - createUnsignedEnvelope(input)
 *   - signUnsignedEnvelope(unsigned, privateKey)
 *   - createSharePreviewPayload(input)
 *   - dialHintsForTransportPeer(peerId, listenAddrs)
 *   - deliverOutboundEnvelope(mesh, peerId, envelope, opts)
 *   - parseShareRequestPayload(payload)
 *   - resolveSenderOwnerId(senderPeerId, remotePeerId, peerDirectoryStore)
 *   - logWarn(msg)
 *   - getProtocol()
 *   - getNodeService() (returns NodeServiceImpl or null)
 */
export async function handleShareRequestViaRuntime(
  ctx: any,
  params: ShareRequestParams,
): Promise<void> {
  const {
    envelope,
    remotePeerId,
    remoteAddr,
    receivedAt,
    correlationId: corrId,
  } = params;

  // 1. Load capability manifest + delegate to the core handler.
  const capabilityManifest = await ctx.loadCapabilityManifest();
  const share = await ctx.handleInboundShareRequest({
    envelope,
    remotePeerId,
    receivedAt,
    correlationId: corrId,
    taskStore: ctx.getTaskStore(),
    trustStore: ctx.getTrustStore(),
    peerDirectoryStore: ctx.getPeerDirectoryStore(),
    profile: ctx.getProfile(),
    vaultIndex: ctx.getVaultIndex(),
    vaultDir: ctx.getVaultDir(),
    modelProviders: ctx.getModelProviders(),
    capabilityManifest,
  });
  if (!share.ok) {
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
      summary: `Rejected share.request: ${share.reason}.`,
      createdAt: envelope.createdAt,
    });
    ctx.logWarn(`[rejected share.request] ${share.reason}`);
    return;
  }

  // 2. Build + sign + deliver share.preview response.
  const profile = ctx.getProfile();
  const unsignedResponse = ctx.createUnsignedEnvelope({
    senderPeerId: ctx.derivePeerId(profile.device.publicKeyPem),
    senderPublicKey: profile.device.publicKeyPem,
    recipientPeerId: envelope.senderPeerId,
    intent: "share.preview",
    payload: ctx.createSharePreviewPayload(share.responsePayload),
    correlationId: corrId,
  });
  const signedResponse = ctx.signUnsignedEnvelope(
    unsignedResponse,
    profile.device.privateKeyPem,
  );
  let previewDialHints: string[] = [];
  try {
    previewDialHints = await ctx.dialHintsForTransportPeer(
      remotePeerId,
      remoteAddr?.trim() ? [remoteAddr.trim()] : [],
    );
  } catch (err) {
    ctx.logWarn(
      `[share.request] preview dial hints failed for ${remotePeerId.slice(0, 12)}…: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
  await ctx.deliverOutboundEnvelope(ctx.getMesh(), remotePeerId, signedResponse, {
    dialHints: previewDialHints,
  });
  await ctx.appendAuditEvent({
    type: "message.sent",
    intent: signedResponse.intent,
    messageId: signedResponse.messageId,
    correlationId: signedResponse.correlationId,
    remotePeerId,
    direction: "outbound",
    protocol: ctx.getProtocol(),
    outcome: "record",
    summary: `Sent share.preview for ${envelope.messageId}.`,
    createdAt: signedResponse.createdAt,
  });

  // 3. Post-delivery hooks based on payload.
  let shareRequestPayload: ReturnType<typeof parseShareRequestPayload> | null = null;
  try {
    shareRequestPayload = ctx.parseShareRequestPayload(envelope.payload);
  } catch {
    shareRequestPayload = null;
  }
  const nodeService = ctx.getNodeService();
  if (
    shareRequestPayload?.requestType === "file" &&
    nodeService &&
    shareRequestPayload.fileOrigin === "responder"
  ) {
    nodeService.registerResponderFileSendAfterPreview(
      signedResponse.messageId,
      shareRequestPayload.relativePath,
      remotePeerId,
    );
  }
  if (
    shareRequestPayload?.requestType === "file" &&
    nodeService &&
    shareRequestPayload.fileOrigin === "sender"
  ) {
    const senderOwnerId = await ctx.resolveSenderOwnerId(
      envelope.senderPeerId,
      remotePeerId,
      ctx.getPeerDirectoryStore(),
    );
    await nodeService.recordInboundPushShareOffer({
      shareId: signedResponse.messageId,
      senderPeerId: remotePeerId,
      senderOwnerId,
      previewText: share.responsePayload.previewText,
      sensitivity: share.responsePayload.sensitivity as
        | "public"
        | "friends"
        | "private",
      relativePath: shareRequestPayload.relativePath ?? "",
      deliveryChannel: shareRequestPayload.deliveryChannel,
      chatRoomId: shareRequestPayload.chatRoomId,
      chatMessageId: shareRequestPayload.chatMessageId,
      chatAttachmentId: shareRequestPayload.chatAttachmentId,
    });
    if (shareRequestPayload.deliveryChannel === "chat" && nodeService) {
      await nodeService.maybeAutoAcceptChatShare({
        shareId: signedResponse.messageId,
        senderOwnerId,
        senderRelativePath: shareRequestPayload.relativePath ?? "",
        requiresApproval: share.responsePayload.requiresApproval,
      });
    }
  }
}