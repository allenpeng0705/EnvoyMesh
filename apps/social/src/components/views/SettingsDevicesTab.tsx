import { useState, useCallback, useEffect } from "react";
import { useNodeState } from "../../context/NodeStateContext.js";
import { useT } from "../../context/I18nContext.js";
import { useNodeService, useIsInProcessMobileNode } from "../../hooks/useNodeService.js";
import type { AuthorizedDeviceSummary } from "@envoymesh/api";

export function SettingsDevicesTab() {
  const t = useT();
  const nodeService = useNodeService();
  const isMobileNode = useIsInProcessMobileNode();
  const { refreshNodeConfig } = useNodeState();
  
  const [authorizedDevices, setAuthorizedDevices] = useState<AuthorizedDeviceSummary[]>([]);
  const [authorizedDevicesLoading, setAuthorizedDevicesLoading] = useState(false);
  const [authorizedDevicesError, setAuthorizedDevicesError] = useState<string | null>(null);
  const [revokingDeviceId, setRevokingDeviceId] = useState<string | null>(null);

  const refreshAuthorizedDevices = useCallback(async () => {
    if (isMobileNode) return;
    setAuthorizedDevicesLoading(true);
    setAuthorizedDevicesError(null);
    try {
      const result = await nodeService.listAuthorizedDevices();
      setAuthorizedDevices(result.devices);
    } catch (e) {
      setAuthorizedDevicesError(e instanceof Error ? e.message : String(e));
    } finally {
      setAuthorizedDevicesLoading(false);
    }
  }, [isMobileNode, nodeService]);

  useEffect(() => {
    if (isMobileNode) return;
    void refreshAuthorizedDevices();
  }, [isMobileNode, refreshAuthorizedDevices]);

  const handleRevokeDevice = useCallback(async (deviceId: string) => {
    if (isMobileNode) return;
    const label = authorizedDevices.find((d) => d.deviceId === deviceId)?.displayName ?? deviceId;
    if (!window.confirm(t("settings.devices.revokeConfirm", { label }))) {
      return;
    }
    setRevokingDeviceId(deviceId);
    try {
      await nodeService.revokeAuthorizedDevice({ deviceId, reason: "retired" });
      await refreshAuthorizedDevices();
      await refreshNodeConfig();
    } catch (e) {
      setAuthorizedDevicesError(e instanceof Error ? e.message : String(e));
    } finally {
      setRevokingDeviceId(null);
    }
  }, [authorizedDevices, isMobileNode, nodeService, refreshAuthorizedDevices, refreshNodeConfig, t]);

  if (isMobileNode) {
    return (
      <section className="settings-section">
        <h3>{t("settings.devices.title")}</h3>
        <p className="section-desc">
          {t("settings.devices.mobileNotAvailable")}
        </p>
      </section>
    );
  }

  return (
    <>
      <section className="settings-section">
        <h3>{t("settings.devices.title")}</h3>
        <p className="section-desc">
          {t("settings.devices.desc")}
        </p>

        {authorizedDevicesLoading ? (
          <p className="settings-hint">{t("settings.devices.loading")}</p>
        ) : authorizedDevicesError ? (
          <p className="settings-diagnostics-error">{authorizedDevicesError}</p>
        ) : authorizedDevices.length === 0 ? (
          <p className="settings-hint">{t("settings.devices.noDevices")}</p>
        ) : (
          <ul className="settings-list">
            {authorizedDevices.map((device) => (
              <li
                key={device.deviceId}
                className="settings-list-item"
                style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between" }}
              >
                <div>
                  <div>{device.displayName ?? device.deviceProfile}</div>
                  <div className="settings-hint" style={{ fontSize: "0.75rem" }}>
                    {device.deviceProfile}
                    {device.revoked ? ` ${t("settings.devices.revoked")}` : ""}
                    <br />
                    <code style={{ fontSize: "0.65rem" }}>{device.deviceId}</code>
                  </div>
                </div>
                {!device.revoked && (
                  <button
                    type="button"
                    className="settings-button"
                    disabled={revokingDeviceId === device.deviceId}
                    onClick={() => { void handleRevokeDevice(device.deviceId); }}
                  >
                    {revokingDeviceId === device.deviceId ? t("settings.devices.revoking") : t("settings.devices.revoke")}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        <button
          type="button"
          className="settings-button"
          style={{ marginTop: 8 }}
          disabled={authorizedDevicesLoading}
          onClick={() => { void refreshAuthorizedDevices(); }}
        >
          {t("settings.devices.refresh")}
        </button>
      </section>
    </>
  );
}
