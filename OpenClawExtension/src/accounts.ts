import {
  DEFAULT_ACCOUNT_ID,
  listCombinedAccountIds,
  resolveMergedAccountConfig,
  type OpenClawConfig,
} from "openclaw/plugin-sdk/account-resolution";
import { normalizeStringEntries } from "openclaw/plugin-sdk/string-coerce-runtime";
import type { EnvoymeshChannelConfig, ResolvedEnvoymeshAccount } from "./types.js";

const DEFAULT_BRIDGE_URL = "http://127.0.0.1:3031/bridge/send";
const DEFAULT_WEBHOOK_PATH = "/webhook/envoymesh";

function getChannelConfig(cfg: OpenClawConfig): EnvoymeshChannelConfig | undefined {
  return cfg?.channels?.envoymesh as EnvoymeshChannelConfig | undefined;
}

function resolveImplicitAccountId(channelCfg: EnvoymeshChannelConfig): string | undefined {
  return channelCfg.bridgeUrl || process.env.ENVOYMESH_BRIDGE_URL ? DEFAULT_ACCOUNT_ID : undefined;
}

function getRawAccountConfig(
  channelCfg: EnvoymeshChannelConfig,
  accountId: string,
): EnvoymeshChannelConfig {
  if (accountId === DEFAULT_ACCOUNT_ID) {
    return channelCfg;
  }
  return channelCfg.accounts?.[accountId] ?? {};
}

function parseAllowedOwnerIds(raw: string | string[] | undefined): string[] {
  if (!raw) {
    return [];
  }
  if (Array.isArray(raw)) {
    return raw.filter(Boolean);
  }
  return normalizeStringEntries(raw.split(","));
}

export function listAccountIds(cfg: OpenClawConfig): string[] {
  const channelCfg = getChannelConfig(cfg);
  if (!channelCfg) {
    return [];
  }
  return listCombinedAccountIds({
    configuredAccountIds: Object.keys(channelCfg.accounts ?? {}),
    implicitAccountId: resolveImplicitAccountId(channelCfg),
  });
}

export function resolveAccount(
  cfg: OpenClawConfig,
  accountId?: string | null,
): ResolvedEnvoymeshAccount {
  const channelCfg = getChannelConfig(cfg) ?? {};
  const id = accountId || DEFAULT_ACCOUNT_ID;
  const merged = resolveMergedAccountConfig<Record<string, unknown> & EnvoymeshChannelConfig>({
    channelConfig: channelCfg as Record<string, unknown> & EnvoymeshChannelConfig,
    accounts: channelCfg.accounts as
      | Record<string, Partial<Record<string, unknown> & EnvoymeshChannelConfig>>
      | undefined,
    accountId: id,
  });
  const rawAccount = getRawAccountConfig(channelCfg, id);
  const webhookPathSource =
    typeof rawAccount.webhookPath === "string" && rawAccount.webhookPath.trim().length > 0
      ? "explicit"
      : "default";

  return {
    accountId: id,
    enabled: merged.enabled ?? true,
    bridgeUrl: merged.bridgeUrl ?? process.env.ENVOYMESH_BRIDGE_URL ?? DEFAULT_BRIDGE_URL,
    bridgeSecret: merged.bridgeSecret ?? process.env.ENVOYMESH_BRIDGE_SECRET ?? "",
    inboundSecret: merged.inboundSecret ?? process.env.ENVOYMESH_INBOUND_SECRET ?? "",
    webhookPath: merged.webhookPath ?? DEFAULT_WEBHOOK_PATH,
    webhookPathSource,
    dmPolicy: merged.dmPolicy ?? "allowlist",
    allowedOwnerIds: parseAllowedOwnerIds(
      merged.allowedOwnerIds ?? process.env.ENVOYMESH_ALLOWED_OWNER_IDS,
    ),
  };
}
