/**
 * Agent Network section components — extracted from the former
 * SettingsAgentNetworkTab so they can be rendered inside the Team jobs
 * "Manage workers" modal (AgentNetworkSettingsModal).
 *
 * Each section is self-contained: it pulls its own config via useNodeService /
 * useNodeState and renders into a <section className="settings-section">.
 * The modal just composes them with accordion headers.
 *
 * i18n keys: settings.agentNetwork.* (unchanged — only the render location
 * moved from Settings → Agent Network tab to Team jobs → Manage workers).
 */
import { useCallback, useEffect, useState } from "react";
import { useNodeState } from "../../../context/NodeStateContext.js";
import { useT } from "../../../context/I18nContext.js";
import {
  useIsInProcessMobileNode,
  useNodeService,
} from "../../../hooks/useNodeService.js";
import type {
  CompanyInviteRecord,
  FleetManifest,
  FleetManifestRecord,
  PairingKioskStatus,
} from "@envoymesh/api";
import { FleetMemberSchema } from "@envoymesh/protocol";
import { AgentNetworkProfilePanel } from "./AgentNetworkProfilePanel.js";

type InviteStatus = "active" | "used" | "revoked" | "expired";

function classifyInvite(invite: CompanyInviteRecord, now: number): InviteStatus {
  if (invite.revokedAt) return "revoked";
  if (invite.usedAt) return "used";
  if (Date.parse(invite.expiresAt) <= now) return "expired";
  return "active";
}

function formatExpiresAt(invite: CompanyInviteRecord): string {
  try {
    return new Date(invite.expiresAt).toISOString().replace("T", " ").slice(0, 16);
  } catch {
    return invite.expiresAt;
  }
}

function generateRandomToken(length: number): string {
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from(
    { length },
    () => alphabet.charAt(Math.floor(Math.random() * alphabet.length)),
  ).join("");
}

/* -------------------------------------------------------------------------- */
/* Office LAN preset                                                          */
/* -------------------------------------------------------------------------- */

