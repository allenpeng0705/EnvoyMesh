import { DEFAULT_ACCOUNT_ID } from "openclaw/plugin-sdk/account-id";
import type { OpenClawConfig } from "openclaw/plugin-sdk/account-resolution";
import {
  createHybridChannelConfigAdapter,
  createScopedDmSecurityResolver,
} from "openclaw/plugin-sdk/channel-config-helpers";
import { createChatChannelPlugin, type ChannelPlugin } from "openclaw/plugin-sdk/channel-core";
import { waitUntilAbort } from "openclaw/plugin-sdk/channel-outbound";
import {
  createMessageReceiptFromOutboundResults,
  defineChannelMessageAdapter,
  type MessageReceipt,
  type MessageReceiptPartKind,
} from "openclaw/plugin-sdk/channel-outbound";
import {
  composeWarningCollectors,
  createConditionalWarningCollector,
  projectAccountConfigWarningCollector,
  projectAccountWarningCollector,
} from "openclaw/plugin-sdk/channel-policy";
import { createEmptyChannelDirectoryAdapter } from "openclaw/plugin-sdk/directory-runtime";
import { normalizeStringEntries } from "openclaw/plugin-sdk/string-coerce-runtime";
import { listAccountIds, resolveAccount } from "./accounts.js";
import { sendBridgeMessage } from "./bridge-client.js";
import {
  decodeEnvoymeshCronPayload,
  formatReminderDeliveryText,
} from "./remind-payload.js";
import {
  countMissedEnvoymeshReminders,
  takeDueEnvoymeshReminderForTarget,
  takeEnvoymeshReminderForTargetUnchecked,
} from "./remind-delivery-registry.js";
import { EnvoymeshChannelConfigSchema } from "./config-schema.js";
import {
  collectEnvoymeshGatewayRoutingWarnings,
  registerEnvoymeshWebhookRoute,
  validateEnvoymeshGatewayAccountStartup,
} from "./gateway-runtime.js";
import { resolveEnvoymeshBridgeSendTarget, resolveMeshReplyPeerId, canSendEnvoymeshBridgeMessage } from "./peer-routing.js";
import { envoymeshSetupAdapter, envoymeshSetupWizard } from "./setup-surface.js";
import type { ResolvedEnvoymeshAccount } from "./types.js";

const CHANNEL_ID = "envoymesh";

/**
 * Pending correlation IDs for sync ask() calls, keyed by ownerId. Stored
 * alongside an expiry timestamp so abandoned entries (sender crashed, network
 * dropped, etc.) don't accumulate forever — the OpenClaw ask() timeout is
 * 180s, so a 30 min TTL comfortably covers retries + a few restart cycles.
 */
const PENDING_CORRELATION_TTL_MS = 30 * 60_000;
const pendingCorrelationIds = new Map<string, { correlationId: string; expiresAt: number }>();
let pendingCorrelationSweepCounter = 0;

function sweepExpiredCorrelationIds(now: number): void {
  // Light periodic sweep on the write path so we don't accumulate abandoned
  // entries. We don't need a separate timer — every ~64th set call walks
  // the map, which is cheap (entries are O(#active_owners)).
  if ((++pendingCorrelationSweepCounter & 63) !== 0) {
    return;
  }
  for (const [key, value] of pendingCorrelationIds) {
    if (value.expiresAt <= now) {
      pendingCorrelationIds.delete(key);
    }
  }
}

export function setPendingCorrelationId(ownerId: string, correlationId: string): void {
  const now = Date.now();
  pendingCorrelationIds.set(ownerId, { correlationId, expiresAt: now + PENDING_CORRELATION_TTL_MS });
  sweepExpiredCorrelationIds(now);
}

/** Take and remove a pending correlationId for an inbound reply target. */
export function takePendingCorrelationId(targetId: string): string | undefined {
  const entry = pendingCorrelationIds.get(targetId);
  if (!entry) {
    return undefined;
  }
  pendingCorrelationIds.delete(targetId);
  if (entry.expiresAt <= Date.now()) {
    return undefined;
  }
  return entry.correlationId;
}

const resolveEnvoymeshDmPolicy = createScopedDmSecurityResolver<ResolvedEnvoymeshAccount>({
  channelKey: CHANNEL_ID,
  resolvePolicy: (account) => account.dmPolicy,
  resolveAllowFrom: (account) => account.allowedOwnerIds,
  policyPathSuffix: "dmPolicy",
  defaultPolicy: "allowlist",
  approveHint: "openclaw pairing approve envoymesh <code>",
  normalizeEntry: (raw) => raw.trim(),
});

