/**
 * MobileSettingsView — Compact mobile settings accessible from the "Me" tab.
 *
 * Three-tab layout (Node / AI / App) via segmented control.
 * Simplified versions of the desktop settings tabs.
 */
import { useState, useCallback, useEffect } from "react";
import { useNodeState } from "@envoymesh/social/context/NodeStateContext.js";
import { useNodeService } from "@envoymesh/social/hooks/useNodeService.js";
import { useT } from "@envoymesh/social/context/I18nContext.js";
import { MobilePairHomeSection } from "./MobilePairHomeSection.js";
import { BridgeIcon } from "@envoymesh/social/icons.js";

type SettingsTab = "node" | "ai" | "app";

interface MobileSettingsViewProps {
  onBack?: () => void;
  onOpenLiveScan?: () => void;
  pairScanReturn?: { uri: string } | { error: string } | null;
  onPairScanReturnConsumed?: () => void;
}

export function MobileSettingsView({
  onBack,
  onOpenLiveScan,
  pairScanReturn,
  onPairScanReturnConsumed,
}: MobileSettingsViewProps) {
  const t = useT();
  const nodeService = useNodeService();
  const { nodeConfig, nodeStatus, peerId, connectionStatus, bridgeStatus, refreshNodeConfig, refreshConnectionStatus } =
    useNodeState();

  const [activeTab, setActiveTab] = useState<SettingsTab>("node");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (activeTab !== "node") return;
    void refreshConnectionStatus();
    const id = setInterval(() => {
      void refreshConnectionStatus();
    }, 8000);
    return () => clearInterval(id);
  }, [activeTab, refreshConnectionStatus]);

  const handleSaveConfig = useCallback(async () => {
    setSaving(true);
    try {
      await Promise.all([refreshNodeConfig(), refreshConnectionStatus()]);
    } finally {
      setSaving(false);
    }
  }, [refreshNodeConfig, refreshConnectionStatus]);

  return (
    <div className="mv-settings">
      {/* Segmented tabs */}
      <div className="mv-settings-tabs">
        <button
          className={`mv-settings-tab${activeTab === "node" ? " active" : ""}`}
          onClick={() => setActiveTab("node")}
        >
          {t("mobile.settings.tabs.node")}
        </button>
        <button
          className={`mv-settings-tab${activeTab === "ai" ? " active" : ""}`}
          onClick={() => setActiveTab("ai")}
        >
          {t("mobile.settings.tabs.ai")}
        </button>
        <button
          className={`mv-settings-tab${activeTab === "app" ? " active" : ""}`}
          onClick={() => setActiveTab("app")}
        >
          {t("mobile.settings.tabs.app")}
        </button>
      </div>

      <div className="mv-settings-content">
        {/* Node tab */}
        {activeTab === "node" && (
          <>
            <div className="mv-section-group">
              <div className="mv-section-group-title">{t("mobile.settings.status")}</div>
              <div className="mv-section-row">
                <span className="mv-section-label">{t("mobile.settings.nodeStatus")}</span>
                <span className="mv-section-value">{nodeStatus}</span>
              </div>
              <div className="mv-section-row">
                <span className="mv-section-label">{t("mobile.settings.connection")}</span>
                <span className="mv-section-value">
                  {connectionStatus?.online ? t("mobile.settings.online") : t("mobile.settings.offline")}
                </span>
              </div>
              {connectionStatus?.homeRemote?.paired && (
                <div className="mv-section-row">
                  <span className="mv-section-label">{t("mobile.settings.transport")}</span>
                  <span className="mv-section-value">
                    {connectionStatus.homeRemote.transport === "lan"
                      ? t("mobile.settings.transportLan")
                      : connectionStatus.homeRemote.transport === "libp2p"
                      ? t("mobile.settings.transportLibp2p")
                      : connectionStatus.homeRemote.transport === "tunnel"
                      ? t("mobile.settings.transportTunnel")
                      : t("mobile.settings.transportNone")}
                  </span>
                </div>
              )}
              {connectionStatus?.lastError && (
                <>
                  <div className="mv-section-row mv-diag-error-meta">
                    <span className="mv-section-label">{t("mobile.settings.lastError")}</span>
                    <span className="mv-section-value">
                      {connectionStatus.lastErrorAt ?? "—"}
                    </span>
                  </div>
                  <div className="mv-section-row mv-diag-error-text">
                    <span className="mv-section-value">{connectionStatus.lastError}</span>
                  </div>
                </>
              )}
            </div>

            <div className="mv-section-group">
              <div className="mv-section-group-title">{t("mobile.settings.identity")}</div>
              <div className="mv-section-row">
                <span className="mv-section-label">{t("mobile.settings.peerId")}</span>
                <span className="mv-section-value" style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-2xs)" }}>
                  {peerId ? peerId.slice(0, 16) + "..." : "Loading..."}
                </span>
              </div>
            </div>

            <MobilePairHomeSection
              onOpenLiveScan={onOpenLiveScan}
              pairScanReturn={pairScanReturn}
              onPairScanReturnConsumed={onPairScanReturnConsumed}
            />

            <div className="mv-section-group">
              <div className="mv-section-group-title">{t("mobile.settings.network")}</div>
              <div className="mv-section-row">
                <span className="mv-section-value">
                  {nodeConfig?.relayEnabled !== false ? t("mobile.settings.on") : t("mobile.settings.off")}
                </span>
              </div>
              <div className="mv-section-row">
                <span className="mv-section-label">{t("mobile.settings.bootstrapPresets")}</span>
                <span className="mv-section-value">
                  {(nodeConfig?.bootstrapPresets ?? []).length > 0 ? t("mobile.settings.public") : t("mobile.settings.private")}
                </span>
              </div>
            </div>
          </>
        )}

        {/* AI tab */}
        {activeTab === "ai" && (
          <>
            <div className="mv-section-group">
              <div className="mv-section-group-title">{t("mobile.settings.bridge")}</div>
              <div className="mv-section-row">
                <span className="mv-section-label">
                  <BridgeIcon size={16} /> {t("mobile.settings.agentBridge")}
                </span>
                <span className="mv-section-value">
                  {bridgeStatus?.enabled ? t("mobile.settings.enabled") : t("mobile.settings.disabled")}
                </span>
              </div>
              {bridgeStatus?.enabled && (
                <div className="mv-section-row">
                  <span className="mv-section-label">{t("mobile.settings.agentName")}</span>
                  <span className="mv-section-value">
                    {bridgeStatus.agentName ?? "My Agent"}
                  </span>
                </div>
              )}
            </div>

            <div className="mv-section-group">
              <div className="mv-section-group-title">{t("mobile.settings.aiFeatures")}</div>
              <div className="mv-section-row">
                <span className="mv-section-label">{t("mobile.settings.chatAssist")}</span>
                <span className="mv-section-value">
                  {nodeConfig?.chatAssistEnabled ? t("mobile.settings.on") : t("mobile.settings.off")}
                </span>
              </div>
            </div>
          </>
        )}

        {/* App tab */}
        {activeTab === "app" && (
          <>
            <div className="mv-section-group">
              <div className="mv-section-group-title">{t("mobile.settings.about")}</div>
              <div className="mv-section-row">
                <span className="mv-section-label">{t("mobile.settings.version")}</span>
                <span className="mv-section-value">Phase 11</span>
              </div>
              <div className="mv-section-row">
                <span className="mv-section-label">{t("mobile.settings.platform")}</span>
                <span className="mv-section-value">Capacitor Mobile</span>
              </div>
            </div>

            <div style={{ padding: "var(--space-4)" }}>
              <button
                className="mv-btn-primary"
                onClick={handleSaveConfig}
                disabled={saving}
              >
                {saving ? t("mobile.settings.refreshing") : t("mobile.settings.refreshConfig")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export { MobileSettingsView as default };
