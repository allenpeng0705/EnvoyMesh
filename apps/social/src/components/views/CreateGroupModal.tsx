import { useMemo, useState, useEffect } from "react";
import { useT } from "../../context/I18nContext.js";
import { useNodeState } from "../../context/NodeStateContext.js";
import { useNodeService } from "../../hooks/useNodeService.js";
import { contactLabel } from "../../lib/display.js";
import { PeerProfileAvatar } from "../PeerProfileAvatar.js";
import { ModalPortal } from "../ModalPortal.js";
import { chatRoomThreadKey } from "@envoymesh/api";

interface CreateGroupModalProps {
  onClose: () => void;
  onCreated: (threadKey: string) => void;
}

export function CreateGroupModal({ onClose, onCreated }: CreateGroupModalProps) {
  const t = useT();
  const nodeService = useNodeService();
  const { bonds } = useNodeState();
  const [title, setTitle] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sortedBonds = useMemo(
    () => [...bonds].sort((a, b) => contactLabel(a).localeCompare(contactLabel(b))),
    [bonds],
  );

  const toggleMember = (ownerId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(ownerId)) next.delete(ownerId);
      else next.add(ownerId);
      return next;
    });
  };

  const handleCreate = async () => {
    const trimmed = title.trim();
    if (!trimmed) {
      setError(t("groupChat.titleRequired"));
      return;
    }
    if (selected.size === 0) {
      setError(t("groupChat.membersRequired"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const room = await nodeService.createChatRoom(trimmed, [...selected]);
      onCreated(chatRoomThreadKey(room.roomId));
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("groupChat.createFailed"));
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
        aria-labelledby="create-group-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="create-group-title">{t("groupChat.createTitle")}</h2>
        <p className="modal-desc">{t("groupChat.createDesc")}</p>

        <label className="field-label" htmlFor="group-title">
          {t("groupChat.nameLabel")}
        </label>
        <input
          id="group-title"
          type="text"
          className="text-input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t("groupChat.namePlaceholder")}
          maxLength={128}
          autoFocus
        />

        <div className="create-group-members-label">{t("groupChat.membersLabel")}</div>
        {sortedBonds.length === 0 ? (
          <p className="modal-desc">{t("groupChat.noBonds")}</p>
        ) : (
          <ul className="create-group-member-list">
            {sortedBonds.map((bond) => (
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
            onClick={() => void handleCreate()}
            disabled={busy || sortedBonds.length === 0}
          >
            {busy ? t("groupChat.creating") : t("groupChat.createButton")}
          </button>
        </div>
      </div>
      </div>
    </ModalPortal>
  );
}
