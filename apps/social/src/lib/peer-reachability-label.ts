import type { PeerConnectionInfo } from "@envoymesh/api";

/** English fallback labels (prefer {@link formatPeerReachabilityLabel} with i18n in UI). */
export function peerReachabilityLabel(
  info: PeerConnectionInfo | null,
  connecting = false,
): string {
  if (connecting || info === null) return "Connecting…";
  if (!info.connected) return "Offline";
  if (info.direct) return "Online · Direct";
  return "Online · Relay";
}

export function formatPeerReachabilityLabel(
  info: PeerConnectionInfo | null,
  connecting: boolean,
  t: (key: string, fallback?: string) => string,
): string {
  if (connecting || info === null) {
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
