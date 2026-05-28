import { DEFAULT_ACCOUNT_ID } from "openclaw/plugin-sdk/account-id";
import type { OpenClawConfig } from "openclaw/plugin-sdk/config-contracts";
import { listAccountIds, resolveAccount } from "./accounts.js";
import { resolveBridgeConfigHintLines } from "./setup-hints.js";
import type { EnvoymeshChannelConfig } from "./types.js";

const channel = "envoymesh" as const;

export function getEnvoymeshChannelConfig(cfg: OpenClawConfig): EnvoymeshChannelConfig {
  return (cfg.channels?.[channel] as EnvoymeshChannelConfig | undefined) ?? {};
}

export function patchEnvoymeshAccountConfig(params: {
  cfg: OpenClawConfig;
  accountId: string;
  patch: Record<string, unknown>;
  enabled?: boolean;
}): OpenClawConfig {
  const next = structuredClone(params.cfg);
  const channels = { ...(next.channels ?? {}) };
  const current = { ...(channels[channel] as EnvoymeshChannelConfig) };
  const patch = { ...params.patch };
  if (params.enabled !== undefined) {
    patch.enabled = params.enabled;
  }
  if (params.accountId === DEFAULT_ACCOUNT_ID) {
    channels[channel] = { ...current, ...patch };
  } else {
    const accounts = { ...(current.accounts ?? {}) };
    accounts[params.accountId] = { ...(accounts[params.accountId] ?? {}), ...patch };
    channels[channel] = { ...current, accounts };
  }
  next.channels = channels;
  return next;
}

export function isEnvoymeshConfigured(cfg: OpenClawConfig, accountId?: string): boolean {
  const id = accountId ?? DEFAULT_ACCOUNT_ID;
  const account = resolveAccount(cfg, id);
  return Boolean(account.enabled && account.bridgeUrl.trim());
}

export function resolveEnvoymeshSetupStatusLines(
  cfg: OpenClawConfig,
  accountId: string,
): string[] {
  const account = resolveAccount(cfg, accountId);
  const lines = [
    `bridgeUrl: ${account.bridgeUrl}`,
    `webhookPath: ${account.webhookPath}`,
    `dmPolicy: ${account.dmPolicy}`,
    `allowedOwnerIds: ${account.allowedOwnerIds.join(", ") || "(empty)"}`,
  ];
  if (isEnvoymeshConfigured(cfg, accountId)) {
    lines.push("", ...resolveBridgeConfigHintLines(account));
  }
  return lines;
}

export function resolveEnvoymeshAccountCount(cfg: OpenClawConfig): number {
  return listAccountIds(cfg).length;
}
