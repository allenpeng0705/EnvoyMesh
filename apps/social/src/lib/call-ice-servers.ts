/**
 * ICE server resolution for voice calls — mirrors home node defaults.
 *
 * Same-LAN (`lan-fast`) uses host candidates only — no public STUN.
 * Blocked Google/Cloudflare STUN (common in CN) must not delay call setup.
 * Cross-NAT (`wan-default`) still falls back to public STUN when unset.
 */

export type CallIceServerConfig = {
  urls: string;
  username?: string;
  credential?: string;
};

/** Same public STUN list as `DEFAULT_ICE_SERVERS` in apps/node. */
export const DEFAULT_CALL_ICE_SERVERS: CallIceServerConfig[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun.cloudflare.com:3478" },
  { urls: "stun:global.stun.twilio.com:3478" },
];

export type ResolveCallIceServersOptions = {
  /** Node discovery profile — `lan-fast` / empty → no public STUN defaults. */
  discoveryProfile?: string;
};

function isLanFastProfile(profile: string | undefined): boolean {
  const p = typeof profile === "string" ? profile.trim() : "";
  return p === "lan-fast" || p === "";
}

/** Prefer invite payload, then node config, then profile-aware defaults. */
export function resolveCallIceServers(
  inviteIce?: CallIceServerConfig[],
  nodeIce?: CallIceServerConfig[],
  opts?: ResolveCallIceServersOptions,
): RTCIceServer[] {
  if (inviteIce && inviteIce.length > 0) return inviteIce as RTCIceServer[];
  if (nodeIce && nodeIce.length > 0) return nodeIce as RTCIceServer[];
  if (isLanFastProfile(opts?.discoveryProfile)) return [];
  return DEFAULT_CALL_ICE_SERVERS as RTCIceServer[];
}

export function isPath2Call(inviteIce?: CallIceServerConfig[]): boolean {
  return resolveCallIceServers(inviteIce, undefined, { discoveryProfile: "wan-default" }).length > 0;
}
