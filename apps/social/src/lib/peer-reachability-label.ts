import type { PeerConnectionInfo } from "@envoymesh/api";
import type { TFunction } from "../context/i18n-context.js";

/**
 * Localized reachability label for a bonded contact.
 *
 * The caller passes the i18n `t` so this stays a pure helper (no React
 * context inside `lib/`). The English strings below are also the inline
 * fallbacks the i18n layer uses when the active bundle has no translation
 * yet — they must stay in English.
 */
export function peerReachabilityLabel(
  t: TFunction,
  info: PeerConnectionInfo | null,
): string {
  if (!info) return t("contactChat.reachabilityChecking", "Checking…");
  if (!info.connected) return t("contactChat.reachabilityOffline", "Offline");
  if (info.direct) return t("contactChat.reachabilityOnlineDirect", "Online · Direct");
  return t("contactChat.reachabilityOnlineRelay", "Online · Relay");
}
