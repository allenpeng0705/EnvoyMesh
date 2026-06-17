/**
 * Settings → Agent Network tab.
 *
 * One tab for all four fleet onboarding paths. Kept distinct from the AI
 * settings so the operator can find LAN auto-bond / company invites /
 * pairing kiosk / fleet manifest without scrolling past model-provider
 * configuration.
 *
 * Each section is a sub-component below so this file stays under ~700
 * lines and the wiring is obvious.
 */
import { useCallback, useEffect, useState } from "react";
import { useNodeState } from "../../context/NodeStateContext.js";
import { useT } from "../../context/I18nContext.js";
import {
  useIsInProcessMobileNode,
  useNodeService,
} from "../../hooks/useNodeService.js";
import type {
  CompanyInviteRecord,
  FleetManifest,
  FleetManifestRecord,
  PairingKioskStatus,
} from "@envoymesh/api";
import { FleetMemberSchema } from "@envoymesh/protocol";

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

/**
 * Brief explanation of the four paths. Always-on at the top of the tab so
 * a first-time operator knows what to flip.
 */
function AgentNetworkIntro() {
  const t = useT();
  return (
    <section className="settings-section">
      <h3>{t("settings.agentNetwork.title")}</h3>
      <p className="section-desc">{t("settings.agentNetwork.intro")}</p>
      <h4 style={{ marginBottom: 4 }}>
        {t("settings.agentNetwork.quickReferenceTitle")}
      </h4>
      <ul style={{ marginTop: 4, paddingLeft: 18 }}>
        <li>
          <strong>{t("settings.agentNetwork.companyInvites.sectionTitle")}</strong>
          {" — "}
          {t("settings.agentNetwork.quickReference.companyInvites")}
        </li>
        <li>
          <strong>{t("settings.agentNetwork.lanAutoBond.heading")}</strong>
          {" — "}
          {t("settings.agentNetwork.quickReference.lanAutoBond")}
        </li>
        <li>
          <strong>{t("settings.agentNetwork.pairingKiosk.sectionTitle")}</strong>
          {" — "}
          {t("settings.agentNetwork.quickReference.pairingKiosk")}
        </li>
        <li>
          <strong>{t("settings.agentNetwork.fleetManifest.sectionTitle")}</strong>
          {" — "}
          {t("settings.agentNetwork.quickReference.fleetManifest")}
        </li>
      </ul>
    </section>
  );
}

/**
 * Phase 35C — LAN auto-bond section.
 *
 * Off by default. When toggled on with a fleet token, this node will silently
 * accept `device.pair.request` envelopes from other fleet members that carry
 * the same token.
 */
function LanAutoBondSection() {
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
      await nodeService.updateNodeConfig({
        lanAutoBondEnabled: enabled,
        lanAutoBondFleetToken: trimmedToken || undefined,
      } as Parameters<typeof nodeService.updateNodeConfig>[0]);
      await refreshNodeConfig();
      setSaved(true);
      window.setTimeout(() => {
        setSaved(false);
      }, 3000);
    } catch (err) {
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

/**
 * Phase 35A — Company Invites.
 *
 * Long-lived bearer links minted on the home node and pasted into the
 * joiner's Social UI. Single-use. URI is captured at create-time and
 * pinned to the invite row in local component state, so the user always
 * copies the right URI even after creating more invites.
 */
function CompanyInvitesSection() {
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

/**
 * Phase 35D — Pairing Kiosk.
 *
 * Tiny HTTP server bound to 127.0.0.1 by default. Visiting laptops open the
 * page, paste the admin token, and mint a one-shot company invite.
 */
function PairingKioskSection() {
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

/**
 * Phase 35B — Fleet Manifest.
 *
 * Operator pastes member JSON, the home node signs it, then imports the
 * signed manifest to pre-stage trust for every member.
 *
 * Member JSON is validated against `FleetMemberSchema` *before* signing
 * so a malformed entry surfaces a useful error instead of producing a
 * broken manifest.
 */
function FleetManifestSection() {
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
    // Validate each entry against the runtime schema so the operator gets
    // a useful error instead of a broken manifest.
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
      });
      setSigned(result.manifest);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSigning(false);
    }
  }, [isMobileNode, jsonDraft, labelDraft, nodeService, t]);

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

export function SettingsAgentNetworkTab() {
  const t = useT();
  const isMobileNode = useIsInProcessMobileNode();

  if (isMobileNode) {
    return (
      <section className="settings-section">
        <h3>{t("settings.agentNetwork.title")}</h3>
        <p className="section-desc">
          {t("settings.agentNetwork.mobileNotAvailable")}
        </p>
      </section>
    );
  }

  return (
    <>
      <AgentNetworkIntro />
      <LanAutoBondSection />
      <CompanyInvitesSection />
      <PairingKioskSection />
      <FleetManifestSection />
    </>
  );
}