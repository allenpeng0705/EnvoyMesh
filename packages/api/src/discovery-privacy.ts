import { sha256 } from "@noble/hashes/sha2.js";

/** Wire prefix for US-MH2 anonymized discovery requester ids. */
export const ANONYMOUS_DISCOVERY_OWNER_PREFIX = "envoy:discovery:anon:";

export type DiscoveryForwardPrivacy = "none" | "anonymous";

function sha256Base64Url(seed: string): string {
  const hash = sha256(new TextEncoder().encode(seed));
  let binary = "";
  for (const byte of hash) {
    binary += String.fromCharCode(byte);
  }
  const b64 =
    typeof globalThis.btoa === "function"
      ? globalThis.btoa(binary)
      : Buffer.from(hash).toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function anonymizeDiscoveryRequesterOwnerId(
  originalOwnerId: string,
  correlationId: string | undefined,
): string {
  const seed = `${originalOwnerId.trim()}|${(correlationId ?? "no-correlation").trim()}`;
  const digest = sha256Base64Url(seed).slice(0, 22);
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
