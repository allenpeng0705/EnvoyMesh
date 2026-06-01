import { useEffect, useState } from "react";
import { useT } from "../../context/I18nContext.js";
import { useNodeState } from "../../context/NodeStateContext.js";
import { useNodeService } from "../../hooks/useNodeService.js";
import { ShareContactCard } from "../discover/ShareContactCard.js";
import { PublicIcon, PrivateIcon } from "../../icons.js";
import type { CreateHumanProfileInput } from "@envoymesh/api";

export function SettingsAccountTab() {
  const t = useT();
  const nodeService = useNodeService();
  const { humanProfile, peerId, nodeStatus, refreshHumanProfile } = useNodeState();
  const [displayName, setDisplayName] = useState(humanProfile?.displayName ?? "");
  const [username, setUsername] = useState(humanProfile?.username ?? "");
  const [visibility, setVisibility] = useState<"public" | "private">(
    humanProfile?.profileVisibility ?? "private",
  );
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  useEffect(() => {
    setDisplayName(humanProfile?.displayName ?? "");
    setUsername(humanProfile?.username ?? "");
    setVisibility(humanProfile?.profileVisibility ?? "private");
  }, [humanProfile?.displayName, humanProfile?.username, humanProfile?.profileVisibility]);

  const [visibilitySaving, setVisibilitySaving] = useState(false);

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

  return (
    <>
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

      <section className="settings-section">
        <h3>{t("settings.account.shareWithFriend")}</h3>
        <p className="section-desc">
          {t("settings.account.shareDesc")}
        </p>
        <ShareContactCard />
      </section>
    </>
  );
}
