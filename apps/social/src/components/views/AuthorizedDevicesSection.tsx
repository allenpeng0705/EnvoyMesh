import { useCallback, useEffect, useMemo, useState } from "react";
import { useT } from "../../context/I18nContext.js";
import { useNodeState } from "../../context/NodeStateContext.js";
import { useIsInProcessMobileNode, useNodeService } from "../../hooks/useNodeService.js";
import type { AuthorizedDeviceSummary } from "@envoymesh/api";

/**
 * AuthorizedDevicesSection — paired-device list with revoke.
 *
 * Rendered inside the App settings tab (alongside Language, Appearance,
 * and Activity) so housekeeping/audit-style information lives in one
 * place. On mobile (in-process mobile node) the section is replaced by
 * a hint that device management happens on the home node.
 */
export function AuthorizedDevicesSection() {
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

  const handleRevokeDevice = useCallback(
    async (deviceId: string) => {
      if (isMobileNode) return;
      const label =
        authorizedDevices.find((d) => d.deviceId === deviceId)?.displayName ?? deviceId;
      if (!window.confirm(t("settings.account.devices.revokeConfirm", { label }))) {
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
    },
    [authorizedDevices, isMobileNode, nodeService, refreshAuthorizedDevices, refreshNodeConfig, t],
  );

  // -- Clean up historical duplicates ------------------------------------
  // The mobile app used to mint a fresh device keypair on every pair, so
  // a home node that was re-paired many times accumulates many distinct
  // authorized-device records. The new mobile flow reuses a stable key,
  // so future re-pairs dedup naturally — but the historical duplicates
  // are still on disk. This action groups the existing records by
  // display name and merges the older duplicates into the most-recently
  // paired record in each group. The most-recent is the safest "keep"
  // choice because it is the active one (the device is still using the
  // mesh via that record).
  const [cleaningUp, setCleaningUp] = useState(false);
  const [cleanupMessage, setCleanupMessage] = useState<string | null>(null);

  const buildDuplicateGroups = useCallback(() => {
    // Group by trimmed display name; only entries that actually have a
    // display name participate (un-named entries cannot be confidently
    // deduped). Already-revoked records are also skipped — the store
    // removes them on merge, so doing it here would be redundant.
    const buckets = new Map<string, AuthorizedDeviceSummary[]>();
    for (const device of authorizedDevices) {
      if (device.revoked) continue;
      const name = (device.displayName ?? "").trim();
      if (!name) continue;
      const list = buckets.get(name) ?? [];
      list.push(device);
      buckets.set(name, list);
    }
    const groups: { keepId: string; mergeIds: string[] }[] = [];
    for (const list of buckets.values()) {
      if (list.length < 2) continue;
      // Pick the canonical "keep" record: the one with the latest
      // pairedAt — that's the most recently paired device, which is
      // the one currently in use.
      const sorted = [...list].sort((a, b) =>
        a.pairedAt < b.pairedAt ? 1 : a.pairedAt > b.pairedAt ? -1 : 0,
      );
      const [keep, ...rest] = sorted;
      if (!keep) continue;
      groups.push({ keepId: keep.deviceId, mergeIds: rest.map((d) => d.deviceId) });
    }
    return groups;
  }, [authorizedDevices]);

  const revokedCount = useMemo(
    () => authorizedDevices.filter((d) => d.revoked).length,
    [authorizedDevices],
  );

  const handleCleanupDuplicates = useCallback(async () => {
    if (isMobileNode) return;
    const groups = buildDuplicateGroups();
    const duplicateCount = groups.reduce((n, g) => n + g.mergeIds.length, 0);
    if (duplicateCount === 0 && revokedCount === 0) {
      setCleanupMessage(t("settings.account.devices.cleanupUnavailable", "Nothing to clean up."));
      return;
    }
    const confirmed = window.confirm(
      t("settings.account.devices.cleanupConfirm", {
        duplicateCount,
        revokedCount,
      }),
    );
    if (!confirmed) return;

    setCleaningUp(true);
    setCleanupMessage(null);
    try {
      for (const { keepId, mergeIds } of groups) {
        if (mergeIds.length === 0) continue;
        await nodeService.mergeAuthorizedDevices({
          keepDeviceId: keepId,
          mergeDeviceIds: mergeIds,
          reason: "deduplicated",
        });
      }
      const pruned = await nodeService.pruneRevokedDevices();
      await refreshAuthorizedDevices();
      await refreshNodeConfig();
      setCleanupMessage(
        t("settings.account.devices.cleanupSuccess", {
          duplicateCount,
          revokedCount: pruned.prunedDeviceIds.length,
        }),
      );
    } catch (e) {
      setCleanupMessage(
        t("settings.account.devices.cleanupFailed", {
          message: e instanceof Error ? e.message : String(e),
        }),
      );
    } finally {
      setCleaningUp(false);
    }
  }, [
    buildDuplicateGroups,
    isMobileNode,
    nodeService,
    refreshAuthorizedDevices,
    refreshNodeConfig,
    revokedCount,
    t,
  ]);

  const duplicateGroups = buildDuplicateGroups();
  const duplicateCount = duplicateGroups.reduce((n, g) => n + g.mergeIds.length, 0);
  const hasWork = duplicateCount > 0 || revokedCount > 0;

  return (
    <div className="settings-card">
      <h4>{t("settings.account.devices.title", "Authorized Devices")}</h4>
      <p className="settings-hint">
        {t(
          "settings.account.devices.desc",
          "Manage devices authorized to access your EnvoyMesh account.",
        )}
      </p>

      {isMobileNode ? (
        <p className="settings-hint">
          {t(
            "settings.account.devices.mobileNotAvailable",
            "Device management is not available on mobile devices.",
          )}
        </p>
      ) : authorizedDevicesLoading ? (
        <p className="settings-hint">
          {t("settings.account.devices.loading", "Loading devices…")}
        </p>
      ) : authorizedDevicesError ? (
        <p className="settings-diagnostics-error">{authorizedDevicesError}</p>
      ) : authorizedDevices.length === 0 ? (
        <p className="settings-hint">
          {t("settings.account.devices.noDevices", "No authorized devices yet.")}
        </p>
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
                  {device.revoked
                    ? ` ${t("settings.account.devices.revoked", "revoked")}`
                    : ""}
                  {device.lastSeenAt && !device.revoked ? (
                    <>
                      {" · "}
                      {t("settings.account.devices.lastSeen", "last seen {when}", {
                        when: new Date(device.lastSeenAt).toLocaleString(),
                      })}
                    </>
                  ) : null}
                  <br />
                  <code style={{ fontSize: "0.65rem" }}>{device.deviceId}</code>
                </div>
              </div>
              {!device.revoked && (
                <button
                  type="button"
                  className="settings-button"
                  disabled={revokingDeviceId === device.deviceId}
                  onClick={() => {
                    void handleRevokeDevice(device.deviceId);
                  }}
                >
                  {revokingDeviceId === device.deviceId
                    ? t("settings.account.devices.revoking", "Revoking…")
                    : t("settings.account.devices.revoke", "Revoke")}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {cleanupMessage ? (
        <p className="settings-hint" style={{ marginTop: 8 }}>
          {cleanupMessage}
        </p>
      ) : null}

      {!isMobileNode && (
        <div className="settings-buttons" style={{ marginTop: 8, gap: 8, display: "flex" }}>
          <button
            type="button"
            className="settings-button"
            disabled={authorizedDevicesLoading}
            onClick={() => {
              void refreshAuthorizedDevices();
            }}
          >
            {t("settings.account.devices.refresh", "Refresh")}
          </button>
          <button
            type="button"
            className="settings-button"
            disabled={!hasWork || cleaningUp || authorizedDevicesLoading}
            onClick={() => {
              void handleCleanupDuplicates();
            }}
            title={
              hasWork
                ? t("settings.account.devices.cleanup", "Clean up")
                : t("settings.account.devices.cleanupUnavailable", "Nothing to clean up.")
            }
          >
            {cleaningUp
              ? t("settings.account.devices.cleaning", "Cleaning up…")
              : t("settings.account.devices.cleanup", "Clean up")}
          </button>
        </div>
      )}
    </div>
  );
}
