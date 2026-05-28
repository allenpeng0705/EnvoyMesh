import type { OpenClawConfig } from "openclaw/plugin-sdk/account-resolution";
import { registerPluginHttpRoute } from "openclaw/plugin-sdk/webhook-ingress";
import { listAccountIds, resolveAccount } from "./accounts.js";
import { dispatchEnvoymeshInboundEvent } from "./inbound-event.js";
import type { ResolvedEnvoymeshAccount } from "./types.js";
import { createEnvoymeshWebhookHandler } from "./webhook-handler.js";

const CHANNEL_ID = "envoymesh";

type EnvoymeshGatewayLog = {
  info?: (message: string) => void;
  warn?: (message: string) => void;
  error?: (message: string) => void;
};

type EnvoymeshGatewayStartupIssueCode =
  | "disabled"
  | "missing-bridge-url"
  | "empty-allowlist"
  | "empty-open-allowlist"
  | "duplicate-webhook-path";

type EnvoymeshGatewayStartupIssue = {
  code: EnvoymeshGatewayStartupIssueCode;
  logLevel: "info" | "warn";
  message: string;
};

const activeRouteUnregisters = new Map<string, () => void>();

function buildStartupIssue(
  code: EnvoymeshGatewayStartupIssueCode,
  message: string,
  logLevel: "info" | "warn" = "warn",
): EnvoymeshGatewayStartupIssue {
  return { code, logLevel, message };
}

function logStartupIssues(log: EnvoymeshGatewayLog | undefined, issues: EnvoymeshGatewayStartupIssue[]) {
  for (const issue of issues) {
    const message = `EnvoyMesh ${issue.message}`;
    if (issue.logLevel === "info") {
      log?.info?.(message);
      continue;
    }
    log?.warn?.(message);
  }
}

function getRouteKey(account: ResolvedEnvoymeshAccount): string {
  return `${account.accountId}:${account.webhookPath}`;
}

function collectEnvoymeshGatewayStartupIssues(params: {
  cfg: OpenClawConfig;
  account: ResolvedEnvoymeshAccount;
  accountId: string;
}): EnvoymeshGatewayStartupIssue[] {
  const { account, accountId } = params;
  const issues: EnvoymeshGatewayStartupIssue[] = [];

  if (!account.enabled) {
    issues.push(buildStartupIssue("disabled", `account ${accountId} is disabled, skipping`, "info"));
    return issues;
  }
  if (!account.bridgeUrl.trim()) {
    issues.push(
      buildStartupIssue("missing-bridge-url", `account ${accountId} missing bridgeUrl for outbound replies`),
    );
  }
  if (account.dmPolicy === "allowlist" && account.allowedOwnerIds.length === 0) {
    issues.push(
      buildStartupIssue(
        "empty-allowlist",
        `account ${accountId} has dmPolicy=allowlist but empty allowedOwnerIds; refusing to start route`,
      ),
    );
  }
  if (account.dmPolicy === "open" && account.allowedOwnerIds.length === 0) {
    issues.push(
      buildStartupIssue(
        "empty-open-allowlist",
        `account ${accountId} has dmPolicy=open but empty allowedOwnerIds; add allowedOwnerIds=["*"] or explicit owner ids`,
      ),
    );
  }

  const accountIds = listAccountIds(params.cfg);
  const conflictingAccounts = accountIds.filter((candidateId) => {
    if (candidateId === accountId) {
      return false;
    }
    const candidate = resolveAccount(params.cfg, candidateId);
    return candidate.enabled && candidate.webhookPath === account.webhookPath;
  });
  if (conflictingAccounts.length > 0) {
    issues.push(
      buildStartupIssue(
        "duplicate-webhook-path",
        `account ${accountId} conflicts on webhookPath ${account.webhookPath} with ${conflictingAccounts.join(", ")}`,
      ),
    );
  }

  return issues;
}

export function collectEnvoymeshGatewayRoutingWarnings(params: {
  cfg: OpenClawConfig;
  account: ResolvedEnvoymeshAccount;
}): string[] {
  return collectEnvoymeshGatewayStartupIssues({
    cfg: params.cfg,
    account: params.account,
    accountId: params.account.accountId,
  })
    .filter((issue) => issue.code === "duplicate-webhook-path")
    .map((issue) => `- EnvoyMesh: ${issue.message}`);
}

export function validateEnvoymeshGatewayAccountStartup(params: {
  cfg: OpenClawConfig;
  account: ResolvedEnvoymeshAccount;
  accountId: string;
  log?: EnvoymeshGatewayLog;
}): { ok: true } | { ok: false } {
  const issues = collectEnvoymeshGatewayStartupIssues(params);
  if (issues.length > 0) {
    logStartupIssues(params.log, issues);
    return { ok: false };
  }
  return { ok: true };
}

export function registerEnvoymeshWebhookRoute(params: {
  account: ResolvedEnvoymeshAccount;
  accountId: string;
  log?: EnvoymeshGatewayLog;
}): () => void {
  const { account, log } = params;
  const routeKey = getRouteKey(account);
  const prevUnregister = activeRouteUnregisters.get(routeKey);
  if (prevUnregister) {
    log?.info?.(`Deregistering stale EnvoyMesh route before re-registering: ${account.webhookPath}`);
    prevUnregister();
    activeRouteUnregisters.delete(routeKey);
  }

  const handler = createEnvoymeshWebhookHandler({
    account,
    deliver: async (msg) => {
      await dispatchEnvoymeshInboundEvent({ account, msg, log });
    },
    log,
  });
  const unregister = registerPluginHttpRoute({
    path: account.webhookPath,
    auth: "plugin",
    pluginId: CHANNEL_ID,
    accountId: account.accountId,
    log: (msg: string) => log?.info?.(msg),
    handler,
  });
  activeRouteUnregisters.set(routeKey, unregister);
  return () => {
    unregister();
    activeRouteUnregisters.delete(routeKey);
  };
}
