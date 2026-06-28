import type { PeerConnectionInfo } from "@envoymesh/api";

export function peerReachabilityLabel(info: PeerConnectionInfo | null, checking = false): string {
  if (checking || !info) return "Checking…";
  if (!info.connected) return "Offline";
  if (info.direct) return "Online · Direct";
  return "Online · Relay";
}

export function formatPeerReachabilityLabel(
  info: PeerConnectionInfo | null,
  checking: boolean,
  t: (key: string, fallback?: string) => string,
): string {
  if (checking || !info) {
    return t("contactChat.connecting", "Connecting…");
  }
  if (!info.connected) {
    return t("contactChat.reachabilityOffline", "Offline · not reachable on the mesh");
  }
  if (info.direct) {
    return t("contactChat.reachabilityDirect", "Online · direct P2P");
  }
  return t("contactChat.reachabilityRelay", "Online · via relay");
}
