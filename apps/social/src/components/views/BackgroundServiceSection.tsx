import { useCallback, useEffect, useRef, useState } from "react";
import type { NodeBackgroundServiceStatus } from "@envoymesh/api";
import { useT } from "../../context/I18nContext.js";
import { useNodeService } from "../../hooks/useNodeService.js";

function isOn(status: NodeBackgroundServiceStatus | null): boolean {
  if (!status) return false;
  return status.state === "running" || status.state === "installed-stopped" || status.enabled === true;
}

/**
 * The desktop control for the home node's login service.
 * The value lives in the operating system, so this row asks the node and
 * shows that answer. A phone session cannot change it.
 */
export function BackgroundServiceSection() {
  const t = useT();
  const nodeService = useNodeService();
  const [status, setStatus] = useState<NodeBackgroundServiceStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const handoffTimerRef = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    if (!nodeService.isConnected) return;
    try {
      const next = await nodeService.getBackgroundService();
      setStatus(next);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [nodeService]);

  useEffect(() => {
    void refresh();
  }, [refresh, nodeService.isConnected]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);

  useEffect(() => {
    return () => {
      if (handoffTimerRef.current != null) {
        window.clearTimeout(handoffTimerRef.current);
        handoffTimerRef.current = null;
      }
    };
  }, []);

  async function onToggle() {
    if (!status || busy) return;
    setBusy(true);
    setError(null);
    try {
      const next = await nodeService.setBackgroundService({ enabled: !isOn(status) });
      setStatus(next);
      // Turning on hands the node to the OS (WS drops); turning off asks the
      // app to respawn. Re-read once the link is back.
      if (handoffTimerRef.current != null) {
        window.clearTimeout(handoffTimerRef.current);
      }
      handoffTimerRef.current = window.setTimeout(() => {
        handoffTimerRef.current = null;
        void refresh();
      }, 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const on = isOn(status);
  const unsupported = status?.state === "unsupported";
  const hint = unsupported
    ? t("settings.app.serviceUnsupported")
    : on
      ? t("settings.app.serviceHintOn")
      : t("settings.app.serviceHintOff");

  return (
    <div className="settings-card">
      <h4>{t("settings.app.serviceTitle")}</h4>
      <p className="settings-hint">{hint}</p>
      {status && !unsupported ? (
        <p className="settings-hint">{on ? t("settings.app.serviceOn") : t("settings.app.serviceOff")}</p>
      ) : null}
      {status?.state === "failed" && status.detail ? (
        <p className="muted" role="alert">{t("settings.app.serviceFailed", { detail: status.detail })}</p>
      ) : null}
      {error ? <p className="muted" role="alert">{error}</p> : null}
      {status && !unsupported ? (
        <button type="button" className="secondary" disabled={busy} onClick={() => void onToggle()}>
          {busy ? t("settings.app.serviceWorking") : on ? t("settings.app.serviceTurnOff") : t("settings.app.serviceTurnOn")}
        </button>
      ) : null}
    </div>
  );
}