type EnvoymeshChannelGatewayContext = {
  cfg: OpenClawConfig;
  accountId: string;
  abortSignal: AbortSignal;
  log?: {
    info: (message: string) => void;
    warn: (message: string) => void;
    error: (message: string) => void;
  };
};

type EnvoymeshChannelOutboundContext = {
  cfg: OpenClawConfig;
  to: string;
  text?: string;
  accountId?: string | null;
};

type EnvoymeshChannelSendTextContext = EnvoymeshChannelOutboundContext & { text: string };

type EnvoymeshSecurityWarningContext = {
  cfg: OpenClawConfig;
  account: ResolvedEnvoymeshAccount;
};

const envoymeshConfigAdapter = createHybridChannelConfigAdapter<ResolvedEnvoymeshAccount>({
  sectionKey: CHANNEL_ID,
  listAccountIds,
  resolveAccount,
  defaultAccountId: () => DEFAULT_ACCOUNT_ID,
  clearBaseFields: [
    "bridgeUrl",
    "bridgeSecret",
    "inboundSecret",
    "webhookPath",
    "dmPolicy",
    "allowedOwnerIds",
  ],
  resolveAllowFrom: (account) => account.allowedOwnerIds,
  formatAllowFrom: (allowFrom) => normalizeStringEntries(allowFrom),
});

const collectEnvoymeshSecurityWarnings = createConditionalWarningCollector<ResolvedEnvoymeshAccount>(
  (account) =>
    !account.bridgeUrl?.trim() &&
    "- EnvoyMesh: bridgeUrl is not configured. Replies cannot reach the mesh bridge.",
  (account) =>
    account.dmPolicy === "allowlist" &&
    account.allowedOwnerIds.length === 0 &&
    '- EnvoyMesh: dmPolicy="allowlist" with empty allowedOwnerIds blocks all mesh senders.',
  (account) =>
    account.dmPolicy === "open" &&
    account.allowedOwnerIds.length === 0 &&
    '- EnvoyMesh: dmPolicy="open" with empty allowedOwnerIds blocks all senders. Add allowedOwnerIds=["*"] or explicit owner ids.',
);

type EnvoymeshOutboundResult = {
  channel: typeof CHANNEL_ID;
  messageId: string;
  chatId: string;
  receipt: MessageReceipt;
};

type EnvoymeshPlugin = Omit<
  ChannelPlugin<ResolvedEnvoymeshAccount>,
  "pairing" | "security" | "messaging" | "directory" | "outbound" | "gateway" | "agentPrompt"
> & {
  pairing: {
    idLabel: string;
    normalizeAllowEntry?: (entry: string) => string;
  };
  security: {
    resolveDmPolicy: (params: { cfg: OpenClawConfig; account: ResolvedEnvoymeshAccount }) => {
      policy: string | null | undefined;
      allowFrom?: Array<string | number>;
      normalizeEntry?: (raw: string) => string;
    } | null;
    collectWarnings: (params: {
      cfg: OpenClawConfig;
      account: ResolvedEnvoymeshAccount;
    }) => string[];
  };
  messaging: {
    targetPrefixes?: readonly string[];
    normalizeTarget: (target: string) => string | undefined;
    targetResolver: {
      looksLikeId: (id: string) => boolean;
      hint: string;
    };
  };
  directory: {
    self?: NonNullable<ChannelPlugin<ResolvedEnvoymeshAccount>["directory"]>["self"];
    listPeers?: NonNullable<ChannelPlugin<ResolvedEnvoymeshAccount>["directory"]>["listPeers"];
    listGroups?: NonNullable<ChannelPlugin<ResolvedEnvoymeshAccount>["directory"]>["listGroups"];
  };
  outbound: {
    deliveryMode: "gateway";
    textChunkLimit: number;
    sendText: (ctx: EnvoymeshChannelSendTextContext) => Promise<EnvoymeshOutboundResult>;
  };
  message: typeof envoymeshMessageAdapter;
  gateway: {
    startAccount: (ctx: EnvoymeshChannelGatewayContext) => Promise<unknown>;
    stopAccount: (ctx: EnvoymeshChannelGatewayContext) => Promise<void>;
  };
  agentPrompt: {
    messageToolHints: () => string[];
  };
};

