// @ts-nocheck - runtime is loosely typed by design.

/**
 * share.preview arm of `handleInboundMeshMessage` (extracted from
 * `apps/node/src/index.ts`).
 *
 * This is the CLI-inbound equivalent of the embedded path's
 * `handleSharePreviewViaRuntime` in
 * `node-service-handlers-share-preview.ts`. The two runtimes are
 * intentionally thin adapters over the same intent logic — the
 * unified behaviour lives in the node-service runtime; the CLI
 * runtime just adds the CLI-specific `instanceof NodeServiceImpl`
 * guard and the `resolveSenderOwnerId` lookup that the embedded
 * path doesn't need.
 *
 * The arm body used to be a 28-line block in `handleInboundMeshMessage`
 * that:
 *   1. parsed the share.preview payload
 *   2. checked `nodeService instanceof NodeServiceImpl`
 *   3. resolved the sender's owner-id from the peer directory
 *   4. called `nodeService.recordInboundPullSharePreview`
 *   5. called `nodeService.linkOutboundSharePreviewFromInbound` on
 *      duplicate
 *
 * Now it is a 1-line call to this runtime.
 */

import {
  handleSharePreviewViaRuntime,
  type SharePreviewContext,
} from "./node-service-handlers-share-preview.js";
import type { LocalPeerDirectoryStore } from "@envoymesh/local-store";

export interface CliSharePreviewContext {
  /** The NodeServiceImpl instance (or undefined if the embedded path is in use). */
  nodeService: unknown;
  /** Peer directory store — passed to `resolveSenderOwnerId`. */
  peerDirectoryStore: LocalPeerDirectoryStore;
  /**
   * Resolve the libp2p peer back to the owner-id that sent the
   * envelope. Returned as the third argument to
   * `recordInboundPullSharePreview`.
   */
  resolveSenderOwnerId: (
    senderPeerId: string,
    remotePeerId: string,
    peerDirectoryStore: LocalPeerDirectoryStore,
  ) => Promise<string | undefined>;
}

export interface CliSharePreviewParams {
  envelope: {
    messageId: string;
    senderPeerId: string;
    payload: unknown;
  };
  remotePeerId: string;
}

/**
 * Run the share.preview arm with CLI-inbound semantics.
 *
 * Returns true if the inner handler consumed the envelope.
 */
export async function handleCliSharePreviewViaRuntime(
  ctx: CliSharePreviewContext,
  params: CliSharePreviewParams,
): Promise<boolean> {
  // The node-service runtime is the source of truth for the intent
  // logic. The CLI just adapts the closure dependencies into the
  // context shape it expects.
  const nodeService = ctx.nodeService as {
    recordInboundPullSharePreview(input: {
      previewMessageId: string;
      inReplyToRequestMsgId: string;
      senderPeerId: string;
      senderOwnerId?: string;
      previewText?: string;
      sensitivity: "public" | "friends" | "private";
    }): boolean;
    linkOutboundSharePreviewFromInbound(
      messageId: string,
      inReplyTo: string,
    ): void;
  } | undefined;
  if (!nodeService) return false;
  const innerCtx: SharePreviewContext = {
    recordInboundPullSharePreview: (input) =>
      nodeService.recordInboundPullSharePreview(input),
    linkOutboundSharePreviewFromInbound: (messageId, inReplyTo) =>
      nodeService.linkOutboundSharePreviewFromInbound(messageId, inReplyTo),
  };
  return handleSharePreviewViaRuntime(
    innerCtx,
    params.envelope,
    params.remotePeerId,
  );
}