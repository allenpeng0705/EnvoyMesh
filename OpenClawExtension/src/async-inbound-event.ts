import type { OpenClawConfig } from "openclaw/plugin-sdk/config-contracts";
import { getEnvoymeshRuntime } from "./runtime.js";
import { buildEnvoymeshInboundSessionKey } from "./session-key.js";
import type { EnvoymeshAsyncInboundMessage, ResolvedEnvoymeshAccount } from "./types.js";

const CHANNEL_ID = "envoymesh";

type EnvoymeshChannelLog = {
  info?: (message: string) => void;
};

function formatAsyncReplyForAgent(msg: EnvoymeshAsyncInboundMessage): string {
  const header = `[EnvoyMesh async ${msg.intent}] messageId=${msg.messageId}`;
  const meta = [
    msg.correlationId ? `correlationId=${msg.correlationId}` : undefined,
    msg.remotePeerId ? `remotePeerId=${msg.remotePeerId}` : undefined,
    `fromPeerId=${msg.fromPeerId}`,
  ]
    .filter(Boolean)
    .join(" ");
  const body = JSON.stringify(msg.payload ?? null, null, 2);
  return `${header}\n${meta}\n\n${body}`;
}

export async function dispatchEnvoymeshAsyncInboundEvent(params: {
  account: ResolvedEnvoymeshAccount;
  msg: EnvoymeshAsyncInboundMessage;
  log?: EnvoymeshChannelLog;
}): Promise<null> {
  const rt = getEnvoymeshRuntime();
  const currentCfg = rt.config.current() as OpenClawConfig;
  const sessionPeerId = params.msg.fromPeerId;
  const text = formatAsyncReplyForAgent(params.msg);

  const route = rt.channel.routing.resolveAgentRoute({
    cfg: currentCfg,
    channel: CHANNEL_ID,
    accountId: params.account.accountId,
    peer: { kind: "direct", id: sessionPeerId },
  });
  const sessionKey = buildEnvoymeshInboundSessionKey({
    agentId: route.agentId,
    accountId: params.account.accountId,
    ownerId: sessionPeerId,
    identityLinks: currentCfg.session?.identityLinks,
  });

  await rt.channel.inbound.run({
    channel: CHANNEL_ID,
    accountId: params.account.accountId,
    raw: params.msg,
    adapter: {
      ingest: () => ({
        id: `${params.account.accountId}:async:${params.msg.messageId}`,
        timestamp: Date.now(),
        rawText: text,
        textForAgent: text,
        textForCommands: text,
        raw: params.msg,
      }),
      resolveTurn: async (input) => {
        const msgCtx = rt.channel.inbound.buildContext({
          channel: CHANNEL_ID,
          accountId: params.account.accountId,
          timestamp: input.timestamp,
          from: `envoymesh:${sessionPeerId}`,
          sender: {
            id: sessionPeerId,
            name: sessionPeerId,
          },
          conversation: {
            kind: "direct",
            id: sessionPeerId,
            label: `mesh:${params.msg.intent}`,
          },
          route: {
            agentId: route.agentId,
            accountId: params.account.accountId,
            routeSessionKey: sessionKey,
            dispatchSessionKey: sessionKey,
          },
          reply: {
            to: `envoymesh:${sessionPeerId}`,
          },
          message: {
            rawBody: input.rawText,
            commandBody: input.textForCommands,
            bodyForAgent: input.textForAgent,
          },
          extra: {
            meshAsyncIntent: params.msg.intent,
            meshAsyncCorrelationId: params.msg.correlationId,
          },
        });
        const storePath = rt.channel.session.resolveStorePath(currentCfg.session?.store, {
          agentId: route.agentId,
        });
        return {
          cfg: currentCfg,
          channel: CHANNEL_ID,
          accountId: params.account.accountId,
          agentId: route.agentId,
          routeSessionKey: route.sessionKey,
          storePath,
          ctxPayload: msgCtx,
          recordInboundSession: rt.channel.session.recordInboundSession,
          dispatchReplyWithBufferedBlockDispatcher:
            rt.channel.reply.dispatchReplyWithBufferedBlockDispatcher,
          delivery: {
            durable: () => ({ to: sessionPeerId }),
            deliver: async () => ({ visibleReplySent: false }),
          },
          dispatcherOptions: {
            onReplyStart: () => {
              params.log?.info?.(`EnvoyMesh async ${params.msg.intent} dispatch started`);
            },
          },
        };
      },
    },
  });

  return null;
}
