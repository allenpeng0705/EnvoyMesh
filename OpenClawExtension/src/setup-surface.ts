import { DEFAULT_ACCOUNT_ID } from "openclaw/plugin-sdk/account-id";
import type { OpenClawConfig } from "openclaw/plugin-sdk/config-contracts";
import {
  createStandardChannelSetupStatus,
  createTopLevelChannelDmPolicy,
  formatDocsLink,
  mergeAllowFromEntries,
  normalizeAccountId,
  parseSetupEntriesWithParser,
  type ChannelSetupAdapter,
  type ChannelSetupDmPolicy,
  type ChannelSetupWizard,
  type DmPolicy,
} from "openclaw/plugin-sdk/setup";
import { listAccountIds, resolveAccount } from "./accounts.js";
import {
  buildAgentUrl,
  buildBridgeConfigSnippet,
  DEFAULT_BRIDGE_URL,
  DEFAULT_GATEWAY_BASE,
  DEFAULT_WEBHOOK_PATH,
} from "./setup-hints.js";
import {
  isEnvoymeshConfigured,
  patchEnvoymeshAccountConfig,
  resolveEnvoymeshAccountCount,
  resolveEnvoymeshSetupStatusLines,
} from "./setup-core.js";

const channel = "envoymesh" as const;

const ENVOYMESH_SETUP_HELP_LINES = [
  "Connect OpenClaw to an EnvoyMesh home node P2P bridge (Phase 9K).",
  "HomeClaw users: keep using HomeClaw channels/envoymesh — this plugin is for OpenClaw only.",
  `Default webhook: ${DEFAULT_WEBHOOK_PATH} on your Gateway (often port 18789).`,
  `Default bridge replies: ${DEFAULT_BRIDGE_URL}`,
  `Docs: ${formatDocsLink("/channels/envoymesh", "channels/envoymesh")}`,
  `EnvoyMesh install guide: see EnvoyMesh repo docs/openclaw-extension.md`,
];

const ENVOYMESH_ALLOW_FROM_HELP = [
  "Owner DIDs from inbound fromOwnerId (envoy:owner:…).",
  "Use dmPolicy=open with allowedOwnerIds=[\"*\"] only if you intend public mesh DMs.",
  `Docs: ${formatDocsLink("/channels/envoymesh", "channels/envoymesh")}`,
];

function parseOwnerIdAllowFrom(raw: string): { entries: string[]; error?: string } {
  return parseSetupEntriesWithParser(raw, (entry) => {
    const cleaned = entry.replace(/^envoymesh:/i, "").trim();
    if (!cleaned) {
      return { error: "empty entry" };
    }
    if (cleaned !== "*" && !cleaned.startsWith("envoy:owner:")) {
      return { error: `Expected envoy:owner:… or *; got ${entry}` };
    }
    return { value: cleaned };
  });
}

const promptEnvoymeshAllowFrom: NonNullable<ChannelSetupDmPolicy["promptAllowFrom"]> = async ({
  cfg,
  prompter,
}) => {
  const account = resolveAccount(cfg, DEFAULT_ACCOUNT_ID);
  await prompter.note(ENVOYMESH_ALLOW_FROM_HELP.join("\n"), "EnvoyMesh allowlist");
  const raw = await prompter.text({
    message: "Allowed mesh owner ids (comma-separated)",
    placeholder: "envoy:owner:abc..., envoy:owner:def...",
    initialValue: account.allowedOwnerIds.join(", ") || undefined,
  });
  const parsed = parseOwnerIdAllowFrom(raw);
  if (parsed.error) {
    throw new Error(parsed.error);
  }
  const existing = account.allowedOwnerIds;
  const allowedOwnerIds = mergeAllowFromEntries(existing, parsed.entries);
  return patchEnvoymeshAccountConfig({
    cfg,
    accountId: DEFAULT_ACCOUNT_ID,
    enabled: true,
    patch: { allowedOwnerIds, dmPolicy: "allowlist" },
  });
};

const envoymeshDmPolicy: ChannelSetupDmPolicy = createTopLevelChannelDmPolicy({
  label: "EnvoyMesh",
  channel,
  policyKey: "channels.envoymesh.dmPolicy",
  allowFromKey: "channels.envoymesh.allowedOwnerIds",
  getCurrent: (cfg) => (cfg.channels?.envoymesh?.dmPolicy as DmPolicy | undefined) ?? "allowlist",
  promptAllowFrom: promptEnvoymeshAllowFrom,
});

export const envoymeshSetupAdapter: ChannelSetupAdapter = {
  resolveAccountId: ({ accountId }) => normalizeAccountId(accountId),
  validateInput: ({ input }) => {
    if (!input.bridgeUrl?.trim()) {
      return "EnvoyMesh requires bridgeUrl (EnvoyMesh /bridge/send endpoint).";
    }
    return null;
  },
  applyAccountConfig: ({ cfg, accountId, input }) => {
    const inboundSecret = input.inboundSecret?.trim() || input.bridgeSecret?.trim() || "";
    return patchEnvoymeshAccountConfig({
      cfg,
      accountId,
      enabled: true,
      patch: {
        bridgeUrl: input.bridgeUrl?.trim() || DEFAULT_BRIDGE_URL,
        bridgeSecret: input.bridgeSecret?.trim() ?? "",
        inboundSecret,
        webhookPath: input.webhookPath?.trim() || DEFAULT_WEBHOOK_PATH,
        dmPolicy: (input.dmPolicy as DmPolicy | undefined) ?? "allowlist",
        allowedOwnerIds: input.allowedOwnerIds,
      },
    });
  },
  resolveConfigured: ({ cfg, accountId }) => isEnvoymeshConfigured(cfg, accountId),
};

