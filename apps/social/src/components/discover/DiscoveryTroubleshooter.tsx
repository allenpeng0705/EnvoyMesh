import type { NodeConfig } from "@envoymesh/api";
import { useT } from "../../context/I18nContext.js";

export function DiscoveryTroubleshooter({
  nodeStatus,
  nodeConfig,
  discoveredCount,
}: {
  nodeStatus: string;
  nodeConfig: NodeConfig | null;
  discoveredCount: number;
}) {
  const t = useT();
  if (discoveredCount > 0) return null;

  const online = nodeStatus === "running";
  const mdnsOn = nodeConfig?.enableMdns !== false;
  const profile = nodeConfig?.discoveryProfile;
  const nearbyFriendly =
    mdnsOn && profile !== "contacts-only" && profile !== "relay-only";

  return (
    <details className="discovery-troubleshooter">
      <summary>{t("discover.troubleshooter.summary")}</summary>
      <ul className="discovery-troubleshooter__list">
        <li className={online ? "discovery-troubleshooter__ok" : "discovery-troubleshooter__warn"}>
          {online ? t("discover.troubleshooter.connected") : t("discover.troubleshooter.connectFirst")}
        </li>
        <li className={nearbyFriendly ? "discovery-troubleshooter__ok" : "discovery-troubleshooter__warn"}>
          {nearbyFriendly
            ? t("discover.troubleshooter.sameWifiOk")
            : t("discover.troubleshooter.sameWifiWarn")}
        </li>
        <li>{t("discover.troubleshooter.bothOnline")}</li>
        <li>{t("discover.troubleshooter.usePasteLink")}</li>
      </ul>
    </details>
  );
}
