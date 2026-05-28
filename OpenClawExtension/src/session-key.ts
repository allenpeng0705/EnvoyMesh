import { buildAgentSessionKey } from "openclaw/plugin-sdk/routing";

const CHANNEL_ID = "envoymesh";

export function buildEnvoymeshInboundSessionKey(params: {
  agentId: string;
  accountId: string;
  ownerId: string;
  identityLinks?: Record<string, string[]>;
}): string {
  return buildAgentSessionKey({
    agentId: params.agentId,
    channel: CHANNEL_ID,
    accountId: params.accountId,
    peer: { kind: "direct", id: params.ownerId },
    dmScope: "per-account-channel-peer",
    identityLinks: params.identityLinks,
  });
}
