import type { NodeConfig } from "@envoymesh/api";
import { useT } from "../../context/I18nContext.js";
import { resolveNetworkPreset } from "../../lib/network-presets.js";

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

  const preset = resolveNetworkPreset(nodeConfig?.discoveryProfile, nodeConfig?.bootstrapPresets);
  const online = nodeStatus === "running";
  const sameWifiPreset = preset === "same-wifi";

  return (
    <details className="discovery-troubleshooter">
      <summary>{t("discover.troubleshooter.summary")}</summary>
      <ul className="discovery-troubleshooter__list">
        <li className={online ? "discovery-troubleshooter__ok" : "discovery-troubleshooter__warn"}>
          {online ? t("discover.troubleshooter.connected") : t("discover.troubleshooter.connectFirst")}
        </li>
        <li className={sameWifiPreset ? "discovery-troubleshooter__ok" : "discovery-troubleshooter__warn"}>
          {sameWifiPreset ? t("discover.troubleshooter.sameWifiOk") : t("discover.troubleshooter.sameWifiWarn")}
        </li>
        <li>{t("discover.troubleshooter.bothOnline")}</li>
        <li>{t("discover.troubleshooter.usePasteLink")}</li>
      </ul>
    </details>
  );
}
