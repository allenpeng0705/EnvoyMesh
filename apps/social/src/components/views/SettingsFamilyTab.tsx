/**
 * Phase 51F — Family Network settings (owner desktop).
 * List / create / rename / deactivate / delete profiles + family invite QR.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import type { FamilyProfile } from "@envoymesh/api";
import { OWNER_FAMILY_PROFILE_ID } from "@envoymesh/api";
import { useT } from "../../context/I18nContext.js";
import { useNodeService } from "../../hooks/useNodeService.js";
import { useNodeState } from "../../context/NodeStateContext.js";
import { ConfirmDialog } from "../ConfirmDialog.js";
import { FamilyInviteQRModal } from "../FamilyInviteQRModal.js";

const AVATAR_COLORS = [
  "#0d9488",
  "#2563eb",
  "#db2777",
  "#d97706",
  "#7c3aed",
  "#dc2626",
];

function initial(name: string): string {
  return (name.trim().charAt(0) || "?").toUpperCase();
}

export function SettingsFamilyTab() {
  const t = useT();
  const nodeService = useNodeService();
  const { refreshNodeConfig } = useNodeState();
  const [profiles, setProfiles] = useState<FamilyProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(AVATAR_COLORS[0]!);
  const [creating, setCreating] = useState(false);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<FamilyProfile | null>(null);
  const [showInviteQr, setShowInviteQr] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await nodeService.listFamilyProfiles();
      setProfiles(result.profiles ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [nodeService]);

  useEffect(() => {
    void load();
  }, [load]);

  const afterMutation = useCallback(async () => {
    await load();
    await refreshNodeConfig?.();
  }, [load, refreshNodeConfig]);

  const memberCount = useMemo(
    () => profiles.filter((p) => !p.isOwner && p.id !== OWNER_FAMILY_PROFILE_ID).length,
    [profiles],
  );
  const activeMembers = useMemo(
    () =>
      profiles.filter(
        (p) =>
          !p.isOwner &&
          p.id !== OWNER_FAMILY_PROFILE_ID &&
          p.active !== false,
      ).length,
    [profiles],
  );

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name || creating) return;
    setCreating(true);
    setError(null);
    try {
      await nodeService.createFamilyProfile({
        name,
        avatarColor: newColor,
      });
      setNewName("");
      await afterMutation();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  };

  const handleRename = async (id: string) => {
    const name = renameValue.trim();
    if (!name) return;
    setBusyId(id);
    setError(null);
    try {
      await nodeService.updateFamilyProfile({ id, name });
      setRenameId(null);
      await afterMutation();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  };

  const handleToggleActive = async (profile: FamilyProfile) => {
    if (profile.isOwner) return;
    setBusyId(profile.id);
    setError(null);
    try {
      await nodeService.updateFamilyProfile({
        id: profile.id,
        active: profile.active === false,
      });
      await afterMutation();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget || deleteTarget.isOwner) return;
    setBusyId(deleteTarget.id);
    setError(null);
    try {
      await nodeService.deleteFamilyProfile(deleteTarget.id);
      setDeleteTarget(null);
      await afterMutation();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="settings-family-tab">
      <header className="settings-family-hero">
        <div className="settings-family-hero__text">
          <p className="settings-family-eyebrow">
            {t("settings.family.eyebrow", "Home node")}
          </p>
          <h3 className="settings-family-title">
            {t("settings.family.title", "Family Network")}
          </h3>
          <p className="settings-family-lead">
            {t(
              "settings.family.hint",
              "Private profiles on this computer. Family phones join with the invite QR below — they get AI and family chat only, not your mesh contacts, vault, or terminal.",
            )}
          </p>
        </div>
        <div className="settings-family-stats" aria-label={t("settings.family.statsAria", "Family stats")}>
          <div className="settings-family-stat">
            <span className="settings-family-stat__value">{memberCount}</span>
            <span className="settings-family-stat__label">
              {t("settings.family.statMembers", "Members")}
            </span>
          </div>
          <div className="settings-family-stat">
            <span className="settings-family-stat__value">{activeMembers}</span>
            <span className="settings-family-stat__label">
              {t("settings.family.statActive", "Active")}
            </span>
          </div>
        </div>
      </header>

      {error ? (
        <p className="settings-family-error" role="alert">
          {error}
        </p>
      ) : null}

      <section className="settings-family-invite-card" aria-labelledby="family-invite-heading">
        <div className="settings-family-invite-card__body">
          <div className="settings-family-invite-card__icon" aria-hidden>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
              <path d="M14 14h3v3h-3zM20 14v6M14 20h6" />
            </svg>
          </div>
          <div className="settings-family-invite-card__copy">
            <h4 id="family-invite-heading">
              {t("settings.family.inviteCardTitle", "Invite with family QR")}
            </h4>
            <p>
              {t(
                "settings.family.inviteQrHint",
                "Have Mom or Dad scan this in EnvoyGo. This is not the owner pairing QR — that one grants full access.",
              )}
            </p>
          </div>
          <button
            type="button"
            className="settings-family-invite-btn"
            onClick={() => setShowInviteQr(true)}
          >
            {t("settings.family.inviteQr", "Show invite QR")}
          </button>
        </div>
        <p className="settings-family-invite-note">
          {t(
            "settings.family.ownerPairNote",
            "Tip: the top-bar pairing QR is for your own second phone (full owner). Family members must use this invite QR.",
          )}
        </p>
      </section>

      <section className="settings-family-section" aria-labelledby="family-profiles-heading">
        <div className="settings-family-section__head">
          <h4 id="family-profiles-heading">
            {t("settings.family.profilesTitle", "Profiles")}
          </h4>
          <p className="settings-family-section__hint">
            {t(
              "settings.family.profilesHint",
              "Each phone locks to one profile at pairing. Rename or deactivate anytime.",
            )}
          </p>
        </div>

        {loading ? (
          <div className="settings-family-loading" aria-busy="true">
            <span className="settings-family-spinner" aria-hidden />
            <span>{t("settings.family.loading", "Loading profiles…")}</span>
          </div>
        ) : (
          <ul className="settings-family-list">
            {profiles.map((profile) => {
              const isOwner =
                profile.isOwner || profile.id === OWNER_FAMILY_PROFILE_ID;
              const inactive = profile.active === false;
              return (
                <li
                  key={profile.id}
                  className={`settings-family-row${inactive ? " is-inactive" : ""}${isOwner ? " is-owner" : ""}`}
                >
                  <span
                    className="settings-family-avatar"
                    style={{ background: profile.avatarColor ?? "#0d9488" }}
                    aria-hidden
                  >
                    {initial(profile.name)}
                  </span>
                  <div className="settings-family-row__main">
                    {renameId === profile.id ? (
                      <div className="settings-family-rename">
                        <input
                          className="settings-family-input"
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          aria-label={t("settings.family.renameLabel", "New name")}
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter") void handleRename(profile.id);
                            if (e.key === "Escape") setRenameId(null);
                          }}
                        />
                        <button
                          type="button"
                          className="settings-family-btn settings-family-btn--primary"
                          disabled={busyId === profile.id}
                          onClick={() => void handleRename(profile.id)}
                        >
                          {t("settings.family.save", "Save")}
                        </button>
                        <button
                          type="button"
                          className="settings-family-btn"
                          onClick={() => setRenameId(null)}
                        >
                          {t("settings.family.cancel", "Cancel")}
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="settings-family-row__title">
                          <strong>{profile.name}</strong>
                          {isOwner ? (
                            <span className="settings-family-badge settings-family-badge--owner">
                              {t("settings.family.ownerBadge", "Owner")}
                            </span>
                          ) : null}
                          {inactive ? (
                            <span className="settings-family-badge settings-family-badge--muted">
                              {t("settings.family.inactiveBadge", "Inactive")}
                            </span>
                          ) : null}
                        </div>
                        <span className="settings-family-row__sub">
                          {isOwner
                            ? t(
                                "settings.family.ownerSub",
                                "Full EnvoyMesh on this home node",
                              )
                            : t(
                                "settings.family.memberSub",
                                "AI + family chat on EnvoyGo",
                              )}
                        </span>
                      </>
                    )}
                  </div>
                  {!isOwner && renameId !== profile.id ? (
                    <div className="settings-family-row__actions">
                      <button
                        type="button"
                        className="settings-family-btn"
                        disabled={busyId === profile.id}
                        onClick={() => {
                          setRenameId(profile.id);
                          setRenameValue(profile.name);
                        }}
                      >
                        {t("settings.family.rename", "Rename")}
                      </button>
                      <button
                        type="button"
                        className="settings-family-btn"
                        disabled={busyId === profile.id}
                        onClick={() => void handleToggleActive(profile)}
                      >
                        {inactive
                          ? t("settings.family.reactivate", "Reactivate")
                          : t("settings.family.deactivate", "Deactivate")}
                      </button>
                      <button
                        type="button"
                        className="settings-family-btn settings-family-btn--danger"
                        disabled={busyId === profile.id}
                        onClick={() => setDeleteTarget(profile)}
                      >
                        {t("settings.family.delete", "Delete")}
                      </button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="settings-family-section" aria-labelledby="family-create-heading">
        <div className="settings-family-section__head">
          <h4 id="family-create-heading">
            {t("settings.family.createTitle", "Pre-create a profile")}
          </h4>
          <p className="settings-family-section__hint">
            {t(
              "settings.family.createHint",
              "Optional. Create “Mom” here first, then she picks that profile when scanning the invite (I’m back).",
            )}
          </p>
        </div>
        <div className="settings-family-create">
          <input
            className="settings-family-input settings-family-input--grow"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={t("settings.family.namePlaceholder", "Name (e.g. Mom)")}
            aria-label={t("settings.family.namePlaceholder", "Name (e.g. Mom)")}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleCreate();
            }}
          />
          <div
            className="settings-family-swatches"
            role="group"
            aria-label={t("settings.family.colorLabel", "Avatar color")}
          >
            {AVATAR_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className={`settings-family-swatch${newColor === c ? " is-selected" : ""}`}
                style={{ background: c }}
                aria-label={c}
                aria-pressed={newColor === c}
                onClick={() => setNewColor(c)}
              />
            ))}
          </div>
          <button
            type="button"
            className="settings-family-btn settings-family-btn--primary"
            disabled={creating || !newName.trim()}
            onClick={() => void handleCreate()}
          >
            {creating
              ? t("settings.family.creating", "Creating…")
              : t("settings.family.create", "Create")}
          </button>
        </div>
      </section>

      {showInviteQr ? (
        <FamilyInviteQRModal onClose={() => setShowInviteQr(false)} />
      ) : null}

      {deleteTarget ? (
        <ConfirmDialog
          title={t("settings.family.deleteTitle", "Delete family profile?")}
          message={t("settings.family.deleteMessage", "Remove {name}? Their chat history stays on disk but they can no longer connect.", {
            name: deleteTarget.name,
          })}
          confirmLabel={t("settings.family.delete", "Delete")}
          cancelLabel={t("settings.family.cancel", "Cancel")}
          variant="destructive"
          onConfirm={() => void handleDelete()}
          onCancel={() => setDeleteTarget(null)}
        />
      ) : null}
    </div>
  );
}
