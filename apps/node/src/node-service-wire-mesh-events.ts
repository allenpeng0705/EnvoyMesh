/**
 * Wire Mesh Events runtime — mesh handler registration + inbound intent router.
 *
 * Extracted from `node-service-impl.ts` (`_wireMeshEvents`, `_handleInboundMessage`,
 * `_handlePeerDiscovered`).
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NodeConfig, NodeProfile } from "@envoymesh/api";
import { deriveCorrelationIdFromEnvelope } from "@envoymesh/local-store";
import type { LocalPeerDirectoryStore, LocalTaskStore, LocalTrustStore } from "@envoymesh/local-store";
import { handleInboundSocialIntroIntent } from "./social-intro-inbound.js";
import { handleBondIntentViaRuntime, type BondHandlerContext } from "./node-service-handlers-bond-intent.js";
import {
  handleSharePreviewViaRuntime,
  type SharePreviewContext,
} from "./node-service-handlers-share-preview.js";
import {
  handleChatRoomSyncViaRuntime,
  type ChatRoomSyncContext,
} from "./node-service-handlers-chat-room-sync.js";
import {
  handleChatRoomMessageViaRuntime,
  type ChatRoomMessageContext,
} from "./node-service-handlers-chat-room-message.js";
import {
  handleChatMessageViaRuntime,
  type ChatMessageContext,
} from "./node-service-handlers-chat-message.js";

export type WireMeshEventsMessageParams = any;
export type WireMeshEventsPeerDiscoveredParams = any;

export interface WireMeshEventsMeshLike {
  onMessage(handler: (params: WireMeshEventsMessageParams) => Promise<void>): void;
  onPeerDiscovered(
    handler: (params: WireMeshEventsPeerDiscoveredParams) => Promise<void>,
  ): void;
  onPeerDisconnect(handler: (peerId: string) => void): void;
}

export interface WireMeshEventsContext {
  mesh: WireMeshEventsMeshLike;
  onMessage: (params: WireMeshEventsMessageParams) => Promise<void>;
  onPeerDiscovered: (params: WireMeshEventsPeerDiscoveredParams) => Promise<void>;
  onPeerDisconnect: (peerId: string) => void;
}

export interface WireMeshInboundContext {
  inspectInbound(envelope: unknown): any;
  learnInboundDialHints(remotePeerId: string, remoteAddr?: string): Promise<unknown>;
  emit(event: string, payload: unknown): void;
  getProfile(): NodeProfile;
  getTaskStore(): LocalTaskStore;
  trustStore: LocalTrustStore;
  peerDirectoryStore: LocalPeerDirectoryStore;
  getNodeConfig(): Promise<NodeConfig>;
  storePendingSocialIntroProposal(data: unknown): void;
  handleSocialProxyPeerOwnerReady(data: unknown): unknown;
  getSharePreviewContext(): SharePreviewContext;
  getBondHandlerContext(): BondHandlerContext;
  handleInboundProfileIntent(
    envelope: unknown,
    opts: {
      transportPeerId: string;
      remoteAddr?: string;
      replyWithEnvelope?: unknown;
    },
  ): Promise<unknown>;
  getChatRoomSyncContext(): ChatRoomSyncContext;
  getChatRoomMessageContext(): ChatRoomMessageContext;
  getChatMessageContext(): ChatMessageContext;
}

export function buildWireMeshInboundContext(host: any): WireMeshInboundContext {
  return {
    inspectInbound: (envelope) => host._inboundGuard!.inspect(envelope),
    learnInboundDialHints: (remotePeerId, remoteAddr) =>
      host._outboundMessagingContext().learnInboundDialHints(remotePeerId, remoteAddr),
    emit: (event, payload) => host.emit(event, payload),
    getProfile: () => host._requireProfile(),
    getTaskStore: () => {
      if (!host._taskStore) {
        throw new Error("Local task store is not initialised");
      }
      return host._taskStore;
    },
    trustStore: host._trustStore,
    peerDirectoryStore: host._peerDirectoryStore,
    getNodeConfig: () => host.getNodeConfig(),
    storePendingSocialIntroProposal: (data) => host.storePendingSocialIntroProposal(data),
    handleSocialProxyPeerOwnerReady: (data) => host.handleSocialProxyPeerOwnerReady(data),
    getSharePreviewContext: () => host._sharePreviewContext(),
    getBondHandlerContext: () => host._bondHandlerContext(),
    handleInboundProfileIntent: (envelope, opts) =>
      host.handleInboundProfileIntent(envelope, opts),
    getChatRoomSyncContext: () => host._chatRoomSyncContext(),
    getChatRoomMessageContext: () => host._chatRoomMessageContext(),
    getChatMessageContext: () => host._chatMessageContext(),
  };
}

export interface WireMeshPeerDiscoveredContext {
  handleMeshPeerDiscovered(peerId: string, multiaddrs: string[]): Promise<void>;
}

export function wireMeshEventsViaRuntime(ctx: WireMeshEventsContext): void {
  ctx.mesh.onMessage(ctx.onMessage);
  ctx.mesh.onPeerDiscovered(ctx.onPeerDiscovered);
  ctx.mesh.onPeerDisconnect(ctx.onPeerDisconnect);
}

export async function handleInboundMessageViaRuntime(
  ctx: WireMeshInboundContext,
  params: WireMeshEventsMessageParams,
): Promise<void> {
  const { envelope, remotePeerId, remoteAddr, replyWithEnvelope } = params as any;
  const profile = ctx.getProfile();
  const taskStore = ctx.getTaskStore();
  const guardDecision = ctx.inspectInbound(envelope);
  if (guardDecision.action === "reject") {
    console.warn(
      `[inbound-guard] REJECTED envelope intent=${envelope.intent} from ${remotePeerId}: ${guardDecision.reason}`,
    );
    return;
  }

  if (remoteAddr?.trim()) {
    void ctx.learnInboundDialHints(remotePeerId, remoteAddr).catch((err) =>
      console.warn(`[peer-directory] inbound dial hint learn failed:`, err),
    );
  }

  try {
    ctx.emit("p2p:envelope", {
      envelope: envelope as unknown as Record<string, unknown>,
      remotePeerId,
    });
  } catch {
    /* ignore emit errors (e.g. no listeners) */
  }

  const { intent } = envelope;

  if (
    intent === "social.intro.sync" ||
    intent === "social.intro.propose" ||
    intent === "social.intro.owner-ready"
  ) {
    const receivedAt = Date.now();
    const correlationId = deriveCorrelationIdFromEnvelope(envelope);
    const nodeCfg = await ctx.getNodeConfig();
    const intro = await handleInboundSocialIntroIntent({
      envelope,
      profile,
      remotePeerId,
      receivedAt,
      correlationId,
      taskStore,
      trustStore: ctx.trustStore,
      peerDirectoryStore: ctx.peerDirectoryStore,
      trustModeEnabled: nodeCfg.trustModeEnabled ?? false,
      onSocialIntroPropose: (data) => {
        ctx.storePendingSocialIntroProposal({ ...data, commitmentApproved: false });
      },
      onSocialIntroOwnerReady: (data) => {
        void ctx.handleSocialProxyPeerOwnerReady(data);
      },
    });
    if (!intro.ok) {
      console.warn(`[rejected social.intro] ${envelope.intent}: ${intro.reason}`);
    }
    return;
  }

  if (intent === "share.preview") {
    handleSharePreviewViaRuntime(ctx.getSharePreviewContext(), envelope, remotePeerId);
    return;
  }

  if (
    intent === "bond.request" ||
    intent === "bond.accept" ||
    intent === "bond.challenge" ||
    intent === "bond.challenge.response"
  ) {
    await handleBondIntentViaRuntime(ctx.getBondHandlerContext(), {
      envelope,
      remotePeerId,
      remoteAddr,
    });
    return;
  }

  if (
    intent === "profile.sync" ||
    intent === "profile.request" ||
    intent === "profile.response"
  ) {
    await ctx.handleInboundProfileIntent(envelope, {
      transportPeerId: remotePeerId,
      remoteAddr,
      replyWithEnvelope,
    });
    return;
  }

  if (intent === "chat.room.sync") {
    await handleChatRoomSyncViaRuntime(ctx.getChatRoomSyncContext(), {
      envelope,
      remotePeerId,
    });
    return;
  }

  if (intent === "chat.room.message") {
    await handleChatRoomMessageViaRuntime(ctx.getChatRoomMessageContext(), {
      envelope,
      remotePeerId,
      guardDecision,
    });
    return;
  }

  if (intent === "chat.message") {
    await handleChatMessageViaRuntime(ctx.getChatMessageContext(), {
      envelope,
      remotePeerId,
      remoteAddr,
      guardDecision,
      replyWithEnvelope,
    });
  }
}

export async function handlePeerDiscoveredViaRuntime(
  ctx: WireMeshPeerDiscoveredContext,
  params: WireMeshEventsPeerDiscoveredParams,
): Promise<void> {
  const { peerId, multiaddrs } = params as any;
  await ctx.handleMeshPeerDiscovered(peerId, multiaddrs);
}
