import type { NodeArgs } from "./args.js";
import {
  assertWanJoinInviteNotExpired,
  decodeWanJoinInviteV1,
  encodeWanJoinInviteV1,
  isBootstrapRelayMultiaddr,
  wanJoinInviteSeedAddrs,
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

  // Sponsor dial hints (circuit / LAN / bare peer id) go to the discovery
  // seed store via joinInviteSeedAddrs — not bootstrapPeers (rendezvous).
  for (const addr of wanJoinInviteSeedAddrs(invite)) {
    if (!args.joinInviteSeedAddrs.includes(addr)) {
      args.joinInviteSeedAddrs.push(addr);
    }
  }
}
