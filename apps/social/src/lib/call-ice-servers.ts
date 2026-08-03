/**
 * ICE server resolution for voice calls — mirrors home node defaults.
 *
 * Gathering is capped (~300ms) in the WebRTC transport so unreachable STUN
 * (e.g. Google from CN) cannot delay `call.invite`. Defaults avoid Google and
 * prefer servers more often reachable in restricted networks; configure your
 * own STUN/TURN in Settings → Network when needed.
 */

export type CallIceServerConfig = {
  urls: string;
  username?: string;
  credential?: string;
};

/**
 * Public STUN defaults (no Google). Gathering timeout is short — blocked
 * servers only waste a few hundred ms, then host candidates + trickle continue.
 */
export const DEFAULT_CALL_ICE_SERVERS: CallIceServerConfig[] = [
  { urls: "stun:stun.miwifi.com:3478" },
  { urls: "stun:stun.nextcloud.com:3478" },
  { urls: "stun:stun.cloudflare.com:3478" },
];

export type ResolveCallIceServersOptions = {
  /** Reserved for callers that want profile-specific overrides later. */
  discoveryProfile?: string;
};

/** Prefer invite payload, then node config, then public STUN defaults. */
export function resolveCallIceServers(
  inviteIce?: CallIceServerConfig[],
  nodeIce?: CallIceServerConfig[],
  _opts?: ResolveCallIceServersOptions,
): RTCIceServer[] {
  if (inviteIce && inviteIce.length > 0) return inviteIce as RTCIceServer[];
  if (nodeIce && nodeIce.length > 0) return nodeIce as RTCIceServer[];
  return DEFAULT_CALL_ICE_SERVERS as RTCIceServer[];
}

export function isPath2Call(inviteIce?: CallIceServerConfig[]): boolean {
  return resolveCallIceServers(inviteIce).length > 0;
}
