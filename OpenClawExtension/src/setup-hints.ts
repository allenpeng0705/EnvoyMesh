import type { ResolvedEnvoymeshAccount } from "./types.js";

export const DEFAULT_GATEWAY_BASE = "http://127.0.0.1:18789";
export const DEFAULT_WEBHOOK_PATH = "/webhook/envoymesh";
export const DEFAULT_BRIDGE_URL = "http://127.0.0.1:3031/bridge/send";

export function buildAgentUrl(gatewayBase: string, webhookPath: string): string {
  const base = gatewayBase.trim().replace(/\/+$/, "");
  const path = webhookPath.trim().startsWith("/") ? webhookPath.trim() : `/${webhookPath.trim()}`;
  return `${base}${path}`;
}

export function buildBridgeConfigSnippet(params: {
  agentUrl: string;
  listenPort?: number;
  secret?: string;
  agentName?: string;
}): string {
  return JSON.stringify(
    {
      enabled: true,
      agentUrl: params.agentUrl,
      listenPort: params.listenPort ?? 3031,
      agentName: params.agentName ?? "OpenClaw",
      secret: params.secret ?? "",
    },
    null,
    2,
  );
}

export function resolveBridgeConfigHintLines(
  account: ResolvedEnvoymeshAccount,
  gatewayBase = DEFAULT_GATEWAY_BASE,
): string[] {
  const agentUrl = buildAgentUrl(gatewayBase, account.webhookPath);
  return [
    "EnvoyMesh node (~/.envoymesh/<profile>/bridge-config.json):",
    buildBridgeConfigSnippet({
      agentUrl,
      secret: account.bridgeSecret,
    }),
    "",
    `agentUrl must match Gateway + webhookPath → ${agentUrl}`,
  ];
}
