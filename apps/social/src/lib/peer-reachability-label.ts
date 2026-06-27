import type { PeerConnectionInfo } from "@envoymesh/api";

export function peerReachabilityLabel(
  info: PeerConnectionInfo | null,
  checking = false,
): string {
  if (!info) return checking ? "Checking…" : "Offline";
  if (!info.connected) return "Offline";
  if (info.direct) return "Online · Direct";
  return "Online · Relay";
}
