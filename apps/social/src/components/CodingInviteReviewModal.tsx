/**
 * Minimal direct-bond picker for Coding peer-review invites (Phase 68-C2).
 */
import { useMemo, useState } from "react";
import type { BondRecord } from "@envoymesh/api";
import { useT } from "../context/I18nContext.js";
import { ModalPortal } from "./ModalPortal.js";

export type CodingInviteReviewModalProps = {
  chatId: string;
  chatTitle: string;
  bonds: BondRecord[];
  busy?: boolean;
  error?: string | null;
  onCancel: () => void;
  onInvite: (peerOwnerId: string) => void;
};

export function CodingInviteReviewModal({
  chatId,
  chatTitle,
  bonds,
  busy = false,
  error = null,
  onCancel,
  onInvite,
}: CodingInviteReviewModalProps) {
  const t = useT();
  const [selected, setSelected] = useState<string | null>(null);

  const directBonds = useMemo(
    () =>
      bonds
        .filter((b) => b.level === "direct" && Boolean(b.peerOwnerId))
        .slice()
        .sort((a, b) =>
          (a.displayName ?? a.peerOwnerId).localeCompare(
            b.displayName ?? b.peerOwnerId,
          ),
        ),
    [bonds],
  );

  return (
    <ModalPortal>
      <div
        className="modal-overlay"
        role="presentation"
        data-testid="coding-invite-review-modal"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget && !busy) onCancel();
        }}
      >
        <section
          className="modal-panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby="coding-invite-review-title"
          data-chat-id={chatId}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <header className="modal-header">
            <h2 id="coding-invite-review-title">
              {t("codingView.inviteReviewTitle", "Invite peer to review")}
            </h2>
            <button
              type="button"
              className="modal-close"
              aria-label={t("common.close", "Close")}
              disabled={busy}
              onClick={onCancel}
            >
              ×
            </button>
          </header>
          <p className="section-desc">
            {t(
              "codingView.inviteReviewDesc",
              "Send a chat invite so a bonded friend can open “{title}” in read-only review mode.",
              { title: chatTitle },
            )}
          </p>
          {directBonds.length === 0 ? (
            <p role="status" data-testid="coding-invite-review-empty">
              {t(
                "codingView.inviteReviewNoDirect",
                "No direct-bonded contacts yet. Bond with a friend first.",
              )}
            </p>
          ) : (
            <ul
              className="coding-invite-review-list"
              data-testid="coding-invite-review-list"
            >
              {directBonds.map((bond) => {
                const label =
                  bond.displayName?.trim() || bond.peerOwnerId;
                const active = selected === bond.peerOwnerId;
                return (
                  <li key={bond.peerOwnerId}>
                    <button
                      type="button"
                      className={
                        active
                          ? "coding-invite-review-row active"
                          : "coding-invite-review-row"
                      }
                      data-testid={`coding-invite-peer-${bond.peerOwnerId}`}
                      disabled={busy}
                      onClick={() => setSelected(bond.peerOwnerId)}
                    >
                      {label}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {error ? (
            <p className="coding-sidebar-error" role="alert">
              {error}
            </p>
          ) : null}
          <footer className="modal-actions">
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={onCancel}
            >
              {t("common.cancel", "Cancel")}
            </button>
            <button
              type="button"
              className="primary"
              data-testid="coding-invite-review-confirm"
              disabled={busy || !selected}
              onClick={() => {
                if (selected) onInvite(selected);
              }}
            >
              {busy
                ? t("codingView.inviteReviewSending", "Sending…")
                : t("codingView.inviteReviewSend", "Send invite")}
            </button>
          </footer>
        </section>
      </div>
    </ModalPortal>
  );
}
