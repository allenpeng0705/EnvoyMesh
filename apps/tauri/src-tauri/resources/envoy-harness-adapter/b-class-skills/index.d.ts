/**
 * Phase 8 / Step 3 — B-class skills (canonical in the bridge).
 *
 * **What this is:** the index for the 3 B-class
 * skills (sponsor-friend / peer-list / relay-status).
 * The bridge owns the canonical impls; envoy-harness
 * + OpenClaw both consume through their respective
 * adapter.
 *
 * **Re-exports:** each skill exposes a `*Bridge`
 * function (pure impl) + a `*Tool` factory (BUILTIN
 * tool shape). Hosts import the bridge impls for
 * direct calls; envoy-harness BUILTIN_TOOLS import
 * the tool factories.
 */
export { listPeersBridge, listPeersTool, type BClassAuditEventLike, type BClassPeerListDeps, type PeerListEntry, type PeerListResult, } from "./peer-list.js";
export { relayStatusBridge, buildRelayStatusTool, type BClassRelaySnapshot, type BClassRelayStatusDeps, type BClassRelayStatusResult, } from "./relay-status.js";
export { runSponsorFriendBridge, sponsorFriendTool, __resetActiveSponsorLoopsForTests, type BClassSponsorFriendDeps, type BClassSponsorFriendMeshDeps, type BClassSponsorFriendProfileDeps, type BClassSponsorFriendConfigDeps, type BClassSponsorFriendAuditDeps, type BClassPersistedNodeConfig, type BClassHelloProfile, type BClassResolvedSponsorFriend, type BClassSponsorFriendResult, } from "./sponsor-friend.js";
//# sourceMappingURL=index.d.ts.map