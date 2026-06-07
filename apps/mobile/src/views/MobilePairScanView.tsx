/**
 * MobilePairScanView — Dedicated full-screen page for live QR scanning of an
 * `envoy://pair?…` URI. Pops up over the rest of the app, takes over the
 * screen, and routes the result back to the caller.
 *
 * On iOS this delegates to our local `EnvoyQrScanner` Capacitor Pod, which
 * mounts its own native AVCapture preview view. The WebView background is
 * made transparent so the preview is fully visible. The plugin handles the
 * reticle, dim mask, and Cancel button; we only need to render a header bar
 * for the Back arrow and a "Raw text" debug strip showing exactly what was
 * captured (so a "Pairing link is missing wsUrl" error has a real cause).
 */
import { useEffect, useRef, useState } from "react";
import { useT } from "@envoymesh/social/context/I18nContext.js";
import { scanEnvoyPairUriNative } from "../lib/scan-envoy-pair-native.js";

export type PairScanResult =
  | { ok: true; uri: string }
  | { ok: false; reason: "cancelled" | "unsupported" | "permissionDenied" | "scanFailed"; error?: string };

export interface MobilePairScanViewProps {
  onResult: (result: PairScanResult) => void;
}

const SCAN_BODY_CLASS = "mobile-pair-scan-active";

export function MobilePairScanView({ onResult }: MobilePairScanViewProps) {
  const t = useT();
  const [status, setStatus] = useState<"scanning" | "scanned" | "error">("scanning");
  const [scannedRaw, setScannedRaw] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reportedRef = useRef(false);

  // While this view is mounted, force the document body to be transparent
  // so the iOS Capacitor WebView doesn't paint a solid background on top
  // of the native AVCapture preview mounted beneath it. Without this, the
  // camera is only visible in the small gaps around the WebView.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const body = document.body;
    body.classList.add(SCAN_BODY_CLASS);
    // Force a reflow so the WebView commits the transparent background
    // before the native preview is mounted.
    void body.offsetHeight;
    return () => {
      body.classList.remove(SCAN_BODY_CLASS);
    };
  }, []);

  // Kick off the scan on mount; report the result once.
  useEffect(() => {
    if (reportedRef.current) return;
    let cancelled = false;
    void (async () => {
      try {
        const uri = await scanEnvoyPairUriNative();
        if (cancelled) return;
        reportedRef.current = true;
        setScannedRaw(uri);
        setStatus("scanned");
        onResult({ ok: true, uri });
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        setStatus("error");
        reportedRef.current = true;
        const lower = message.toLowerCase();
        if (lower.includes("cancel")) {
          onResult({ ok: false, reason: "cancelled", error: message });
        } else if (lower.includes("permission") || lower.includes("not authorized")) {
          onResult({ ok: false, reason: "permissionDenied", error: message });
        } else {
          onResult({ ok: false, reason: "scanFailed", error: message });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [onResult]);

  const handleBack = () => {
    if (reportedRef.current) return;
    reportedRef.current = true;
    onResult({ ok: false, reason: "cancelled", error: "Cancelled before a code was scanned." });
  };

  return (
    <div className="mobile-pair-scan">
      <header className="mobile-pair-scan__top">
        <button
          type="button"
          className="mobile-pair-scan__back"
          onClick={handleBack}
          aria-label="Back to settings"
        >
          ←
        </button>
        <span className="mobile-pair-scan__title">{t("mobile.settings.scanLive")}</span>
      </header>

      <div className="mobile-pair-scan__hint">
        {status === "scanning" && t("mobile.settings.scanHint")}
        {status === "scanned" && t("mobile.settings.scanCaptured")}
        {status === "error" && t("mobile.settings.scanFailedHint")}
      </div>

      {scannedRaw != null && (
        <pre className="mobile-pair-scan__raw" data-testid="pair-scan-raw">
          {scannedRaw}
        </pre>
      )}
      {error != null && (
        <pre className="mobile-pair-scan__error" data-testid="pair-scan-error">
          {error}
        </pre>
      )}
    </div>
  );
}

export { MobilePairScanView as default };
