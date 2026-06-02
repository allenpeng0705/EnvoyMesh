/**
 * Mobile-only home node pairing — paste or scan desktop Settings QR link.
 */
import { useCallback, useState } from "react";
import { parseEnvoyPairUri } from "@envoymesh/api";
import { useNodeState } from "@envoymesh/social/context/NodeStateContext.js";
import { useNodeService } from "@envoymesh/social/hooks/useNodeService.js";
import { useT } from "@envoymesh/social/context/I18nContext.js";
import { scanEnvoyPairUri } from "../lib/scan-envoy-pair-uri.js";

export function MobilePairHomeSection() {
  const t = useT();
  const nodeService = useNodeService();
  const { bridgeStatus, refreshConnectionStatus } = useNodeState();
  const [pairUri, setPairUri] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handlePair = useCallback(async () => {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const params = parseEnvoyPairUri(pairUri);
      const wasRunning = (await nodeService.getNodeStatus()).status === "running";
      if (wasRunning) {
        await nodeService.stopNode();
      }
      const result = await nodeService.pairWithHomeNode(params);
      if (wasRunning) {
        await nodeService.startNode();
      }
      await refreshConnectionStatus();
      setSuccess(`Paired as ${result.ownerId}. Home agent bridge is ready when your computer is online.`);
      setPairUri("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [nodeService, pairUri, refreshConnectionStatus]);

  const handleScan = useCallback(async () => {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const uri = await scanEnvoyPairUri();
      setPairUri(uri);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, []);

  if (bridgeStatus?.enabled) {
    return (
      <div className="mv-section-group">
        <div className="mv-section-group-title">{t("mobile.settings.homeNode")}</div>
        <div className="mv-section-row">
          <span className="mv-section-label">{t("mobile.settings.bridgeAgent")}</span>
          <span className="mv-section-value">{bridgeStatus.agentName ?? "My Agent"}</span>
        </div>
        <p className="mv-field-desc">
          Shared identity is active. Chat with {bridgeStatus.agentName ?? "your home agent"} from Contacts when your
          home computer is online.
        </p>
      </div>
    );
  }

  return (
    <div className="mv-section-group">
      <div className="mv-section-group-title">{t("mobile.settings.pairWithHome")}</div>
      <p className="mv-field-desc">
        {t("mobile.settings.pairHint")}
      </p>
      <label className="mv-field-label" htmlFor="pair-uri">
        {t("mobile.settings.pairUri")}
      </label>
      <textarea
        id="pair-uri"
        className="mv-textarea"
        rows={4}
        value={pairUri}
        onChange={(e) => setPairUri(e.target.value)}
        placeholder="envoy://pair?wsUrl=..."
        disabled={busy}
      />
      <div className="mv-pair-actions">
        <button type="button" className="mv-btn-primary" onClick={() => void handlePair()} disabled={busy || !pairUri.trim()}>
          {busy ? "Pairing…" : t("mobile.settings.pair")}
        </button>
        <button type="button" className="mv-btn-secondary" onClick={() => void handleScan()} disabled={busy}>
          {t("mobile.settings.scan")}
        </button>
      </div>
      {error && <p className="mv-field-error">{error}</p>}
      {success && <p className="mv-field-success">{success}</p>}
    </div>
  );
}

export { MobilePairHomeSection as default };
