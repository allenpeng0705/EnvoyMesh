import { useMemo, useState, useEffect } from "react";
import { useT } from "../../context/I18nContext.js";
import { useNodeState } from "../../context/NodeStateContext.js";
import { useNodeService } from "../../hooks/useNodeService.js";
import { contactLabel } from "../../lib/display.js";
import { PeerProfileAvatar } from "../PeerProfileAvatar.js";
import { ModalPortal } from "../ModalPortal.js";

interface InviteMembersModalProps {
  roomId: string;
  existingMemberOwnerIds: string[];
  onClose: () => void;
  onInvited: () => void;
}

export function InviteMembersModal({
  roomId,
  existingMemberOwnerIds,
  onClose,
  onInvited,
}: InviteMembersModalProps) {
  const t = useT();
  const nodeService = useNodeService();
  const { bonds } = useNodeState();
  const existing = useMemo(() => new Set(existingMemberOwnerIds), [existingMemberOwnerIds]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inviteCandidates = useMemo(
    () =>
      bonds
        .filter((b) => !existing.has(b.peerOwnerId))
        .sort((a, b) => contactLabel(a).localeCompare(contactLabel(b))),
    [bonds, existing],
  );

  const toggleMember = (ownerId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(ownerId)) next.delete(ownerId);
      else next.add(ownerId);
      return next;
    });
  };

  const handleInvite = async () => {
    if (selected.size === 0) {
      setError(t("groupChat.membersRequired"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await nodeService.inviteToChatRoom(roomId, [...selected]);
      onInvited();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("groupChat.inviteFailed"));
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
        aria-labelledby="invite-members-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="invite-members-title">{t("groupChat.inviteTitle")}</h2>
        <p className="modal-desc">{t("groupChat.inviteDesc")}</p>

        {inviteCandidates.length === 0 ? (
          <p className="modal-desc">{t("groupChat.noInviteCandidates")}</p>
        ) : (
          <ul className="create-group-member-list">
            {inviteCandidates.map((bond) => (
              <li key={bond.peerOwnerId}>
                <label className="create-group-member-row">
                  <input
                    type="checkbox"
                    checked={selected.has(bond.peerOwnerId)}
                    onChange={() => toggleMember(bond.peerOwnerId)}
                  />
                  <PeerProfileAvatar
                    ownerId={bond.peerOwnerId}
                    fallbackLabel={contactLabel(bond)}
                    className="thread-avatar"
                  />
                  <span>{contactLabel(bond)}</span>
                </label>
              </li>
            ))}
          </ul>
        )}

        {error ? <p className="form-error">{error}</p> : null}

        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </button>
          <button
            type="button"
            className="primary"
            onClick={() => void handleInvite()}
            disabled={busy || inviteCandidates.length === 0}
          >
            {busy ? t("groupChat.inviting") : t("groupChat.inviteButton")}
          </button>
        </div>
      </div>
      </div>
    </ModalPortal>
  );
}
