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
  /**
   * Unique id of the inbound P2P envelope. Used to dedup retries: a retried
   * webhook POST with the same `messageId` is treated as the same logical
   * message and not delivered twice. Falls back to a synthetic id when the
   * bridge doesn't send one.
   */
  messageId: string;
  /**
   * True when the bridge did not send a `messageId` and we synthesized one.
   * The webhook handler additionally applies a content-hash fallback so
   * a bridge retry within ~10s of the same payload is recognized as a
   * duplicate, even though the synthetic id is fresh each time.
   */
  isLegacy?: boolean;
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
  /**
   * Optional P2P envelope id. Strongly recommended — see EnvoymeshInboundMessage.messageId.
   */
  messageId?: string;
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
