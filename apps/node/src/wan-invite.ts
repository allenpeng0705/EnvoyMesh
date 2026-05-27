import type { NodeArgs } from "./args.js";
import {
  assertWanJoinInviteNotExpired,
  decodeWanJoinInviteV1,
  encodeWanJoinInviteV1,
  type WanJoinInviteV1,
} from "@envoymesh/api";

export type { WanJoinInviteV1 };
export { encodeWanJoinInviteV1, decodeWanJoinInviteV1 };

export function applyJoinInviteToNodeArgs(args: NodeArgs, token: string): void {
  const invite = decodeWanJoinInviteV1(token);
  assertWanJoinInviteNotExpired(invite);

  args.bootstrapPeers.push(...invite.bootstrapPeers);
  args.bootstrapPresets.push(...invite.bootstrapPresets);

  if (invite.targetPeerId) {
    args.bootstrapPeers.push(invite.targetPeerId);
  }
  if (invite.targetMultiaddrs) {
    args.bootstrapPeers.push(...invite.targetMultiaddrs);
  }
}
