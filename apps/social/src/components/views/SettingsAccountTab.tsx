import { useCallback, useEffect, useState } from "react";
import { useT } from "../../context/I18nContext.js";
import { useNodeState } from "../../context/NodeStateContext.js";
import { useNodeService } from "../../hooks/useNodeService.js";
import { useOptimisticToggle } from "../../hooks/useOptimisticToggle.js";
import { ShareContactCard } from "../discover/ShareContactCard.js";
import { PublicIcon, PrivateIcon } from "../../icons.js";
import type { CreateHumanProfileInput } from "@envoymesh/api";

/**
 * SettingsAccountTab — combined Account panel.
 *
 * Folds the previous standalone tabs into one:
 *   - Your profile (displayName, username, visibility, share)
 *   - Identity (DID name registration, owner ID)
 *   - Privacy (autonomy kill switch, trust mode, data management,
 *     knowledge sharing) — formerly a standalone tab
 *
 * Authorized Devices was moved to the App tab to keep this panel
 * focused on the personal account surface (profile + identity +
 * privacy). Device management is housekeeping, alongside Language,
 * Appearance, and Activity.
 */
export function SettingsAccountTab() {
  const t = useT();
  const nodeService = useNodeService();
  const { humanProfile, peerId, nodeStatus, refreshHumanProfile, nodeConfig, refreshNodeConfig } =
    useNodeState();

  // --- Profile state ---
  const [displayName, setDisplayName] = useState(humanProfile?.displayName ?? "");
  const [username, setUsername] = useState(humanProfile?.username ?? "");
  const [visibility, setVisibility] = useState<"public" | "private">(
    humanProfile?.profileVisibility ?? "private",
  );
  const [saving, setSaving] = useState(false);
  const [visibilitySaving, setVisibilitySaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  useEffect(() => {
    setDisplayName(humanProfile?.displayName ?? "");
    setUsername(humanProfile?.username ?? "");
    setVisibility(humanProfile?.profileVisibility ?? "private");
  }, [humanProfile?.displayName, humanProfile?.username, humanProfile?.profileVisibility]);

  const handleSave = async () => {
    if (!displayName.trim()) {
      setSaveMsg(t("settings.account.displayNameRequired"));
      return;
    }
    if (!username.trim() || !/^[a-zA-Z0-9_]{3,30}$/.test(username.trim())) {
      setSaveMsg(t("settings.account.usernameInvalid"));
      return;
    }
    setSaving(true);
    setSaveMsg(null);
    try {
      await nodeService.updateHumanProfile({
        displayName: displayName.trim(),
        username: username.trim(),
        bio: humanProfile?.bio ?? "",
        gender: humanProfile?.gender,
        hobbies: humanProfile?.hobbies ?? [],
        knowledge: humanProfile?.knowledge ?? [],
        profileVisibility: visibility,
        capabilities: humanProfile?.capabilities,
      } satisfies CreateHumanProfileInput);
      await refreshHumanProfile();
      setSaveMsg(t("settings.account.saved"));
    } catch (error) {
      setSaveMsg(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  const handleVisibilityChange = async (next: "public" | "private") => {
    if (next === visibility) return;
    if (!displayName.trim()) {
      setSaveMsg(t("settings.account.addDisplayNameFirst"));
      return;
    }
    if (!username.trim() || !/^[a-zA-Z0-9_]{3,30}$/.test(username.trim())) {
      setSaveMsg(t("settings.account.addUsernameFirst"));
      return;
    }
    setVisibility(next);
    setVisibilitySaving(true);
    setSaveMsg(null);
    try {
      await nodeService.updateHumanProfile({
        displayName: displayName.trim(),
        username: username.trim(),
        bio: humanProfile?.bio ?? "",
        gender: humanProfile?.gender,
        hobbies: humanProfile?.hobbies ?? [],
        knowledge: humanProfile?.knowledge ?? [],
        profileVisibility: next,
        capabilities: humanProfile?.capabilities,
      } satisfies CreateHumanProfileInput);
      await refreshHumanProfile();
      setSaveMsg(next === "public" ? t("settings.account.nowDiscoverable") : t("settings.account.friendsOnlyNow"));
    } catch (error) {
      setVisibility(humanProfile?.profileVisibility ?? "private");
      setSaveMsg(error instanceof Error ? error.message : String(error));
    } finally {
      setVisibilitySaving(false);
    }
  };

  // --- Identity (DID) state ---
  const [didName, setDidName] = useState("");
  const [didStatus, setDidStatus] = useState<"idle" | "registering" | "registered" | "error">("idle");
  const [didError, setDidError] = useState("");
  const [ownerId, setOwnerId] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const profile = await nodeService.getProfile();
        if (!cancelled && profile?.owner?.ownerId) {
          setOwnerId(profile.owner.ownerId);
        }
      } catch { /* ignore */ }
    }
    void load();
    return () => { cancelled = true; };
  }, [nodeService]);

  const handleRegisterDid = async () => {
    const name = didName.toLowerCase().trim();
    if (name.length < 3) {
      setDidError(t("settings.account.identity.nameTooShort", "Name must be at least 3 characters"));
      setDidStatus("error");
      return;
    }
    if (!/^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/.test(name)) {
      setDidError(t("settings.account.identity.nameInvalid", "Only lowercase letters, numbers, and hyphens"));
      setDidStatus("error");
      return;
    }

    setDidStatus("registering");
    setDidError("");

    try {
      await nodeService.advertiseTopic(`did:envoy:${name}`);
      setDidStatus("registered");
    } catch (err) {
      setDidError(err instanceof Error ? err.message : String(err));
      setDidStatus("error");
    }
  };

  // --- Privacy state (formerly SettingsPrivacyTab) ---
  const killSwitchToggle = useOptimisticToggle(
    nodeConfig?.autonomousKillSwitch ?? false,
    async (autonomousKillSwitch) => {
      await nodeService.updateNodeConfig({ autonomousKillSwitch });
      await refreshNodeConfig();
    },
  );

  const trustModeToggle = useOptimisticToggle(
    nodeConfig?.trustModeEnabled ?? false,
    async (trustModeEnabled) => {
      await nodeService.updateNodeConfig({ trustModeEnabled });
      await refreshNodeConfig();
    },
  );

  const handleClearAllData = useCallback(async () => {
    if (!window.confirm(t("settings.account.privacy.clearDataConfirm"))) {
      return;
    }
    try {
      await nodeService.clearAllUserData();
      await refreshNodeConfig();
    } catch (e) {
      console.error("Failed to clear data:", e);
    }
  }, [nodeService, refreshNodeConfig, t]);

  return (
    <>
      {/* --- Your profile --- */}
      <section className="settings-section">
        <h3>{t("settings.account.yourProfile")}</h3>
        <p className="section-desc">
          {t("settings.account.profileDesc")}
        </p>
        <dl className="settings-list">
          <dt>{t("settings.account.displayName")}</dt>
          <dd>
            <input
              className="settings-input"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={t("settings.account.displayNamePlaceholder")}
            />
          </dd>
          <dt>{t("settings.account.username")}</dt>
          <dd>
            <input
              className="settings-input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={t("settings.account.usernamePlaceholder")}
            />
          </dd>
          <dt>{t("settings.account.whoCanFind")}</dt>
          <dd>
            <div className="visibility-toggle">
              <button
                type="button"
                className={visibility === "public" ? "active public" : ""}
                disabled={visibilitySaving}
                onClick={() => void handleVisibilityChange("public")}
              >
                <PublicIcon size={16} /> {t("settings.account.discoverable")}
              </button>
              <button
                type="button"
                className={visibility === "private" ? "active private" : ""}
                disabled={visibilitySaving}
                onClick={() => void handleVisibilityChange("private")}
              >
                <PrivateIcon size={16} /> {t("settings.account.friendsOnly")}
              </button>
            </div>
            <p className="field-desc">
              {visibilitySaving
                ? t("settings.account.visibilitySaving")
                : t("settings.account.visibilityHint")}
            </p>
          </dd>
          <dt>{t("settings.account.connection")}</dt>
          <dd>
            {nodeStatus === "running" ? (
              <span className="settings-hint">{t("settings.account.online")}</span>
            ) : (
              <span className="settings-hint">{t("settings.account.offline")}</span>
            )}
            {peerId && !peerId.startsWith("envoy_") && nodeStatus === "running" ? (
              <details className="settings-advanced-details">
                <summary>{t("settings.account.technicalDetails")}</summary>
                <code>{peerId}</code>
              </details>
            ) : null}
          </dd>
        </dl>
        <div className="settings-buttons">
          <button type="button" className="settings-save-btn" disabled={saving} onClick={() => void handleSave()}>
            {saving ? t("settings.account.saving") : t("settings.account.saveNameUsername")}
          </button>
        </div>
        {saveMsg ? <p className="settings-hint">{saveMsg}</p> : null}
      </section>

      {/* --- Share with friend --- */}
      <section className="settings-section">
        <h3>{t("settings.account.shareWithFriend")}</h3>
        <p className="section-desc">
          {t("settings.account.shareDesc")}
        </p>
        <ShareContactCard />
      </section>

      {/* --- Identity (DID) --- */}
      <section className="settings-section">
        <h3>{t("settings.account.identity.heading", "Identity")}</h3>
        <p className="section-desc">
          {t("settings.account.identity.sectionDesc", "Register a human-readable name that others can use to find you on the mesh.")}
        </p>

        {ownerId && (
          <div className="settings-info-box">
            <label className="settings-info-label">
              {t("settings.account.identity.ownerId", "Owner ID")}
            </label>
            <code className="settings-info-code">{ownerId}</code>
            <p className="field-desc" style={{ marginTop: "4px" }}>
              {t("settings.account.identity.ownerIdDesc", "Your cryptographic identity — always works, even without a DID name.")}
            </p>
          </div>
        )}

        <div className="settings-form-row" style={{ marginTop: "16px" }}>
          <label htmlFor="did-name-input">
            <strong>{t("settings.account.identity.didNameLabel", "DID Name")}</strong>
          </label>
          <div className="did-input-row" style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <span style={{ color: "var(--color-text-muted)", fontSize: "14px" }}>did:envoy:</span>
            <input
              id="did-name-input"
              type="text"
              className="settings-input"
              placeholder={t("settings.account.identity.didPlaceholder", "your-name")}
              value={didName}
              onChange={(e) => {
                setDidName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
                if (didStatus === "error" || didStatus === "registered") setDidStatus("idle");
              }}
              maxLength={32}
              disabled={didStatus === "registering" || didStatus === "registered"}
            />
            <button
              type="button"
              className="primary"
              onClick={() => void handleRegisterDid()}
              disabled={didStatus === "registering" || didStatus === "registered" || didName.trim().length < 3}
            >
              {didStatus === "registering"
                ? t("settings.account.identity.registering", "Registering...")
                : didStatus === "registered"
                  ? t("settings.account.identity.registered", "Registered ✓")
                  : t("settings.account.identity.register", "Register")}
            </button>
          </div>

          {didStatus === "registered" && (
            <p className="success-message" style={{ marginTop: "8px", color: "var(--color-success)" }}>
              {t("settings.account.identity.registeredDesc", "Your DID is now did:envoy:{name}. Others can find you by typing this name in search.", { name: didName })}
            </p>
          )}

          {didStatus === "error" && (
            <p className="error-message" style={{ marginTop: "8px", color: "var(--color-error)" }}>
              {didError}
            </p>
          )}

          <p className="field-desc" style={{ marginTop: "8px" }}>
            {t("settings.account.identity.didNameHint", "3-32 characters. Lowercase letters, numbers, and hyphens only. First to register wins.")}
          </p>
        </div>
      </section>

      {/* --- Privacy (formerly the standalone Privacy tab) ---
          Autonomy / Trust Mode / Data Management / Knowledge Sharing. */}
      <section className="settings-section">
        <h3>{t("settings.account.privacy.autonomy.title")}</h3>
        <p className="section-desc">
          {t("settings.account.privacy.autonomy.desc")}
        </p>
        <div className="settings-toggle-row">
          <div className="toggle-info">
            <strong>{t("settings.account.privacy.autonomy.killSwitch")}</strong>
            <span className="toggle-desc">{t("settings.account.privacy.autonomy.killSwitchDesc")}</span>
          </div>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={killSwitchToggle.checked}
              onChange={killSwitchToggle.onCheckboxChange}
            />
            <span className="slider" />
          </label>
        </div>
      </section>

      <section className="settings-section">
        <h3>{t("settings.account.privacy.trustMode.title")}</h3>
        <p className="section-desc">
          {t("settings.account.privacy.trustMode.desc")}
        </p>
        <div className="settings-toggle-row">
          <div className="toggle-info">
            <strong>{t("settings.account.privacy.trustMode.enable")}</strong>
            <span className="toggle-desc">{t("settings.account.privacy.trustMode.enableDesc")}</span>
          </div>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={trustModeToggle.checked}
              onChange={trustModeToggle.onCheckboxChange}
            />
            <span className="slider" />
          </label>
        </div>
      </section>

      <section className="settings-section">
        <h3>{t("settings.account.privacy.dataManagement.title")}</h3>
        <p className="section-desc">
          {t("settings.account.privacy.dataManagement.desc")}
        </p>
        <div className="settings-buttons">
          <button
            type="button"
            className="settings-button"
            onClick={handleClearAllData}
          >
            {t("settings.account.privacy.dataManagement.clearAllData")}
          </button>
        </div>
      </section>

      <section className="settings-section">
        <h3>{t("settings.account.privacy.sharing.title")}</h3>
        <p className="section-desc">
          {t("settings.account.privacy.sharing.desc")}
        </p>
        <dl className="settings-list">
          <dt>{t("settings.account.privacy.sharing.knowledgeSyndication")}</dt>
          <dd>
            <select
              className="settings-input"
              value={nodeConfig?.knowledgeSyndicationMaxSensitivity ?? ""}
              onChange={async (e) => {
                const value = e.target.value;
                await nodeService.updateNodeConfig({
                  knowledgeSyndicationMaxSensitivity:
                    value === ""
                      ? undefined
                      : (value as "public" | "friends" | "private"),
                });
                await refreshNodeConfig();
              }}
            >
              <option value="">{t("settings.account.privacy.sharing.bondOnly")}</option>
              <option value="public">{t("settings.account.privacy.sharing.public")}</option>
              <option value="friends">{t("settings.account.privacy.sharing.friends")}</option>
              <option value="private">{t("settings.account.privacy.sharing.private")}</option>
            </select>
            <p className="settings-hint" style={{ marginTop: "6px" }}>
              {t("settings.account.privacy.sharing.syndicationHint")}
            </p>
          </dd>
        </dl>
      </section>
    </>
  );
}
