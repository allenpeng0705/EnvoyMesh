/**
 * Mobile-only home node pairing — paste or scan desktop Settings QR link.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { parseEnvoyPairUri } from "@envoymesh/api";
import { useNodeState } from "@envoymesh/social/context/NodeStateContext.js";
import { useIsInProcessMobileNode, useNodeService } from "@envoymesh/social/hooks/useNodeService.js";
import { useT } from "@envoymesh/social/context/I18nContext.js";
import { scanEnvoyPairUriNative } from "../lib/scan-envoy-pair-native.js";
import { decodeEnvoyPairUriFromFile } from "../lib/decode-envoy-pair-qr.js";

export interface MobilePairHomeSectionProps {
  onOpenLiveScan?: () => void;
  pairScanReturn?: { uri: string } | { error: string } | null;
  onPairScanReturnConsumed?: () => void;
}

export function MobilePairHomeSection({
  onOpenLiveScan,
  pairScanReturn,
  onPairScanReturnConsumed,
}: MobilePairHomeSectionProps = {}) {
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
      // pairWithHomeNode operates on the in-process MobileNode and can be called
      // while it is running. The previous stop/start around it was unnecessary
      // and caused a brief "Not connected" flicker (MobileApp renders the
      // offline splash while nodeStatus is "offline"), making it look like
      // pairing had failed.
      const result = await nodeService.pairWithHomeNode(params);
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
    if (onOpenLiveScan) {
      // New full-screen scan page is wired in by the parent (MobileApp).
      onOpenLiveScan();
      return;
    }
    // Fallback for callers that didn't pass onOpenLiveScan (e.g. tests):
    // run the in-place scan directly.
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
  }, [applyScannedUri, onOpenLiveScan]);

  // Apply the URI returned from the dedicated scan page.
  useEffect(() => {
    if (!pairScanReturn) return;
    if ("uri" in pairScanReturn) {
      setPairUri(pairScanReturn.uri);
      setError(null);
      setSuccess(t("mobile.settings.scanCaptured"));
    } else {
      // Don't show a red error for a user-initiated cancel — silently dismiss.
      if (pairScanReturn.error.toLowerCase().includes("cancel")) {
        setError(null);
        setSuccess(null);
      } else {
        setError(pairScanReturn.error);
        setSuccess(null);
      }
    }
    onPairScanReturnConsumed?.();
  }, [pairScanReturn, onPairScanReturnConsumed, t]);

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
