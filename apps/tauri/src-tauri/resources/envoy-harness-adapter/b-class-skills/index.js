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
export { listPeersBridge, listPeersTool, } from "./peer-list.js";
export { relayStatusBridge, buildRelayStatusTool, } from "./relay-status.js";
export { runSponsorFriendBridge, sponsorFriendTool, __resetActiveSponsorLoopsForTests, } from "./sponsor-friend.js";
//# sourceMappingURL=index.js.map