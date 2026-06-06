/**
 * Mobile-only home node pairing — paste or scan desktop Settings QR link.
 */
import { useCallback, useRef, useState } from "react";
import { parseEnvoyPairUri } from "@envoymesh/api";
import { useNodeState } from "@envoymesh/social/context/NodeStateContext.js";
import { useIsInProcessMobileNode, useNodeService } from "@envoymesh/social/hooks/useNodeService.js";
import { useT } from "@envoymesh/social/context/I18nContext.js";
import { scanEnvoyPairUriNative } from "../lib/scan-envoy-pair-native.js";
import { decodeEnvoyPairUriFromFile } from "../lib/decode-envoy-pair-qr.js";

export function MobilePairHomeSection() {
  const t = useT();
  const nodeService = useNodeService();
  const isMobileNode = useIsInProcessMobileNode();
  const { bridgeStatus, refreshConnectionStatus } = useNodeState();
  const fileInputRef = useRef<HTMLInputElement>(null);
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
      setSuccess(t("mobile.settings.pairSuccess", { ownerId: result.ownerId }));
      setPairUri("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [nodeService, pairUri, refreshConnectionStatus, t]);

  const applyScannedUri = useCallback(
    (uri: string) => {
      setPairUri(uri);
      setError(null);
      setSuccess(t("mobile.settings.scanCaptured"));
    },
    [t],
  );

  const handleScanPhoto = useCallback(
    async (file: File) => {
      setBusy(true);
      setError(null);
      setSuccess(null);
      try {
        const uri = await decodeEnvoyPairUriFromFile(file);
        applyScannedUri(uri);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    },
    [applyScannedUri],
  );

  const handleScanClick = useCallback(() => {
    setError(null);
    setSuccess(null);
    if (isMobileNode) {
      fileInputRef.current?.click();
      return;
    }
    void (async () => {
      setBusy(true);
      try {
        const uri = await scanEnvoyPairUriNative({ forceWeb: true });
        applyScannedUri(uri);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    })();
  }, [applyScannedUri, isMobileNode]);

  const handleLiveScan = useCallback(() => {
    setError(null);
    setSuccess(null);
    void (async () => {
      setBusy(true);
      try {
        const uri = await scanEnvoyPairUriNative();
        applyScannedUri(uri);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    })();
  }, [applyScannedUri]);

  if (bridgeStatus?.enabled) {
    return (
      <div className="mv-section-group">
        <div className="mv-section-group-title">{t("mobile.settings.homeNode")}</div>
        <div className="mv-section-row">
          <span className="mv-section-label">{t("mobile.settings.bridgeAgent")}</span>
          <span className="mv-section-value">{bridgeStatus.agentName ?? "My Agent"}</span>
        </div>
        <p className="mv-field-desc">
          {t("mobile.settings.bridgeActiveHint", { agent: bridgeStatus.agentName ?? t("mobile.settings.bridgeAgent") })}
        </p>
      </div>
    );
  }

  return (
    <div className="mv-section-group">
      <div className="mv-section-group-title">{t("mobile.settings.pairWithHome")}</div>
      <p className="mv-field-desc">{t("mobile.settings.pairHint")}</p>
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
          {busy ? t("mobile.settings.pairing") : t("mobile.settings.pair")}
        </button>
        <button
          type="button"
          className="mv-btn-secondary"
          onClick={isMobileNode ? handleLiveScan : handleScanClick}
          disabled={busy}
        >
          {t("mobile.settings.scanLive")}
        </button>
        <button type="button" className="mv-btn-secondary" onClick={handleScanClick} disabled={busy}>
          {t("mobile.settings.scanPhoto")}
        </button>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void handleScanPhoto(file);
        }}
      />
      {error && <p className="mv-field-error">{error}</p>}
      {success && <p className="mv-field-success">{success}</p>}
    </div>
  );
}

export { MobilePairHomeSection as default };
