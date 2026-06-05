export type EnvoymeshWebhookPathSource = "explicit" | "default";

export type EnvoymeshChannelConfig = {
  enabled?: boolean;
  bridgeUrl?: string;
  bridgeSecret?: string;
  inboundSecret?: string;
  webhookPath?: string;
  dmPolicy?: "open" | "allowlist" | "disabled";
  allowedOwnerIds?: string | string[];
  accounts?: Record<string, EnvoymeshChannelConfig>;
};

export type ResolvedEnvoymeshAccount = {
  accountId: string;
  enabled: boolean;
  bridgeUrl: string;
  bridgeSecret: string;
  inboundSecret: string;
  webhookPath: string;
  webhookPathSource: EnvoymeshWebhookPathSource;
  dmPolicy: "open" | "allowlist" | "disabled";
  allowedOwnerIds: string[];
};

export type EnvoymeshInboundMessage = {
  from: string;
  fromOwnerId: string;
  fromName: string;
  text: string;
  /** Trusted EnvoyMesh policy (appended to OpenClaw system prompt). */
  policyPrompt?: string;
  /** Trusted EnvoyMesh retrieved context: vault RAG, chat history, profile. */
  retrievedContext?: string;
  /** @deprecated Use policyPrompt — kept for backward compatibility. */
  systemPrompt?: string;
  correlationId?: string;
};

export type EnvoymeshChatWebhookPayload = {
  from?: string;
  fromOwnerId?: string;
  fromName?: string;
  text?: string;
  policyPrompt?: string;
  retrievedContext?: string;
  systemPrompt?: string;
  correlationId?: string;
};

export type EnvoymeshAsyncWebhookPayload = {
  type: "mesh.async_reply";
  intent?: "discovery.response" | "knowledge.response" | string;
  correlationId?: string;
  fromPeerId?: string;
  remotePeerId?: string;
  messageId?: string;
  payload?: unknown;
};

export type EnvoymeshWebhookPayload = EnvoymeshChatWebhookPayload | EnvoymeshAsyncWebhookPayload;

export type EnvoymeshAsyncInboundMessage = {
  kind: "async";
  intent: string;
  correlationId?: string;
  fromPeerId: string;
  remotePeerId?: string;
  messageId: string;
  payload: unknown;
};

export function isEnvoymeshAsyncWebhookPayload(
  payload: EnvoymeshWebhookPayload,
): payload is EnvoymeshAsyncWebhookPayload {
  return (payload as EnvoymeshAsyncWebhookPayload).type === "mesh.async_reply";
}