const collectEnvoymeshRoutingWarnings = projectAccountConfigWarningCollector<
  ResolvedEnvoymeshAccount,
  OpenClawConfig,
  EnvoymeshSecurityWarningContext
>((cfg) => cfg, ({ account, cfg }) => collectEnvoymeshGatewayRoutingWarnings({ account, cfg }));

function createEnvoymeshSendResult(params: {
  messageId: string;
  chatId: string;
  kind: MessageReceiptPartKind;
}): EnvoymeshOutboundResult {
  return {
    channel: CHANNEL_ID,
    messageId: params.messageId,
    chatId: params.chatId,
    receipt: createMessageReceiptFromOutboundResults({
      results: [
        {
          channel: CHANNEL_ID,
          messageId: params.messageId,
          chatId: params.chatId,
          conversationId: params.chatId,
        },
      ],
      threadId: params.chatId,
      kind: params.kind,
    }),
  };
}

async function sendEnvoymeshText(
  ctx: EnvoymeshChannelSendTextContext,
): Promise<EnvoymeshOutboundResult> {
  const account = resolveAccount(ctx.cfg ?? {}, ctx.accountId);
  const replyTarget = ctx.to.replace(/^envoymesh:/i, "").trim();
  const correlationId =
    takePendingCorrelationId(replyTarget) ??
    takePendingCorrelationId(resolveMeshReplyPeerId(replyTarget));
  const bridgeTo = resolveEnvoymeshBridgeSendTarget(replyTarget);
  if (!canSendEnvoymeshBridgeMessage(replyTarget, correlationId)) {
    throw new Error(
      `EnvoyMesh send requires a mesh peer id (envoy_…) or owner id (envoy:owner:…). Got "${ctx.to}". ` +
        "Use the peer id from the latest inbound message, or the owner's envoy:owner id for proactive reminders.",
    );
  }

  let outboundText = ctx.text ?? "";
  let usedDirectReminder = false;
  if (!correlationId) {
    const decoded = decodeEnvoymeshCronPayload(outboundText);
    if (decoded.payload) {
      outboundText = decoded.payload.content;
      usedDirectReminder = true;
    } else {
      // First try the normal due-window lookup.
      let pending = takeDueEnvoymeshReminderForTarget(bridgeTo);
      if (!pending) {
        // Fallback: the cron might have been scheduled against an owner id
        // and is now being delivered to a different peer id, or the agent is
        // responding outside the normal due window. Try a timing-agnostic
        // lookup so we don't silently drop a fire-able reminder.
        pending = takeEnvoymeshReminderForTargetUnchecked(bridgeTo);
      }
      if (pending) {
        outboundText = pending.content;
        usedDirectReminder = true;
      } else {
        // Surface missed reminders as a short note, so the user understands
        // why their scheduled reminder didn't show up — instead of the
        // pre-fix behavior of silently deleting them.
        const missed = countMissedEnvoymeshReminders();
        if (missed > 0) {
          outboundText = `[envoymesh] ${missed} scheduled reminder(s) were missed while the agent was unavailable. They have been dropped.`;
        }
      }
    }
  }
  if (usedDirectReminder) {
    outboundText = formatReminderDeliveryText(outboundText);
  }

  if (correlationId) {
    console.log(`[envoymesh] sendBridgeMessage: sending reply with cid=${correlationId} for target=${replyTarget}`);
  } else {
    console.log(`[envoymesh] sendBridgeMessage: proactive message to=${bridgeTo}`);
  }

  await sendBridgeMessage({
    bridgeUrl: account.bridgeUrl,
    bridgeSecret: account.bridgeSecret,
    to: bridgeTo,
    text: outboundText,
    correlationId,
  });
  return createEnvoymeshSendResult({
    messageId: `em-${Date.now()}`,
    chatId: bridgeTo.startsWith("envoy_") ? bridgeTo : replyTarget,
    kind: "text",
  });
}

export const envoymeshMessageAdapter = defineChannelMessageAdapter({
  id: CHANNEL_ID,
  durableFinal: {
    capabilities: {
      text: true,
      media: false,
      messageSendingHooks: true,
    },
  },
  send: {
    text: async (ctx) => await sendEnvoymeshText(ctx),
  },
});

