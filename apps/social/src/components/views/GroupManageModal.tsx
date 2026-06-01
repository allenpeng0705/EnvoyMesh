import { useEffect, useMemo, useRef, useState } from "react";
import { useT } from "../../context/I18nContext.js";
import { useNodeState } from "../../context/NodeStateContext.js";
import { useNodeService } from "../../hooks/useNodeService.js";
import type { ChatRoom } from "@envoymesh/api";
import { contactLabel } from "../../lib/display.js";
import { PeerProfileAvatar } from "../PeerProfileAvatar.js";
import { ModalPortal } from "../ModalPortal.js";

interface GroupManageModalProps {
  room: ChatRoom;
  onClose: () => void;
  onDismissed: () => void;
}

export function GroupManageModal({ room, onClose, onDismissed }: GroupManageModalProps) {
  const t = useT();
  const nodeService = useNodeService();
  const { bonds, humanProfile } = useNodeState();
  const selfOwnerId = humanProfile?.ownerId ?? "";
  const [title, setTitle] = useState(room.title);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTitle(room.title);
  }, [room.title]);

  const bondByOwnerId = useMemo(() => new Map(bonds.map((b) => [b.peerOwnerId, b])), [bonds]);

  const members = useMemo(
    () =>
      room.memberOwnerIds
        .map((ownerId) => ({
          ownerId,
          bond: bondByOwnerId.get(ownerId),
          isSelf: ownerId === selfOwnerId,
          isCreator: ownerId === room.creatorOwnerId,
        }))
        .sort((a, b) => {
          if (a.isCreator) return -1;
          if (b.isCreator) return 1;
          if (a.isSelf) return -1;
          if (b.isSelf) return 1;
          return contactLabel(a.bond ?? { peerOwnerId: a.ownerId }).localeCompare(
            contactLabel(b.bond ?? { peerOwnerId: b.ownerId }),
          );
        }),
    [bondByOwnerId, room.creatorOwnerId, room.memberOwnerIds, selfOwnerId],
  );

  const handleRename = async () => {
    const nextTitle = title.trim();
    if (!nextTitle || nextTitle === room.title) return;
    setBusy(true);
    setError(null);
    try {
      await nodeService.renameChatRoom(room.roomId, nextTitle);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("groupChat.renameFailed"));
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (ownerId: string, displayName: string) => {
    if (!confirm(t("groupChat.removeMemberConfirm", { name: displayName }))) return;
    setBusy(true);
    setError(null);
    try {
      await nodeService.removeMembersFromChatRoom(room.roomId, [ownerId]);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("groupChat.removeMemberFailed"));
    } finally {
      setBusy(false);
    }
  };

  const handleDismiss = async () => {
    if (!confirm(t("groupChat.dismissConfirm"))) return;
    setBusy(true);
    setError(null);
    try {
      await nodeService.dismissChatRoom(room.roomId);
      onDismissed();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("groupChat.dismissFailed"));
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
        className="modal-panel create-group-modal group-manage-modal"
        role="dialog"
        aria-labelledby="group-manage-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="group-manage-title">{t("groupChat.manageTitle")}</h2>

        <label className="modal-field">
          <span>{t("groupChat.renameLabel")}</span>
          <input
            type="text"
            value={title}
            maxLength={128}
            disabled={busy}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <button type="button" className="secondary" disabled={busy || title.trim() === room.title} onClick={() => void handleRename()}>
          {t("groupChat.renameButton")}
        </button>

        <h3 className="modal-subheading">{t("groupChat.memberCount", { count: room.memberOwnerIds.length })}</h3>
        <ul className="create-group-member-list">
          {members.map(({ ownerId, bond, isSelf, isCreator }) => {
            const label = isSelf
              ? t("messageBubble.you")
              : contactLabel(bond ?? { peerOwnerId: ownerId });
            return (
              <li key={ownerId} className="group-manage-member-row">
                <PeerProfileAvatar ownerId={ownerId} fallbackLabel={label} />
                <span className="group-manage-member-label">
                  {label}
                  {isCreator ? <span className="group-manage-badge">{t("groupChat.creatorBadge")}</span> : null}
                </span>
                {!isSelf && !isCreator ? (
                  <button
                    type="button"
                    className="secondary danger"
                    disabled={busy}
                    onClick={() => void handleRemove(ownerId, label)}
                  >
                    {t("groupChat.removeMember")}
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>

        <div className="modal-actions">
          <button type="button" className="secondary danger" disabled={busy} onClick={() => void handleDismiss()}>
            {t("groupChat.dismissGroup")}
          </button>
          <button type="button" className="secondary" disabled={busy} onClick={onClose}>
            {t("common.cancel")}
          </button>
        </div>

        {error ? <p className="modal-error">{error}</p> : null}
      </div>
    </div>
    </ModalPortal>
  );
}
