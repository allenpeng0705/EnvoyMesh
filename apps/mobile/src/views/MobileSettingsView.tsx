/**
 * MobileSettingsView — Compact mobile settings accessible from the "Me" tab.
 *
 * Three-tab layout (Node / AI / App) via segmented control.
 * Simplified versions of the desktop settings tabs.
 */
import { useState, useCallback } from "react";
import { useNodeState } from "@envoymesh/social/context/NodeStateContext.js";
import { useNodeService } from "@envoymesh/social/hooks/useNodeService.js";
import { BridgeIcon } from "@envoymesh/social/icons.js";

type SettingsTab = "node" | "ai" | "app";

interface MobileSettingsViewProps {
  onBack?: () => void;
}

export function MobileSettingsView({ onBack }: MobileSettingsViewProps) {
  const nodeService = useNodeService();
  const { nodeConfig, nodeStatus, peerId, connectionStatus, bridgeStatus, refreshNodeConfig } =
    useNodeState();

  const [activeTab, setActiveTab] = useState<SettingsTab>("node");
  const [saving, setSaving] = useState(false);

  const handleSaveConfig = useCallback(async () => {
    setSaving(true);
    try {
      await refreshNodeConfig();
    } finally {
      setSaving(false);
    }
  }, [refreshNodeConfig]);

  return (
    <div className="mv-settings">
      {/* Segmented tabs */}
      <div className="mv-settings-tabs">
        <button
          className={`mv-settings-tab${activeTab === "node" ? " active" : ""}`}
          onClick={() => setActiveTab("node")}
        >
          Node
        </button>
        <button
          className={`mv-settings-tab${activeTab === "ai" ? " active" : ""}`}
          onClick={() => setActiveTab("ai")}
        >
          AI
        </button>
        <button
          className={`mv-settings-tab${activeTab === "app" ? " active" : ""}`}
          onClick={() => setActiveTab("app")}
        >
          App
        </button>
      </div>

      <div className="mv-settings-content">
        {/* Node tab */}
        {activeTab === "node" && (
          <>
            <div className="mv-section-group">
              <div className="mv-section-group-title">Status</div>
              <div className="mv-section-row">
                <span className="mv-section-label">Node Status</span>
                <span className="mv-section-value">{nodeStatus}</span>
              </div>
              <div className="mv-section-row">
                <span className="mv-section-label">Connection</span>
                <span className="mv-section-value">
                  {connectionStatus?.online ? "Online" : "Offline"}
                </span>
              </div>
            </div>

            <div className="mv-section-group">
              <div className="mv-section-group-title">Identity</div>
              <div className="mv-section-row">
                <span className="mv-section-label">Peer ID</span>
                <span className="mv-section-value" style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-2xs)" }}>
                  {peerId ? peerId.slice(0, 16) + "..." : "Loading..."}
                </span>
              </div>
            </div>

            <div className="mv-section-group">
              <div className="mv-section-group-title">Network</div>
              <div className="mv-section-row">
                <span className="mv-section-label">Relay Enabled</span>
                <span className="mv-section-value">
                  {nodeConfig?.relayEnabled !== false ? "On" : "Off"}
                </span>
              </div>
              <div className="mv-section-row">
                <span className="mv-section-label">Bootstrap Presets</span>
                <span className="mv-section-value">
                  {(nodeConfig?.bootstrapPresets ?? []).length > 0 ? "Public" : "Private"}
                </span>
              </div>
            </div>
          </>
        )}

        {/* AI tab */}
        {activeTab === "ai" && (
          <>
            <div className="mv-section-group">
              <div className="mv-section-group-title">Bridge</div>
              <div className="mv-section-row">
                <span className="mv-section-label">
                  <BridgeIcon size={16} /> Agent Bridge
                </span>
                <span className="mv-section-value">
                  {bridgeStatus?.enabled ? "Enabled" : "Disabled"}
                </span>
              </div>
              {bridgeStatus?.enabled && (
                <div className="mv-section-row">
                  <span className="mv-section-label">Agent Name</span>
                  <span className="mv-section-value">
                    {bridgeStatus.agentName ?? "My Agent"}
                  </span>
                </div>
              )}
            </div>

            <div className="mv-section-group">
              <div className="mv-section-group-title">AI Features</div>
              <div className="mv-section-row">
                <span className="mv-section-label">Chat Assist</span>
                <span className="mv-section-value">
                  {nodeConfig?.chatAssistEnabled ? "On" : "Off"}
                </span>
              </div>
            </div>
          </>
        )}

        {/* App tab */}
        {activeTab === "app" && (
          <>
            <div className="mv-section-group">
              <div className="mv-section-group-title">About</div>
              <div className="mv-section-row">
                <span className="mv-section-label">Version</span>
                <span className="mv-section-value">Phase 11</span>
              </div>
              <div className="mv-section-row">
                <span className="mv-section-label">Platform</span>
                <span className="mv-section-value">Capacitor Mobile</span>
              </div>
            </div>

            <div style={{ padding: "var(--space-4)" }}>
              <button
                className="mv-btn-primary"
                onClick={handleSaveConfig}
                disabled={saving}
              >
                {saving ? "Refreshing..." : "Refresh Node Config"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export { MobileSettingsView as default };
