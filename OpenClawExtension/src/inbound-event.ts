import type { OpenClawConfig } from "openclaw/plugin-sdk/config-contracts";
import { composeEnvoyMeshGroupSystemPrompt } from "./context-compose.js";
import { sendBridgeMessage } from "./bridge-client.js";
import { setPendingCorrelationId, takePendingCorrelationId } from "./channel.js";
import { rememberMeshPeer, resolveMeshReplyPeerId } from "./peer-routing.js";
import { getEnvoymeshRuntime } from "./runtime.js";
import { buildEnvoymeshInboundSessionKey } from "./session-key.js";
import type { EnvoymeshInboundMessage, ResolvedEnvoymeshAccount } from "./types.js";

const CHANNEL_ID = "envoymesh";

type EnvoymeshChannelLog = {
  info?: (message: string) => void;
  warn?: (message: string) => void;
  error?: (message: string) => void;
};

function resolveEnvoymeshInboundRoute(params: {
  cfg: OpenClawConfig;
  account: ResolvedEnvoymeshAccount;
  ownerId: string;
}) {
  const rt = getEnvoymeshRuntime();
  const route = rt.channel.routing.resolveAgentRoute({
    cfg: params.cfg,
    channel: CHANNEL_ID,
    accountId: params.account.accountId,
    peer: {
      kind: "direct",
      id: params.ownerId,
    },
  });
  return {
    rt,
    route,
    sessionKey: buildEnvoymeshInboundSessionKey({
      agentId: route.agentId,
      accountId: params.account.accountId,
      ownerId: params.ownerId,
      identityLinks: params.cfg.session?.identityLinks,
    }),
  };
}

async function deliverEnvoymeshReply(params: {
  account: ResolvedEnvoymeshAccount;
  replyPeerId: string;
  fromOwnerId: string;
  payload: { text?: string; body?: string };
}): Promise<{ visibleReplySent: boolean }> {
  const text = params.payload.text ?? params.payload.body;
  if (!text?.trim()) {
    return { visibleReplySent: false };
  }
  const correlationId =
    takePendingCorrelationId(params.fromOwnerId) ??
    takePendingCorrelationId(params.replyPeerId);
  const resolvedTo = resolveMeshReplyPeerId(params.replyPeerId);
  const bridgeTo = resolvedTo.startsWith("envoy_") ? resolvedTo : params.fromOwnerId;
  if (!correlationId && !resolvedTo.startsWith("envoy_")) {
    throw new Error(
      `Cannot route EnvoyMesh reply: missing peer id for target "${params.replyPeerId}". ` +
        "Wait for an inbound P2P message first.",
    );
  }
  await sendBridgeMessage({
    bridgeUrl: params.account.bridgeUrl,
    bridgeSecret: params.account.bridgeSecret,
    to: bridgeTo,
    text,
    correlationId,
  });
  return { visibleReplySent: true };
}

export async function dispatchEnvoymeshInboundEvent(params: {
  account: ResolvedEnvoymeshAccount;
  msg: EnvoymeshInboundMessage;
  log?: EnvoymeshChannelLog;
}): Promise<null> {
  // Thread correlationId for sync ask() replies — key by ownerId and mesh peer id.
  if (params.msg.correlationId) {
    console.log(`[envoymesh] dispatchInbound: storing cid=${params.msg.correlationId} for ownerId=${params.msg.fromOwnerId}`);
    setPendingCorrelationId(params.msg.fromOwnerId, params.msg.correlationId);
    if (params.msg.from?.trim()) {
      setPendingCorrelationId(params.msg.from.trim(), params.msg.correlationId);
    }
  }
  const rt = getEnvoymeshRuntime();
  const currentCfg = rt.config.current() as OpenClawConfig;
  const replyPeerId = params.msg.from || params.msg.fromOwnerId;
  if (params.msg.from) {
    rememberMeshPeer(params.msg.fromOwnerId, params.msg.from);
  }

  const resolved = resolveEnvoymeshInboundRoute({
    cfg: currentCfg,
    account: params.account,
    ownerId: params.msg.fromOwnerId,
  });

  await resolved.rt.channel.inbound.run({
    channel: CHANNEL_ID,
    accountId: params.account.accountId,
    raw: params.msg,
    adapter: {
      ingest: (msg) => ({
        id: `${params.account.accountId}:${msg.fromOwnerId}:${msg.text.slice(0, 64)}`,
        timestamp: Date.now(),
        rawText: msg.text,
        textForAgent: msg.text,
        textForCommands: msg.text,
        raw: msg,
      }),
      resolveTurn: async (input) => {
        const msgCtx = resolved.rt.channel.inbound.buildContext({
          channel: CHANNEL_ID,
          accountId: params.account.accountId,
          timestamp: input.timestamp,
          from: `envoymesh:${params.msg.fromOwnerId}`,
          sender: {
            id: params.msg.fromOwnerId,
            name: params.msg.fromName,
          },
          conversation: {
            kind: "direct",
            id: params.msg.fromOwnerId,
            label: params.msg.fromName || params.msg.fromOwnerId,
          },
          route: {
            agentId: resolved.route.agentId,
            accountId: params.account.accountId,
            routeSessionKey: resolved.sessionKey,
            dispatchSessionKey: resolved.sessionKey,
          },
          reply: {
            to: `envoymesh:${replyPeerId}`,
          },
          message: {
            rawBody: input.rawText,
            commandBody: input.textForCommands,
            bodyForAgent: input.textForAgent,
          },
          supplemental: (() => {
            const groupSystemPrompt = composeEnvoyMeshGroupSystemPrompt(params.msg);
            return groupSystemPrompt ? { groupSystemPrompt } : undefined;
          })(),
          extra: {
            meshPeerId: params.msg.from,
          },
        });
        const storePath = resolved.rt.channel.session.resolveStorePath(currentCfg.session?.store, {
          agentId: resolved.route.agentId,
        });
        return {
          cfg: currentCfg,
          channel: CHANNEL_ID,
          accountId: params.account.accountId,
          agentId: resolved.route.agentId,
          routeSessionKey: resolved.route.sessionKey,
          storePath,
          ctxPayload: msgCtx,
          recordInboundSession: resolved.rt.channel.session.recordInboundSession,
          dispatchReplyWithBufferedBlockDispatcher:
            resolved.rt.channel.reply.dispatchReplyWithBufferedBlockDispatcher,
          delivery: {
            durable: () => ({
              to: replyPeerId,
            }),
            deliver: async (payload) => {
              return await deliverEnvoymeshReply({
                account: params.account,
                replyPeerId,
                fromOwnerId: params.msg.fromOwnerId,
                payload,
              });
            },
          },
          dispatcherOptions: {
            onReplyStart: () => {
              params.log?.info?.(`EnvoyMesh agent reply started for ${params.msg.fromOwnerId}`);
            },
          },
          record: {
            onRecordError: (err) => {
              params.log?.info?.(`EnvoyMesh session metadata update failed`, err);
            },
          },
        };
      },
    },
  });

  return null;
}
