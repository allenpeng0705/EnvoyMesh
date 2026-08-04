import type { NodeArgs } from "./args.js";
import {
  assertWanJoinInviteNotExpired,
  decodeWanJoinInviteV1,
  encodeWanJoinInviteV1,
  isBootstrapRelayMultiaddr,
  type WanJoinInviteV1,
} from "@envoymesh/api";

export type { WanJoinInviteV1 };
export { encodeWanJoinInviteV1, decodeWanJoinInviteV1 };

export function applyJoinInviteToNodeArgs(args: NodeArgs, token: string): void {
  const invite = decodeWanJoinInviteV1(token);
  assertWanJoinInviteNotExpired(invite);

  for (const peer of invite.bootstrapPeers) {
    if (isBootstrapRelayMultiaddr(peer)) {
      args.bootstrapPeers.push(peer);
    }
  }
  args.bootstrapPresets.push(...invite.bootstrapPresets);

  // Sponsor dial hints (circuit / LAN / bare peer id) are applied at runtime
  // via discovery seed stores — do not treat them as bootstrap relays.
}
