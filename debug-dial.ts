import { isLikelyInboundConnSnapshotDialHint, isUsableOutboundPeerDialHint } from "./packages/network/src/index.js";

const addr = "/ip4/192.168.3.78/tcp/55093";
const target = "12D3KooWN67PannbfXrLPhgJkkRGWGN9UBV3Xfu5UpzdK1dY8qGD";

console.log("snapshot:", isLikelyInboundConnSnapshotDialHint(addr));
console.log("usable with target:", isUsableOutboundPeerDialHint(addr, target));
console.log("usable without:", isUsableOutboundPeerDialHint(addr));

// Also test regex directly
const regex = /\/tcp\/(\d+)\//;
console.log("regex test:", regex.test(addr));
const match = addr.match(regex);
console.log("regex match:", match);