export const envoymeshSetupWizard: ChannelSetupWizard = {
  channel,
  status: createStandardChannelSetupStatus({
    channelLabel: "EnvoyMesh",
    configuredLabel: "EnvoyMesh bridge configured",
    unconfiguredLabel: "EnvoyMesh bridge needs bridgeUrl",
    configuredHint: "Bridge URL and webhook path set",
    unconfiguredHint: "Set bridgeUrl to the EnvoyMesh node /bridge/send endpoint",
    configuredScore: 1,
    unconfiguredScore: 0,
    includeStatusLine: true,
    resolveConfigured: ({ cfg, accountId }) =>
      accountId
        ? isEnvoymeshConfigured(cfg, accountId)
        : listAccountIds(cfg).some((id) => isEnvoymeshConfigured(cfg, id)),
    resolveExtraStatusLines: ({ cfg, accountId }) => {
      const id = accountId ?? DEFAULT_ACCOUNT_ID;
      return [
        `Accounts: ${resolveEnvoymeshAccountCount(cfg)}`,
        ...resolveEnvoymeshSetupStatusLines(cfg, id),
      ];
    },
  }),
  introNote: {
    title: "EnvoyMesh P2P bridge",
    lines: ENVOYMESH_SETUP_HELP_LINES,
  },
  credentials: [
    {
      inputKey: "bridgeSecret",
      providerHint: channel,
      credentialLabel: "bridge Bearer secret",
      preferredEnvVar: "ENVOYMESH_BRIDGE_SECRET",
      envPrompt: "Use ENVOYMESH_BRIDGE_SECRET from the environment?",
      keepPrompt: "Keep existing bridge secret?",
      inputPrompt: "Shared secret for /bridge/send (optional; recommended)",
      inspect: ({ cfg, accountId }) => {
        const account = resolveAccount(cfg, accountId);
        return {
          accountConfigured: isEnvoymeshConfigured(cfg, accountId),
          hasConfiguredValue: Boolean(account.bridgeSecret.trim()),
          resolvedValue: account.bridgeSecret,
          envValue:
            accountId === DEFAULT_ACCOUNT_ID
              ? process.env.ENVOYMESH_BRIDGE_SECRET?.trim()
              : undefined,
        };
      },
      applySet: async ({ cfg, accountId, value }) => {
        const account = resolveAccount(cfg, accountId);
        const inboundSecret = account.inboundSecret.trim() || value;
        return patchEnvoymeshAccountConfig({
          cfg,
          accountId,
          enabled: true,
          patch: { bridgeSecret: value, inboundSecret },
        });
      },
    },
  ],
  textInputs: [
    {
      inputKey: "bridgeUrl",
      message: `EnvoyMesh bridge URL for replies (default ${DEFAULT_BRIDGE_URL})`,
      currentValue: ({ cfg, accountId }) => resolveAccount(cfg, accountId).bridgeUrl,
      validate: ({ value }) => {
        try {
          const url = new URL(value.trim());
          if (!url.protocol.startsWith("http")) {
            return "bridgeUrl must be http or https";
          }
        } catch {
          return "Invalid bridgeUrl";
        }
        return undefined;
      },
      applySet: async ({ cfg, accountId, value }) =>
        patchEnvoymeshAccountConfig({
          cfg,
          accountId,
          enabled: true,
          patch: { bridgeUrl: value.trim() },
        }),
    },
    {
      inputKey: "webhookPath",
      message: `Gateway webhook path for mesh inbound (default ${DEFAULT_WEBHOOK_PATH})`,
      currentValue: ({ cfg, accountId }) => resolveAccount(cfg, accountId).webhookPath,
      validate: ({ value }) => {
        const trimmed = value.trim();
        if (!trimmed.startsWith("/")) {
          return "webhookPath must start with /";
        }
        return undefined;
      },
      applySet: async ({ cfg, accountId, value }) =>
        patchEnvoymeshAccountConfig({
          cfg,
          accountId,
          enabled: true,
          patch: { webhookPath: value.trim() },
        }),
    },
  ],
  finalize: async ({ cfg, accountId, prompter }) => {
    let next = cfg;
    const account = resolveAccount(next, accountId);
    if (!account.inboundSecret.trim() && account.bridgeSecret.trim()) {
      next = patchEnvoymeshAccountConfig({
        cfg: next,
        accountId,
        patch: { inboundSecret: account.bridgeSecret },
      });
    }
    const agentUrl = buildAgentUrl(DEFAULT_GATEWAY_BASE, account.webhookPath);
    await prompter.note(
      [
        "Copy into your EnvoyMesh node bridge-config.json (separate from HomeClaw):",
        "",
        buildBridgeConfigSnippet({
          agentUrl,
          secret: account.bridgeSecret,
        }),
        "",
        `If your Gateway is not on ${DEFAULT_GATEWAY_BASE}, change agentUrl accordingly.`,
        "Restart EnvoyMesh node and OpenClaw Gateway after saving.",
      ].join("\n"),
      "EnvoyMesh bridge-config.json",
    );
    return { cfg: next };
  },
  dmPolicy: envoymeshDmPolicy,
};