export function OfficeLanPresetSection() {
  const t = useT();
  const nodeService = useNodeService();
  const { nodeConfig, refreshNodeConfig } = useNodeState();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [justEnabled, setJustEnabled] = useState(false);

  const joinOn = nodeConfig?.capabilityProviderEnabled === true;
  const lanOn = nodeConfig?.lanAutoBondEnabled === true;
  const token = (nodeConfig?.lanAutoBondFleetToken ?? "").trim();
  const alreadyOn = joinOn && lanOn && token.length >= 8;

  const handleEnable = useCallback(async () => {
    setBusy(true);
    setError(null);
    setJustEnabled(false);
    try {
      const nextToken = token.length >= 8 ? token : generateRandomToken(32);
      console.info("[agent-network.ui] Office LAN enable", {
        hadToken: token.length >= 8,
        tokenLen: nextToken.length,
      });
      await nodeService.updateNodeConfig({
        capabilityProviderEnabled: true,
        lanAutoBondEnabled: true,
        lanAutoBondFleetToken: nextToken,
        lanAutoBondAutoJoinAgentNetwork: true,
        discoveryProfile: "lan-fast",
      } as Parameters<typeof nodeService.updateNodeConfig>[0]);
      await refreshNodeConfig();
      if (typeof nodeService.refreshAgentNetworkWorkers === "function") {
        await nodeService.refreshAgentNetworkWorkers().catch(() => undefined);
      }
      console.info("[agent-network.ui] Office LAN enable done");
      setJustEnabled(true);
      window.setTimeout(() => setJustEnabled(false), 4000);
    } catch (err) {
      console.warn("[agent-network.ui] Office LAN enable failed", err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [nodeService, refreshNodeConfig, token]);

  const handleCopy = useCallback(async () => {
    const value = (nodeConfig?.lanAutoBondFleetToken ?? "").trim();
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [nodeConfig?.lanAutoBondFleetToken]);

  return (
    <section className="settings-section" data-testid="agent-network-office-lan-section">
      <h4>{t("settings.agentNetwork.officeLan.heading")}</h4>
      <p className="section-desc">{t("settings.agentNetwork.officeLan.desc")}</p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button
          type="button"
          className="settings-button"
          data-testid="office-lan-enable"
          onClick={() => {
            void handleEnable();
          }}
          disabled={busy || alreadyOn}
        >
          {busy
            ? t("settings.agentNetwork.officeLan.enabling")
            : t("settings.agentNetwork.officeLan.enableButton")}
        </button>
        {token.length >= 8 ? (
          <button
            type="button"
            className="settings-button"
            data-testid="office-lan-copy-token"
            onClick={() => {
              void handleCopy();
            }}
          >
            {copied
              ? t("settings.agentNetwork.officeLan.tokenCopied")
              : t("settings.agentNetwork.officeLan.copyToken")}
          </button>
        ) : null}
        {alreadyOn ? (
          <span className="settings-hint">{t("settings.agentNetwork.officeLan.alreadyOn")}</span>
        ) : null}
        {justEnabled ? (
          <span className="settings-hint">{t("settings.agentNetwork.officeLan.enabled")}</span>
        ) : null}
      </div>
      {token.length >= 8 ? (
        <p className="field-desc" style={{ marginTop: 8 }}>
          {t("settings.agentNetwork.officeLan.shareHint")}
        </p>
      ) : null}
      {error ? <p className="library-view-error">{error}</p> : null}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Workers status                                                             */
/* -------------------------------------------------------------------------- */

export function WorkersStatusSection() {
  const t = useT();
  const nodeService = useNodeService();
  const { nodeConfig } = useNodeState();
  const [bondedCount, setBondedCount] = useState(0);
  const [workerCount, setWorkerCount] = useState(0);
  const [lanBondWithoutJoin, setLanBondWithoutJoin] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshed, setRefreshed] = useState(false);

  const joinOn = nodeConfig?.capabilityProviderEnabled === true;
  const lanOn = nodeConfig?.lanAutoBondEnabled === true;

  const loadStatus = useCallback(async () => {
    try {
      const [bonds, cards] = await Promise.all([
        nodeService.getBonds(),
        nodeService.listAgentCards(),
      ]);
      const trusted = bonds.filter((b) => b.level === "direct" || b.level === "referred");
      setBondedCount(trusted.length);
      const workers = cards.filter((c) =>
        (c.membership ?? []).includes("agent-network-worker"),
      );
      setWorkerCount(workers.length);
      const hasLanBondNote = trusted.some((b) => (b.note ?? "").includes("lan-auto"));
      setLanBondWithoutJoin(
        !joinOn && (hasLanBondNote || (lanOn && trusted.length > 0)),
      );
    } catch {
      /* ignore — status is best-effort */
    }
  }, [joinOn, lanOn, nodeService]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus, nodeConfig?.capabilityProviderEnabled, nodeConfig?.lanAutoBondEnabled]);

  useEffect(() => {
    const reload = () => {
      void loadStatus();
    };
    const unsubs = [
      nodeService.on("bond:established", reload),
      nodeService.on("bond:revoked", reload),
      nodeService.on("home:bonds-updated", reload),
      nodeService.on("home:agent-cards-updated", reload),
    ];
    return () => {
      for (const unsub of unsubs) unsub();
    };
  }, [loadStatus, nodeService]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setRefreshed(false);
    try {
      console.info("[agent-network.ui] Refresh workers clicked");
      if (typeof nodeService.refreshAgentNetworkWorkers === "function") {
        await nodeService.refreshAgentNetworkWorkers();
      } else {
        const bonds = await nodeService.getBonds();
        await Promise.allSettled(
          bonds
            .filter((b) => b.level === "direct" || b.level === "referred")
            .map((b) => nodeService.requestAgentCard(b.peerOwnerId)),
        );
      }
      await loadStatus();
      window.setTimeout(() => {
        void loadStatus();
      }, 2_800);
      setRefreshed(true);
      window.setTimeout(() => setRefreshed(false), 3000);
    } finally {
      setRefreshing(false);
    }
  }, [loadStatus, nodeService]);

  return (
    <section className="settings-section" data-testid="agent-network-workers-status">
      <h4>{t("settings.agentNetwork.workersStatus.heading")}</h4>
      <p className="section-desc" data-testid="workers-status-strip">
        {t("settings.agentNetwork.workersStatus.bonded", { count: String(bondedCount) })}
        {" · "}
        {joinOn
          ? t("settings.agentNetwork.workersStatus.joinOn")
          : t("settings.agentNetwork.workersStatus.joinOff")}
        {" · "}
        {t("settings.agentNetwork.workersStatus.workersVisible", {
          count: String(workerCount),
        })}
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button
          type="button"
          className="settings-button"
          data-testid="refresh-workers"
          onClick={() => {
            void handleRefresh();
          }}
          disabled={refreshing}
        >
          {refreshing
            ? t("settings.agentNetwork.workersStatus.refreshing")
            : t("settings.agentNetwork.workersStatus.refresh")}
        </button>
        {refreshed ? (
          <span className="settings-hint">{t("settings.agentNetwork.workersStatus.refreshed")}</span>
        ) : null}
      </div>
      {lanBondWithoutJoin ? (
        <p className="library-view-error" data-testid="join-off-after-lan-nudge" style={{ marginTop: 8 }}>
          {t("settings.agentNetwork.workersStatus.joinOffAfterLan")}
        </p>
      ) : null}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Worker membership                                                          */
/* -------------------------------------------------------------------------- */

export function WorkerMembershipSection() {
  const t = useT();
  const nodeService = useNodeService();
  const { nodeConfig, refreshNodeConfig } = useNodeState();
  const enabled = nodeConfig?.capabilityProviderEnabled === true;

  return (
    <section className="settings-section" data-testid="agent-network-membership-section">
      <h4>{t("settings.agentNetwork.membership.heading")}</h4>
      <p className="section-desc">{t("settings.agentNetwork.membership.desc")}</p>
      <div className="settings-field">
        <label className="settings-checkbox-row">
          <input
            type="checkbox"
            checked={enabled}
            onChange={async (e) => {
              console.info("[agent-network.ui] Join Agent Network toggle", {
                enabled: e.target.checked,
              });
              await nodeService.updateNodeConfig({
                capabilityProviderEnabled: e.target.checked,
              });
              await refreshNodeConfig();
            }}
          />
          <span>{t("settings.agentNetwork.membership.joinLabel")}</span>
        </label>
        <p className="field-desc">{t("settings.agentNetwork.membership.joinHint")}</p>
      </div>
      <AgentNetworkProfilePanel enabled={enabled} />
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* LAN auto-bond                                                              */
/* -------------------------------------------------------------------------- */

export function LanAutoBondSection() {
  const t = useT();
  const nodeService = useNodeService();
  const { nodeConfig, refreshNodeConfig } = useNodeState();
  const [enabled, setEnabled] = useState<boolean>(false);
  const [token, setToken] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setEnabled(nodeConfig?.lanAutoBondEnabled ?? false);
    setToken(nodeConfig?.lanAutoBondFleetToken ?? "");
  }, [nodeConfig?.lanAutoBondEnabled, nodeConfig?.lanAutoBondFleetToken]);

  const handleSave = useCallback(async () => {
    const trimmedToken = token.trim();
    if (enabled && trimmedToken.length < 8) {
      setError(t("settings.agentNetwork.lanAutoBond.validationTokenTooShort"));
      return;
    }
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      console.info("[agent-network.ui] LAN Auto-Bond save", {
        enabled,
        tokenLen: trimmedToken.length,
      });
      await nodeService.updateNodeConfig({
        lanAutoBondEnabled: enabled,
        lanAutoBondFleetToken: trimmedToken || undefined,
      } as Parameters<typeof nodeService.updateNodeConfig>[0]);
      await refreshNodeConfig();
      console.info("[agent-network.ui] LAN Auto-Bond save done");
      setSaved(true);
      window.setTimeout(() => {
        setSaved(false);
      }, 3000);
    } catch (err) {
      console.warn("[agent-network.ui] LAN Auto-Bond save failed", err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }, [enabled, nodeService, refreshNodeConfig, t, token]);

  const handleGenerate = useCallback(() => {
    setToken(generateRandomToken(32));
  }, []);

  return (
    <section className="settings-section">
      <h4>{t("settings.agentNetwork.lanAutoBond.heading")}</h4>
      <p className="section-desc">{t("settings.agentNetwork.lanAutoBond.desc")}</p>
      <label
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          marginBottom: 8,
        }}
      >
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          disabled={saving}
        />
        <span>{t("settings.agentNetwork.lanAutoBond.enableLabel")}</span>
      </label>
      <input
        type="text"
        minLength={8}
        placeholder={t("settings.agentNetwork.lanAutoBond.tokenPlaceholder")}
        value={token}
        onChange={(e) => setToken(e.target.value)}
        disabled={saving}
        style={{ width: "100%", marginBottom: 4 }}
      />
      <p className="settings-hint" style={{ marginBottom: 8 }}>
        {t("settings.agentNetwork.lanAutoBond.tokenHelp")}
      </p>
      <div
        style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}
      >
        <button
          type="button"
          className="settings-button"
          onClick={handleGenerate}
          disabled={saving}
        >
          {t("settings.agentNetwork.lanAutoBond.generate")}
        </button>
        <button
          type="button"
          className="settings-button"
          onClick={() => { void handleSave(); }}
          disabled={saving}
        >
          {saving
            ? t("settings.agentNetwork.lanAutoBond.saving")
            : t("settings.agentNetwork.lanAutoBond.save")}
        </button>
        {saved && (
          <span className="settings-hint">
            {t("settings.agentNetwork.lanAutoBond.saved")}
          </span>
        )}
      </div>
      {error && <p className="settings-diagnostics-error">{error}</p>}
      <p className="settings-hint">
        {enabled
          ? t("settings.agentNetwork.lanAutoBond.enabled")
          : t("settings.agentNetwork.lanAutoBond.disabled")}
        {enabled && !token.trim()
          ? ` — ${t("settings.agentNetwork.lanAutoBond.noToken")}`
          : ""}
      </p>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Company invites                                                            */
/* -------------------------------------------------------------------------- */

export function CompanyInvitesSection() {
  const t = useT();
  const nodeService = useNodeService();
  const isMobileNode = useIsInProcessMobileNode();

  const [invites, setInvites] = useState<CompanyInviteRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [expiresHours, setExpiresHours] = useState<string>("");
  const [note, setNote] = useState<string>("");
  const [uriByInviteId, setUriByInviteId] = useState<Record<string, string>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (isMobileNode) return;
    setLoading(true);
    setError(null);
    try {
      const result = await nodeService.listCompanyInvites();
      setInvites(result.invites);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [isMobileNode, nodeService]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleCreate = useCallback(async () => {
    if (isMobileNode) return;
    setCreating(true);
    setError(null);
    try {
      const hours = expiresHours.trim().length
        ? Number.parseInt(expiresHours, 10)
        : undefined;
      const result = await nodeService.createCompanyInvite({
        expiresInHours: Number.isFinite(hours) ? hours : undefined,
        note: note.trim() || undefined,
      });
      setUriByInviteId((current) => ({
        ...current,
        [result.invite.inviteId]: result.uri,
      }));
      setExpiresHours("");
      setNote("");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  }, [expiresHours, note, isMobileNode, nodeService, refresh]);

  const handleCopy = useCallback(async (inviteId: string) => {
    const uri = uriByInviteId[inviteId];
    if (!uri) {
      setError("No URI available — create a new invite first");
      return;
    }
    try {
      await navigator.clipboard.writeText(uri);
      setCopiedId(inviteId);
      window.setTimeout(() => {
        setCopiedId((current) => (current === inviteId ? null : current));
      }, 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [uriByInviteId]);

  const handleRevoke = useCallback(async (inviteId: string) => {
    if (isMobileNode) return;
    if (!window.confirm(t("settings.agentNetwork.companyInvites.revoke") + " — " + inviteId + "?")) {
      return;
    }
    setRevokingId(inviteId);
    setError(null);
    try {
      await nodeService.revokeCompanyInvite(inviteId);
      setUriByInviteId((current) => {
        const next = { ...current };
        delete next[inviteId];
        return next;
      });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRevokingId(null);
    }
  }, [isMobileNode, nodeService, refresh, t]);

  const now = Date.now();
  return (
    <section className="settings-section">
      <h4>{t("settings.agentNetwork.companyInvites.sectionTitle")}</h4>
      <p className="section-desc">
        {t("settings.agentNetwork.companyInvites.sectionDesc")}
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
        <input
          type="number"
          min={1}
          max={24 * 365}
          placeholder={t("settings.agentNetwork.companyInvites.expiresInHoursLabel")}
          value={expiresHours}
          onChange={(e) => setExpiresHours(e.target.value)}
          disabled={creating}
          style={{ width: "100%" }}
        />
        <input
          type="text"
          placeholder={t("settings.agentNetwork.companyInvites.notePlaceholder")}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          disabled={creating}
          style={{ width: "100%" }}
        />
        <button
          type="button"
          className="settings-button"
          disabled={creating}
          onClick={() => { void handleCreate(); }}
        >
          {creating
            ? t("settings.agentNetwork.companyInvites.creating")
            : t("settings.agentNetwork.companyInvites.createButton")}
        </button>
      </div>

      {error && (
        <p className="settings-diagnostics-error">
          {t("settings.agentNetwork.companyInvites.error", { error })}
        </p>
      )}

      {loading ? (
        <p className="settings-hint">
          {t("settings.agentNetwork.companyInvites.loading")}
        </p>
      ) : invites.length === 0 ? (
        <p className="settings-hint">
          {t("settings.agentNetwork.companyInvites.empty")}
        </p>
      ) : (
        <ul className="settings-list">
          {invites.map((invite) => {
            const status = classifyInvite(invite, now);
            return (
              <li
                key={invite.inviteId}
                className="settings-list-item"
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <div>
                  <div>{invite.note ?? invite.inviteId}</div>
                  <div className="settings-hint" style={{ fontSize: "0.75rem" }}>
                    {status}
                    {status === "active"
                      ? ` (expires ${formatExpiresAt(invite)})`
                      : ""}
                    {status === "used" && invite.usedByDeviceId
                      ? ` by ${invite.usedByDeviceId}`
                      : ""}
                    <br />
                    <code style={{ fontSize: "0.65rem" }}>{invite.inviteId}</code>
                  </div>
                </div>
                {status === "active" && (
                  <div style={{ display: "flex", gap: 4 }}>
                    <button
                      type="button"
                      className="settings-button"
                      onClick={() => { void handleCopy(invite.inviteId); }}
                      disabled={copiedId === invite.inviteId}
                    >
                      {copiedId === invite.inviteId
                        ? t("settings.agentNetwork.companyInvites.copyUriCopied")
                        : t("settings.agentNetwork.companyInvites.copyUri")}
                    </button>
                    <button
                      type="button"
                      className="settings-button"
                      disabled={revokingId === invite.inviteId}
                      onClick={() => { void handleRevoke(invite.inviteId); }}
                    >
                      {revokingId === invite.inviteId
                        ? t("settings.agentNetwork.companyInvites.revoking")
                        : t("settings.agentNetwork.companyInvites.revoke")}
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <button
        type="button"
        className="settings-button"
        style={{ marginTop: 8 }}
        disabled={loading}
        onClick={() => { void refresh(); }}
      >
        {t("settings.agentNetwork.companyInvites.refresh")}
      </button>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Pairing kiosk                                                              */
/* -------------------------------------------------------------------------- */

export function PairingKioskSection() {
  const t = useT();
  const nodeService = useNodeService();
  const isMobileNode = useIsInProcessMobileNode();
  const { nodeConfig } = useNodeState();

  const [status, setStatus] = useState<PairingKioskStatus | null>(null);
  const [enabledDraft, setEnabledDraft] = useState<boolean>(false);
  const [tokenDraft, setTokenDraft] = useState<string>("");
  const [bindAddressDraft, setBindAddressDraft] = useState<string>("127.0.0.1");
  const [bindPortDraft, setBindPortDraft] = useState<string>("3737");
  const [allowLanDraft, setAllowLanDraft] = useState<boolean>(false);
  const [expiresAtDraft, setExpiresAtDraft] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (isMobileNode) return;
    try {
      const next = await nodeService.getPairingKioskStatus();
      setStatus(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [isMobileNode, nodeService]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (isMobileNode) return;
    const cfg = nodeConfig as
      | {
          pairingKioskEnabled?: boolean;
          pairingKioskAdminToken?: string;
          pairingKioskBindAddress?: string;
          pairingKioskPort?: number;
          pairingKioskAllowLanBind?: boolean;
          pairingKioskExpiresAt?: string;
        }
      | null
      | undefined;
    if (!cfg) return;
    setEnabledDraft(cfg.pairingKioskEnabled ?? false);
    setTokenDraft(cfg.pairingKioskAdminToken ?? "");
    setBindAddressDraft(cfg.pairingKioskBindAddress ?? "127.0.0.1");
    setBindPortDraft(String(cfg.pairingKioskPort ?? 3737));
    setAllowLanDraft(cfg.pairingKioskAllowLanBind ?? false);
    setExpiresAtDraft(cfg.pairingKioskExpiresAt ?? "");
  }, [
    isMobileNode,
    nodeConfig,
    (nodeConfig as { pairingKioskEnabled?: boolean } | null | undefined)
      ?.pairingKioskEnabled,
    (nodeConfig as { pairingKioskAdminToken?: string } | null | undefined)
      ?.pairingKioskAdminToken,
    (nodeConfig as { pairingKioskBindAddress?: string } | null | undefined)
      ?.pairingKioskBindAddress,
    (nodeConfig as { pairingKioskPort?: number } | null | undefined)
      ?.pairingKioskPort,
    (nodeConfig as { pairingKioskAllowLanBind?: boolean } | null | undefined)
      ?.pairingKioskAllowLanBind,
    (nodeConfig as { pairingKioskExpiresAt?: string } | null | undefined)
      ?.pairingKioskExpiresAt,
  ]);

  const handleSave = useCallback(async () => {
    if (isMobileNode) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const port = Number.parseInt(bindPortDraft, 10);
      const validPort =
        Number.isFinite(port) && port > 0 && port < 65_536 ? port : 3737;
      const partial: Record<string, unknown> = {
        pairingKioskEnabled: enabledDraft,
        pairingKioskBindAddress: bindAddressDraft.trim() || "127.0.0.1",
        pairingKioskPort: validPort,
        pairingKioskAllowLanBind: allowLanDraft,
        pairingKioskExpiresAt: expiresAtDraft.trim() || undefined,
      };
      if (tokenDraft.trim()) {
        partial.pairingKioskAdminToken = tokenDraft.trim();
      }
      await nodeService.updateNodeConfig(
        partial as Parameters<typeof nodeService.updateNodeConfig>[0],
      );
      await nodeService.syncPairingKioskFromConfig();
      await refresh();
      setSaved(true);
      window.setTimeout(() => {
        setSaved(false);
      }, 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }, [
    allowLanDraft,
    bindAddressDraft,
    bindPortDraft,
    enabledDraft,
    expiresAtDraft,
    isMobileNode,
    nodeService,
    refresh,
    tokenDraft,
  ]);

  const handleGenerate = useCallback(() => {
    setTokenDraft(generateRandomToken(32));
  }, []);

  return (
    <section className="settings-section">
      <h4>{t("settings.agentNetwork.pairingKiosk.sectionTitle")}</h4>
      <p className="section-desc">
        {t("settings.agentNetwork.pairingKiosk.sectionDesc")}
      </p>
      <label
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          marginBottom: 8,
        }}
      >
        <input
          type="checkbox"
          checked={enabledDraft}
          onChange={(e) => setEnabledDraft(e.target.checked)}
          disabled={saving}
        />
        <span>{t("settings.agentNetwork.pairingKiosk.enableLabel")}</span>
      </label>
      <input
        type="text"
        placeholder={t("settings.agentNetwork.pairingKiosk.bindAddressLabel")}
        value={bindAddressDraft}
        onChange={(e) => setBindAddressDraft(e.target.value)}
        disabled={saving}
        style={{ width: "100%", marginBottom: 4 }}
      />
      <input
        type="number"
        min={1}
        max={65535}
        placeholder={t("settings.agentNetwork.pairingKiosk.bindPortLabel")}
        value={bindPortDraft}
        onChange={(e) => setBindPortDraft(e.target.value)}
        disabled={saving}
        style={{ width: "100%", marginBottom: 4 }}
      />
      <label
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          marginBottom: 8,
        }}
      >
        <input
          type="checkbox"
          checked={allowLanDraft}
          onChange={(e) => setAllowLanDraft(e.target.checked)}
          disabled={saving}
        />
        <span>{t("settings.agentNetwork.pairingKiosk.allowLanBindLabel")}</span>
      </label>
      <input
        type="text"
        minLength={16}
        placeholder={t("settings.agentNetwork.pairingKiosk.adminTokenLabel")}
        value={tokenDraft}
        onChange={(e) => setTokenDraft(e.target.value)}
        disabled={saving}
        style={{ width: "100%", marginBottom: 4 }}
      />
      <div
        style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}
      >
        <button
          type="button"
          className="settings-button"
          onClick={handleGenerate}
          disabled={saving}
        >
          {t("settings.agentNetwork.pairingKiosk.generateToken")}
        </button>
        <button
          type="button"
          className="settings-button"
          onClick={() => { void handleSave(); }}
          disabled={saving}
        >
          {saving
            ? t("settings.agentNetwork.pairingKiosk.saving")
            : t("settings.agentNetwork.pairingKiosk.save")}
        </button>
        {saved && (
          <span className="settings-hint">
            {t("settings.agentNetwork.pairingKiosk.saved")}
          </span>
        )}
      </div>
      <input
        type="text"
        placeholder={t("settings.agentNetwork.pairingKiosk.expiresAtLabel")}
        value={expiresAtDraft}
        onChange={(e) => setExpiresAtDraft(e.target.value)}
        disabled={saving}
        style={{ width: "100%", marginBottom: 8 }}
      />
      {error && (
        <p className="settings-diagnostics-error">
          {t("settings.agentNetwork.pairingKiosk.error", { error })}
        </p>
      )}
      {status?.running && status.address && status.port ? (
        <p className="settings-hint">
          {t("settings.agentNetwork.pairingKiosk.statusRunning", {
            address: status.address,
            port: status.port,
          })}
        </p>
      ) : status?.enabled ? (
        <p className="settings-hint">
          {t("settings.agentNetwork.pairingKiosk.statusStopped")}
        </p>
      ) : null}
      <button
        type="button"
        className="settings-button"
        style={{ marginTop: 8 }}
        onClick={() => { void refresh(); }}
      >
        {t("settings.agentNetwork.pairingKiosk.refreshStatus")}
      </button>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Fleet manifest                                                             */
/* -------------------------------------------------------------------------- */

const FLEET_ROLE_TEMPLATES = [
  { id: "operator", role: "operator", trustLevel: "direct" as const },
  { id: "engineer", role: "engineer", trustLevel: "direct" as const },
  { id: "contractor", role: "contractor", trustLevel: "referred" as const },
  { id: "visitor", role: "visitor", trustLevel: "public" as const },
] as const;

function skeletonMembersForTemplate(templateId: string): string {
  const tpl = FLEET_ROLE_TEMPLATES.find((t) => t.id === templateId);
  if (!tpl) return "";
  const skeleton = [
    {
      ownerId: "envoy:owner:REPLACE",
      deviceId: "envoy:device:REPLACE",
      devicePublicKeyPem: "-----BEGIN PUBLIC KEY-----\nREPLACE\n-----END PUBLIC KEY-----",
      role: tpl.role,
      trustLevel: tpl.trustLevel,
      displayName: "Name",
    },
  ];
  return JSON.stringify(skeleton, null, 2);
}

export function FleetManifestSection() {
  const t = useT();
  const nodeService = useNodeService();
  const isMobileNode = useIsInProcessMobileNode();

  const [manifests, setManifests] = useState<FleetManifestRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jsonDraft, setJsonDraft] = useState<string>("");
  const [labelDraft, setLabelDraft] = useState<string>("");
  const [signing, setSigning] = useState(false);
  const [importing, setImporting] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [lastImportSummary, setLastImportSummary] = useState<string | null>(null);
  const [signed, setSigned] = useState<FleetManifest | null>(null);
  const [copiedSigned, setCopiedSigned] = useState(false);
  const [autoJoin, setAutoJoin] = useState(true);

  const refresh = useCallback(async () => {
    if (isMobileNode) return;
    setLoading(true);
    setError(null);
    try {
      const result = await nodeService.listFleetManifests();
      setManifests(result.manifests);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [isMobileNode, nodeService]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleSign = useCallback(async () => {
    if (isMobileNode) return;
    if (!jsonDraft.trim().length) {
      setError(
        t("settings.agentNetwork.fleetManifest.invalidMembersJson"),
      );
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonDraft);
    } catch (e) {
      setError(`Invalid JSON: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }
    if (!Array.isArray(parsed) || parsed.length === 0) {
      setError(t("settings.agentNetwork.fleetManifest.invalidMembersJson"));
      return;
    }
    const validation = FleetMemberSchema.array().safeParse(parsed);
    if (!validation.success) {
      setError(
        `Invalid members: ${validation.error.issues
          .slice(0, 3)
          .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
          .join("; ")}`,
      );
      return;
    }
    setSigning(true);
    setError(null);
    setLastImportSummary(null);
    setSigned(null);
    try {
      const result = await nodeService.createFleetManifest({
        label: labelDraft.trim() || undefined,
        members: validation.data as FleetManifest["members"],
        autoJoinAgentNetwork: autoJoin,
      });
      setSigned(result.manifest);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSigning(false);
    }
  }, [autoJoin, isMobileNode, jsonDraft, labelDraft, nodeService, t]);

  const handleImport = useCallback(async () => {
    if (isMobileNode) return;
    if (!signed) {
      setError("Sign the manifest first");
      return;
    }
    setImporting(true);
    setError(null);
    setLastImportSummary(null);
    try {
      const result = await nodeService.importFleetManifest({
        manifest: signed,
      });
      if (!result.ok) {
        setError(
          t("settings.agentNetwork.fleetManifest.errorImport", {
            reason: result.reason,
          }),
        );
        return;
      }
      setLastImportSummary(
        t("settings.agentNetwork.fleetManifest.summaryImport", {
          added: result.added,
          updated: result.updated,
          skipped: result.skipped.length,
        }),
      );
      setJsonDraft("");
      setLabelDraft("");
      setSigned(null);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setImporting(false);
    }
  }, [isMobileNode, nodeService, refresh, signed, t]);

  const handleCopySigned = useCallback(async () => {
    if (!signed) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(signed, null, 2));
      setCopiedSigned(true);
      window.setTimeout(() => setCopiedSigned(false), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [signed]);

  const handleRevoke = useCallback(
    async (manifestId: string) => {
      if (isMobileNode) return;
      if (
        !window.confirm(
          t("settings.agentNetwork.fleetManifest.revoke") + " — " + manifestId + "?",
        )
      ) {
        return;
      }
      setRevokingId(manifestId);
      setError(null);
      try {
        await nodeService.revokeFleetManifest(manifestId);
        await refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setRevokingId(null);
      }
    },
    [isMobileNode, nodeService, refresh, t],
  );

  return (
    <section className="settings-section">
      <h4>{t("settings.agentNetwork.fleetManifest.sectionTitle")}</h4>
      <p className="section-desc">
        {t("settings.agentNetwork.fleetManifest.sectionDesc")}
      </p>
      <input
        type="text"
        placeholder={t("settings.agentNetwork.fleetManifest.labelLabel")}
        value={labelDraft}
        onChange={(e) => setLabelDraft(e.target.value)}
        disabled={signing || importing}
        style={{ width: "100%", marginBottom: 4 }}
      />
      <div className="fleet-role-templates">
        <span className="fleet-role-templates__label">
          {t("settings.agentNetwork.fleetManifest.roleTemplateLabel")}
        </span>
        <div className="topic-chips">
          {FLEET_ROLE_TEMPLATES.map((tpl) => (
            <button
              key={tpl.id}
              type="button"
              className="topic-chip"
              title={t(`settings.agentNetwork.fleetManifest.roleTemplate.${tpl.id}.hint`)}
              onClick={() => setJsonDraft(skeletonMembersForTemplate(tpl.id))}
              disabled={signing || importing}
            >
              {t(`settings.agentNetwork.fleetManifest.roleTemplate.${tpl.id}.label`)}
            </button>
          ))}
        </div>
      </div>
      <textarea
        placeholder={t("settings.agentNetwork.fleetManifest.membersLabel")}
        value={jsonDraft}
        onChange={(e) => setJsonDraft(e.target.value)}
        disabled={signing || importing}
        style={{
          width: "100%",
          minHeight: 100,
          fontFamily: "monospace",
          fontSize: 12,
          marginBottom: 4,
        }}
      />
      <label
        className="fleet-manifest__auto-join"
        style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 8, cursor: "pointer" }}
      >
        <input
          type="checkbox"
          checked={autoJoin}
          onChange={(e) => setAutoJoin(e.target.checked)}
          disabled={signing || importing}
        />
        <span className="settings-hint" style={{ margin: 0 }}>
          {t("settings.agentNetwork.fleetManifest.autoJoinLabel")}
        </span>
      </label>
      <div
        style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}
      >
        <button
          type="button"
          className="settings-button"
          onClick={() => { void handleSign(); }}
          disabled={signing || importing}
        >
          {signing
            ? t("settings.agentNetwork.fleetManifest.signing")
            : t("settings.agentNetwork.fleetManifest.signButton")}
        </button>
        {signed && (
          <button
            type="button"
            className="settings-button"
            onClick={() => { void handleImport(); }}
            disabled={importing}
          >
            {importing
              ? t("settings.agentNetwork.fleetManifest.importing")
              : t("settings.agentNetwork.fleetManifest.importButton")}
          </button>
        )}
      </div>
      {signed && (
        <div
          style={{
            padding: 8,
            border: "1px solid var(--settings-border, #ccc)",
            borderRadius: 4,
            marginBottom: 8,
          }}
        >
          <p className="settings-hint" style={{ marginTop: 0 }}>
            {t("settings.agentNetwork.fleetManifest.signedHint", {
              manifestId: signed.manifestId,
              members: signed.members.length,
            })}
          </p>
          <pre
            style={{
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
              fontSize: 11,
              maxHeight: 120,
              overflow: "auto",
              background: "rgba(0,0,0,0.05)",
              padding: 6,
              borderRadius: 4,
            }}
          >
            {JSON.stringify(signed, null, 2)}
          </pre>
          <button
            type="button"
            className="settings-button"
            onClick={() => { void handleCopySigned(); }}
          >
            {copiedSigned
              ? t("settings.agentNetwork.fleetManifest.copyCopied")
              : t("settings.agentNetwork.fleetManifest.copyButton")}
          </button>
        </div>
      )}
      {lastImportSummary && <p className="settings-hint">{lastImportSummary}</p>}
      {error && (
        <p className="settings-diagnostics-error">
          {t("settings.agentNetwork.fleetManifest.error", { error })}
        </p>
      )}

      {loading ? (
        <p className="settings-hint">
          {t("settings.agentNetwork.fleetManifest.loading")}
        </p>
      ) : manifests.length === 0 ? (
        <p className="settings-hint">
          {t("settings.agentNetwork.fleetManifest.empty")}
        </p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {manifests.map((m) => (
            <li
              key={m.manifestId}
              style={{
                border: "1px solid var(--settings-border, #ccc)",
                borderRadius: 4,
                padding: 8,
                marginBottom: 6,
              }}
            >
              <strong>{m.label ?? m.manifestId}</strong>{" "}
              <span className="settings-hint">
                ({m.manifestId.slice(0, 8)}…)
              </span>
              <div style={{ fontSize: 12, color: "var(--settings-fg-dim, #666)" }}>
                {t("settings.agentNetwork.fleetManifest.rowSummary", {
                  memberCount: m.memberCount,
                  issuer: m.issuerOwnerFingerprint,
                  importedAt: m.importedAt.slice(0, 10),
                })}
              </div>
              {m.revokedAt && (
                <div style={{ color: "var(--settings-error, #b00)", fontSize: 12 }}>
                  {t("settings.agentNetwork.fleetManifest.revoked", {
                    at: m.revokedAt.slice(0, 10),
                  })}
                </div>
              )}
              <button
                type="button"
                className="settings-button"
                style={{ marginTop: 4 }}
                disabled={Boolean(m.revokedAt) || revokingId === m.manifestId}
                onClick={() => { void handleRevoke(m.manifestId); }}
              >
                {revokingId === m.manifestId
                  ? t("settings.agentNetwork.fleetManifest.revoking")
                  : t("settings.agentNetwork.fleetManifest.revoke")}
              </button>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        className="settings-button"
        style={{ marginTop: 8 }}
        onClick={() => { void refresh(); }}
      >
        {t("settings.agentNetwork.fleetManifest.refresh")}
      </button>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Bond autonomy                                                              */
/* -------------------------------------------------------------------------- */

export function BondAutonomySection() {
  const t = useT();
  const nodeService = useNodeService();
  const { nodeConfig, refreshNodeConfig } = useNodeState();
  const [enabled, setEnabled] = useState(false);
  const [maxPerDay, setMaxPerDay] = useState("50");
  const [requireReferralProof, setRequireReferralProof] = useState(true);
  const [maxTier, setMaxTier] = useState<"direct" | "referred">("direct");
  const [minOverlap, setMinOverlap] = useState("0");
  const [notifyOwner, setNotifyOwner] = useState(true);
  const [sponsorToken, setSponsorToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setEnabled(nodeConfig?.bondAutonomyEnabled ?? false);
    setMaxPerDay(String(nodeConfig?.bondAutonomyMaxAutoBondsPerDay ?? 50));
    setRequireReferralProof(nodeConfig?.bondAutonomyRequireReferralProof ?? true);
    setMaxTier(nodeConfig?.bondAutonomyMaxAutoBondTier ?? "direct");
    setMinOverlap(String(nodeConfig?.bondAutonomyMinTrustOverlapScore ?? 0));
    setNotifyOwner(nodeConfig?.bondAutonomyNotifyOwnerOnAutoBond ?? true);
    setSponsorToken(nodeConfig?.bondAutonomySponsorProofToken ?? "");
  }, [nodeConfig]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await nodeService.updateNodeConfig({
        bondAutonomyEnabled: enabled,
        bondAutonomyMaxAutoBondsPerDay: Number.parseInt(maxPerDay, 10) || 0,
        bondAutonomyRequireReferralProof: requireReferralProof,
        bondAutonomyMaxAutoBondTier: maxTier,
        bondAutonomyMinTrustOverlapScore: Number.parseFloat(minOverlap) || 0,
        bondAutonomyNotifyOwnerOnAutoBond: notifyOwner,
        bondAutonomySponsorProofToken: sponsorToken.trim() || undefined,
      } as Parameters<typeof nodeService.updateNodeConfig>[0]);
      await refreshNodeConfig();
      setSaved(true);
      window.setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }, [
    enabled,
    maxPerDay,
    maxTier,
    minOverlap,
    nodeService,
    notifyOwner,
    refreshNodeConfig,
    requireReferralProof,
    sponsorToken,
  ]);

  return (
    <section className="settings-section">
      <h4>{t("settings.agentNetwork.bondAutonomy.heading")}</h4>
      <p className="section-desc">{t("settings.agentNetwork.bondAutonomy.desc")}</p>
      <label style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          disabled={saving}
        />
        <span>{t("settings.agentNetwork.bondAutonomy.enableLabel")}</span>
      </label>
      <div className="form-group">
        <label>{t("settings.agentNetwork.bondAutonomy.maxPerDayLabel")}</label>
        <input
          type="number"
          min={0}
          value={maxPerDay}
          onChange={(e) => setMaxPerDay(e.target.value)}
          disabled={saving}
        />
      </div>
      <label style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
        <input
          type="checkbox"
          checked={requireReferralProof}
          onChange={(e) => setRequireReferralProof(e.target.checked)}
          disabled={saving}
        />
        <span>{t("settings.agentNetwork.bondAutonomy.requireReferralProofLabel")}</span>
      </label>
      <div className="form-group">
        <label>{t("settings.agentNetwork.bondAutonomy.maxTierLabel")}</label>
        <select
          className="settings-select"
          value={maxTier}
          onChange={(e) => setMaxTier(e.target.value as "direct" | "referred")}
          disabled={saving}
        >
          <option value="direct">{t("settings.agentNetwork.bondAutonomy.maxTierDirect")}</option>
          <option value="referred">{t("settings.agentNetwork.bondAutonomy.maxTierReferred")}</option>
        </select>
      </div>
      <div className="form-group">
        <label>{t("settings.agentNetwork.bondAutonomy.minOverlapLabel")}</label>
        <input
          type="number"
          min={0}
          max={1}
          step={0.1}
          value={minOverlap}
          onChange={(e) => setMinOverlap(e.target.value)}
          disabled={saving}
        />
      </div>
      <label style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
        <input
          type="checkbox"
          checked={notifyOwner}
          onChange={(e) => setNotifyOwner(e.target.checked)}
          disabled={saving}
        />
        <span>{t("settings.agentNetwork.bondAutonomy.notifyOwnerLabel")}</span>
      </label>
      <div className="form-group">
        <label>{t("settings.agentNetwork.bondAutonomy.sponsorTokenLabel")}</label>
        <input
          type="text"
          value={sponsorToken}
          onChange={(e) => setSponsorToken(e.target.value)}
          placeholder={t("settings.agentNetwork.bondAutonomy.sponsorTokenPlaceholder")}
          disabled={saving}
        />
        <p className="settings-hint">{t("settings.agentNetwork.bondAutonomy.sponsorTokenHelp")}</p>
      </div>
      <button type="button" className="settings-button" onClick={() => { void handleSave(); }} disabled={saving}>
        {saving ? t("settings.agentNetwork.bondAutonomy.saving") : t("settings.agentNetwork.bondAutonomy.save")}
      </button>
      {saved ? <span className="settings-hint"> {t("settings.agentNetwork.bondAutonomy.saved")}</span> : null}
      {error ? <p className="library-view-error">{error}</p> : null}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Setup sponsor friend                                                       */
/* -------------------------------------------------------------------------- */

export function SetupSponsorFriendSection() {
  const t = useT();
  const nodeService = useNodeService();
  const { nodeConfig, refreshNodeConfig } = useNodeState();
  const [resolvedSource, setResolvedSource] = useState<string>("none");
  const [enabled, setEnabled] = useState(false);
  const [contactUri, setContactUri] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [helloMessage, setHelloMessage] = useState("Hello!");
  const [proofOfContext, setProofOfContext] = useState("");
  const [maxAttempts, setMaxAttempts] = useState("12");
  const [retryDelayMs, setRetryDelayMs] = useState("5000");
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [saved, setSaved] = useState(false);
  const [runMsg, setRunMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshResolved = useCallback(async () => {
    try {
      const resolved = await nodeService.getSetupSponsorFriendConfig();
      setResolvedSource(resolved.source);
      setEnabled(resolved.enabled);
      setContactUri(resolved.contactUri ?? "");
      setOwnerId(resolved.ownerId ?? "");
      setHelloMessage(resolved.helloMessage || "Hello!");
      setProofOfContext(resolved.proofOfContext ?? "");
      setMaxAttempts(String(resolved.maxAttempts || 12));
      setRetryDelayMs(String(resolved.retryDelayMs || 5000));
    } catch {
      setResolvedSource("none");
    }
  }, [nodeService]);

  useEffect(() => {
    void refreshResolved();
  }, [nodeConfig, refreshResolved]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await nodeService.updateNodeConfig({
        setupSponsorFriendEnabled: enabled,
        setupSponsorFriendContactUri: contactUri.trim() || undefined,
        setupSponsorFriendOwnerId: ownerId.trim() || undefined,
        setupSponsorFriendHelloMessage: helloMessage.trim() || undefined,
        setupSponsorFriendProofOfContext: proofOfContext.trim() || undefined,
        setupSponsorFriendMaxAttempts: Number.parseInt(maxAttempts, 10) || undefined,
        setupSponsorFriendRetryDelayMs: Number.parseInt(retryDelayMs, 10) || undefined,
      } as Parameters<typeof nodeService.updateNodeConfig>[0]);
      await refreshNodeConfig();
      await refreshResolved();
      setSaved(true);
      window.setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }, [
    contactUri,
    enabled,
    helloMessage,
    maxAttempts,
    nodeService,
    ownerId,
    proofOfContext,
    refreshNodeConfig,
    refreshResolved,
    retryDelayMs,
  ]);

  const handleRun = useCallback(async () => {
    setRunning(true);
    setRunMsg(null);
    setError(null);
    try {
      const result = await nodeService.runSetupSponsorFriend();
      if (result.ok && !result.skipped) {
        setRunMsg(t("settings.agentNetwork.setupSponsorFriend.runOk"));
      } else if (result.skipped) {
        setRunMsg(result.reason ?? "skipped");
      } else {
        setRunMsg(t("settings.agentNetwork.setupSponsorFriend.runFailed", { error: result.reason ?? "unknown" }));
      }
      await refreshNodeConfig();
      await refreshResolved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }, [nodeService, refreshNodeConfig, refreshResolved, t]);

  return (
    <section className="settings-section">
      <h4>{t("settings.agentNetwork.setupSponsorFriend.heading")}</h4>
      <p className="section-desc">{t("settings.agentNetwork.setupSponsorFriend.desc")}</p>
      <p className="settings-hint">
        {t("settings.agentNetwork.setupSponsorFriend.resolvedLabel", {
          source:
            t(
              `settings.agentNetwork.setupSponsorFriend.source${
                resolvedSource.charAt(0).toUpperCase() + resolvedSource.slice(1)
              }`,
            ) || resolvedSource,
        })}
      </p>
      {resolvedSource === "bundled" ? (
        <p className="settings-hint">
          {t("settings.agentNetwork.setupSponsorFriend.bundledReadonlyHint")}
        </p>
      ) : null}
      {nodeConfig?.setupSponsorFriendCompletedAt ? (
        <p className="settings-hint">
          {t("settings.agentNetwork.setupSponsorFriend.statusCompleted", {
            at: nodeConfig.setupSponsorFriendCompletedAt,
          })}
        </p>
      ) : (
        <p className="settings-hint">{t("settings.agentNetwork.setupSponsorFriend.statusPending")}</p>
      )}
      {nodeConfig?.setupSponsorFriendLastError ? (
        <p className="library-view-error">
          {t("settings.agentNetwork.setupSponsorFriend.statusLastError", {
            error: nodeConfig.setupSponsorFriendLastError,
          })}
        </p>
      ) : null}
      <label style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          disabled={saving || running}
        />
        <span>{t("settings.agentNetwork.setupSponsorFriend.enableLabel")}</span>
      </label>
      <div className="form-group">
        <label>{t("settings.agentNetwork.setupSponsorFriend.contactUriLabel")}</label>
        <input
          type="text"
          value={contactUri}
          onChange={(e) => setContactUri(e.target.value)}
          placeholder={t("settings.agentNetwork.setupSponsorFriend.contactUriPlaceholder")}
          disabled={saving || running}
        />
      </div>
      <div className="form-group">
        <label>{t("settings.agentNetwork.setupSponsorFriend.ownerIdLabel")}</label>
        <input type="text" value={ownerId} onChange={(e) => setOwnerId(e.target.value)} disabled={saving || running} />
      </div>
      <div className="form-group">
        <label>{t("settings.agentNetwork.setupSponsorFriend.helloMessageLabel")}</label>
        <input
          type="text"
          value={helloMessage}
          onChange={(e) => setHelloMessage(e.target.value)}
          disabled={saving || running}
        />
      </div>
      <div className="form-group">
        <label>{t("settings.agentNetwork.setupSponsorFriend.proofLabel")}</label>
        <input
          type="text"
          value={proofOfContext}
          onChange={(e) => setProofOfContext(e.target.value)}
          disabled={saving || running}
        />
      </div>
      <div className="form-group">
        <label>{t("settings.agentNetwork.setupSponsorFriend.maxAttemptsLabel")}</label>
        <input
          type="number"
          min={1}
          value={maxAttempts}
          onChange={(e) => setMaxAttempts(e.target.value)}
          disabled={saving || running}
        />
      </div>
      <div className="form-group">
        <label>{t("settings.agentNetwork.setupSponsorFriend.retryDelayLabel")}</label>
        <input
          type="number"
          min={1000}
          value={retryDelayMs}
          onChange={(e) => setRetryDelayMs(e.target.value)}
          disabled={saving || running}
        />
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
        <button type="button" className="settings-button" onClick={() => { void handleSave(); }} disabled={saving || running}>
          {saving ? t("settings.agentNetwork.setupSponsorFriend.saving") : t("settings.agentNetwork.setupSponsorFriend.save")}
        </button>
        <button type="button" className="settings-button" onClick={() => { void handleRun(); }} disabled={saving || running}>
          {running ? t("settings.agentNetwork.setupSponsorFriend.running") : t("settings.agentNetwork.setupSponsorFriend.runNow")}
        </button>
        {saved ? <span className="settings-hint">{t("settings.agentNetwork.setupSponsorFriend.saved")}</span> : null}
        {runMsg ? <span className="settings-hint">{runMsg}</span> : null}
      </div>
      {error ? <p className="library-view-error">{error}</p> : null}
    </section>
  );
}
