import { createHash } from "node:crypto";

/** Wire prefix for US-MH2 anonymized discovery requester ids. */
export const ANONYMOUS_DISCOVERY_OWNER_PREFIX = "envoy:discovery:anon:";

export type DiscoveryForwardPrivacy = "none" | "anonymous";

export function anonymizeDiscoveryRequesterOwnerId(
  originalOwnerId: string,
  correlationId: string | undefined,
): string {
  const seed = `${originalOwnerId.trim()}|${(correlationId ?? "no-correlation").trim()}`;
  const digest = createHash("sha256").update(seed).digest("base64url").slice(0, 22);
  return `${ANONYMOUS_DISCOVERY_OWNER_PREFIX}${digest}`;
}

export function isAnonymousDiscoveryOwnerId(ownerId: string): boolean {
  return ownerId.trim().startsWith(ANONYMOUS_DISCOVERY_OWNER_PREFIX);
}

/** Audit-safe label — never logs full anonymous token in downstream-facing summaries. */
export function discoveryRequesterAuditLabel(input: {
  requesterOwnerId: string;
  referralOwnerId?: string;
  currentHop?: number;
}): string {
  if (!isAnonymousDiscoveryOwnerId(input.requesterOwnerId)) {
    return input.requesterOwnerId;
  }
  const hop = input.currentHop ?? 0;
  const referral = input.referralOwnerId?.trim();
  if (referral) {
    return `anonymous(hop=${hop},referral=${referral.slice(0, 20)}…)`;
  }
  return `anonymous(hop=${hop})`;
}

export function shouldAnonymizeDiscoveryForward(currentHop: number): boolean {
  return currentHop >= 0;
}
