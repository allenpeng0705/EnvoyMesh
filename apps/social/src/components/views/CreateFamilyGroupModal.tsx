/**
 * Phase 51F follow-up — create a local family group room (no mesh members).
 */
import { useEffect, useMemo, useState } from "react";
import {
  OWNER_FAMILY_PROFILE_ID,
  chatRoomThreadKey,
  type FamilyProfile,
} from "@envoymesh/api";
import { useT } from "../../context/I18nContext.js";
import { useNodeState } from "../../context/NodeStateContext.js";
import { useNodeService } from "../../hooks/useNodeService.js";
import { ModalPortal } from "../ModalPortal.js";

interface CreateFamilyGroupModalProps {
  onClose: () => void;
  onCreated: (threadKey: string) => void;
}

export function CreateFamilyGroupModal({
  onClose,
  onCreated,
}: CreateFamilyGroupModalProps) {
  const t = useT();
  const nodeService = useNodeService();
  const { nodeConfig } = useNodeState();
  const myProfileId =
    nodeConfig?.callerFamilyProfileId?.trim() || OWNER_FAMILY_PROFILE_ID;
  const [title, setTitle] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const candidates = useMemo(() => {
    const list = (nodeConfig?.familyProfiles ?? []) as FamilyProfile[];
    return list
      .filter((p) => Boolean(p.id) && p.id !== myProfileId && p.active !== false)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [nodeConfig?.familyProfiles, myProfileId]);

  const toggleMember = (profileId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(profileId)) next.delete(profileId);
      else next.add(profileId);
      return next;
    });
  };

  const handleCreate = async () => {
    const trimmed = title.trim();
    if (!trimmed) {
      setError(t("chat.familyGroupTitleRequired", "Enter a group name"));
      return;
    }
    if (selected.size === 0) {
      setError(t("chat.familyGroupMembersRequired", "Pick at least one family member"));
      return;
    }
    if (!nodeService.createFamilyRoom) {
      setError(t("chat.familyGroupUnavailable", "Family groups are not available on this connection."));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { room } = await nodeService.createFamilyRoom({
        title: trimmed,
        memberProfileIds: [...selected],
      });
      onCreated(chatRoomThreadKey(room.roomId));
      onClose();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : t("chat.familyGroupCreateFailed", "Could not create family group"),
      );
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [busy, onClose]);

  return (
    <ModalPortal>
      <div className="modal-overlay" role="presentation" onClick={onClose}>
        <div
          className="modal-panel create-group-modal"
          role="dialog"
          aria-labelledby="family-group-title"
          onClick={(e) => e.stopPropagation()}
        >
          <h2 id="family-group-title">
            {t("chat.familyGroupCreateTitle", "New family group")}
          </h2>
          <p className="modal-desc">
            {t(
              "chat.familyGroupCreateDesc",
              "Local-only group for profiles on this home node. Messages never leave the house.",
            )}
          </p>

          <label className="field-label" htmlFor="family-group-name">
            {t("chat.familyGroupNameLabel", "Group name")}
          </label>
          <input
            id="family-group-name"
            type="text"
            className="text-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("chat.familyGroupNamePlaceholder", "e.g. Weekend plans")}
            maxLength={128}
            autoFocus
          />

          <div className="create-group-members-label">
            {t("chat.familyGroupMembersLabel", "Members")}
          </div>
          {candidates.length === 0 ? (
            <p className="modal-desc">
              {t(
                "chat.familyGroupNoMembers",
                "No other active family profiles yet. Add members in Settings → Family.",
              )}
            </p>
          ) : (
            <ul className="create-group-member-list">
              {candidates.map((profile) => (
                <li key={profile.id}>
                  <label className="create-group-member-row">
                    <input
                      type="checkbox"
                      checked={selected.has(profile.id)}
                      onChange={() => toggleMember(profile.id)}
                    />
                    <span
                      className="thread-avatar"
                      style={{ background: profile.avatarColor ?? "#6366f1" }}
                      aria-hidden
                    >
                      {(profile.name.trim().charAt(0) || "?").toUpperCase()}
                    </span>
                    <span>{profile.name}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}

          {error ? <p className="form-error">{error}</p> : null}

          <div className="modal-actions">
            <button type="button" className="secondary" onClick={onClose} disabled={busy}>
              {t("common.cancel", "Cancel")}
            </button>
            <button
              type="button"
              className="primary"
              onClick={() => void handleCreate()}
              disabled={busy || candidates.length === 0}
            >
              {busy
                ? t("chat.familyGroupCreating", "Creating…")
                : t("chat.familyGroupCreateButton", "Create")}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