export function createEnvoymeshPlugin(): EnvoymeshPlugin {
  return createChatChannelPlugin({
    base: {
      id: CHANNEL_ID,
      meta: {
        id: CHANNEL_ID,
        label: "EnvoyMesh",
        selectionLabel: "EnvoyMesh (P2P Bridge)",
        detailLabel: "EnvoyMesh (P2P Bridge)",
        docsPath: "/channels/envoymesh",
        blurb: "P2P chat via EnvoyMesh node bridge",
        order: 91,
      },
      capabilities: {
        chatTypes: ["direct" as const],
        media: false,
        threads: false,
        reactions: false,
        edit: false,
        unsend: false,
        reply: false,
        effects: false,
        blockStreaming: false,
      },
      reload: { configPrefixes: [`channels.${CHANNEL_ID}`] },
      configSchema: EnvoymeshChannelConfigSchema,
      setup: envoymeshSetupAdapter,
      setupWizard: envoymeshSetupWizard,
      config: envoymeshConfigAdapter,
      messaging: {
        targetPrefixes: ["envoymesh"],
        normalizeTarget: (target: string) => {
          const trimmed = target.trim();
          if (!trimmed) {
            return undefined;
          }
          return trimmed.replace(/^envoymesh:/i, "").trim();
        },
        targetResolver: {
          looksLikeId: (id: string) => {
            const trimmed = id?.trim();
            if (!trimmed) {
              return false;
            }
            return (
              trimmed.startsWith("envoy_") ||
              trimmed.startsWith("envoy:owner:") ||
              /^envoymesh:/i.test(trimmed)
            );
          },
          hint: "<peerId|ownerId>",
        },
      },
      directory: createEmptyChannelDirectoryAdapter(),
      gateway: {
        startAccount: async (ctx: EnvoymeshChannelGatewayContext) => {
          const { cfg, accountId, log, abortSignal } = ctx;
          const account = resolveAccount(cfg, accountId);
          if (!validateEnvoymeshGatewayAccountStartup({ cfg, account, accountId, log }).ok) {
            return waitUntilAbort(abortSignal);
          }
          log?.info?.(
            `Starting EnvoyMesh channel (account: ${accountId}, webhook: ${account.webhookPath}, bridge: ${account.bridgeUrl})`,
          );
          const unregister = registerEnvoymeshWebhookRoute({ account, accountId, log });
          log?.info?.(`Registered EnvoyMesh HTTP route: ${account.webhookPath}`);
          return waitUntilAbort(abortSignal, () => {
            log?.info?.(`Stopping EnvoyMesh channel (account: ${accountId})`);
            unregister();
          });
        },
        stopAccount: async (ctx: EnvoymeshChannelGatewayContext) => {
          ctx.log?.info?.(`EnvoyMesh account ${ctx.accountId} stopped`);
        },
      },
      agentPrompt: {
        messageToolHints: () => [
          "",
          "### EnvoyMesh bridge",
          "Replies are delivered to the mesh via POST /bridge/send on the EnvoyMesh node.",
          "Use the sender's mesh peer id (envoy_…) as the reply target when sending proactively.",
          "For reminders ('in 5 minutes', etc.): use `envoymesh_remind` — NOT the generic cron tool.",
          "Mesh capabilities: use tools `envoymesh_list_mesh_tools` and `envoymesh_execute_mesh_tool`.",
          "Async discovery/knowledge responses arrive as `[EnvoyMesh async …]` messages on this channel.",
        ],
      },
      message: envoymeshMessageAdapter,
    },
    pairing: {
      text: {
        idLabel: "envoymeshOwnerId",
        normalizeAllowEntry: (entry: string) => entry.trim(),
      },
    },
    security: {
      resolveDmPolicy: resolveEnvoymeshDmPolicy,
      collectWarnings: composeWarningCollectors(
        projectAccountWarningCollector<ResolvedEnvoymeshAccount, EnvoymeshSecurityWarningContext>(
          collectEnvoymeshSecurityWarnings,
        ),
        collectEnvoymeshRoutingWarnings,
      ),
    },
    outbound: {
      deliveryMode: "gateway" as const,
      textChunkLimit: 128_000,
      sendText: sendEnvoymeshText,
      sendMedia: async () => {
        throw new Error("EnvoyMesh bridge does not support media in MVP");
      },
    },
  }) as unknown as EnvoymeshPlugin;
}

export const envoymeshPlugin = createEnvoymeshPlugin();
