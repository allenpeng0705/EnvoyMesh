/**
 * ICE server resolution for voice calls — mirrors home node defaults.
 *
 * Path 1 (empty ICE) only works with libp2p-webrtc, which is not wired yet.
 * Cross-NAT calls (e.g. Mac ↔ Windows) need STUN/TURN from the first offer.
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

/** Prefer invite payload, then node config, then public STUN defaults. */
export function resolveCallIceServers(
  inviteIce?: CallIceServerConfig[],
  nodeIce?: CallIceServerConfig[],
): RTCIceServer[] {
  if (inviteIce && inviteIce.length > 0) return inviteIce as RTCIceServer[];
  if (nodeIce && nodeIce.length > 0) return nodeIce as RTCIceServer[];
  return DEFAULT_CALL_ICE_SERVERS as RTCIceServer[];
}

export function isPath2Call(inviteIce?: CallIceServerConfig[]): boolean {
  return resolveCallIceServers(inviteIce).length > 0;
}
