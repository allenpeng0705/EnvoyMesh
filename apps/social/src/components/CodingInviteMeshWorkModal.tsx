/**
 * FH-P2-C — bonded peer picker + prompt for mesh Coding work invites.
 */
import { useMemo, useState } from "react"
import type { BondRecord } from "@envoymesh/api"
import { useT } from "../context/I18nContext.js"
import { ModalPortal } from "./ModalPortal.js"

export type CodingInviteMeshWorkModalProps = {
  cwd: string
  chatId?: string
  chatTitle: string
  defaultPrompt?: string
  bonds: BondRecord[]
  busy?: boolean
  error?: string | null
  onCancel: () => void
  onInvite: (peerOwnerId: string, prompt: string) => void
}

export function CodingInviteMeshWorkModal({
  cwd,
  chatId,
  chatTitle,
  defaultPrompt = "",
  bonds,
  busy = false,
  error = null,
  onCancel,
  onInvite,
}: CodingInviteMeshWorkModalProps) {
  const t = useT()
  const [selected, setSelected] = useState<string | null>(null)
  const [prompt, setPrompt] = useState(defaultPrompt)

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
  )

  const canSend =
    selected !== null && prompt.trim().length > 0 && cwd.trim().length > 0

  return (
    <ModalPortal>
      <div
        className="modal-overlay"
        role="presentation"
        data-testid="coding-invite-mesh-work-modal"
        data-chat-id={chatId ?? ""}
        onMouseDown={(e) => {
          if (e.target === e.currentTarget && !busy) onCancel()
        }}
      >
        <section
          className="modal-panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby="coding-invite-mesh-work-title"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <header className="modal-header">
            <h2 id="coding-invite-mesh-work-title">
              {t(
                "codingView.inviteMeshWorkTitle",
                "Send Coding work to a friend",
              )}
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
              "codingView.inviteMeshWorkDesc",
              "Your bonded friend can run this prompt in Coding on their home node. Task: “{title}”.",
              { title: chatTitle },
            )}
          </p>
          <label className="coding-invite-mesh-work-prompt">
            <span>{t("codingView.inviteMeshWorkPrompt", "Work prompt")}</span>
            <textarea
              rows={4}
              value={prompt}
              disabled={busy}
              data-testid="coding-invite-mesh-work-prompt"
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={t(
                "codingView.inviteMeshWorkPromptPh",
                "What should the agent do?",
              )}
            />
          </label>
          {directBonds.length === 0 ? (
            <p role="status" data-testid="coding-invite-mesh-work-empty">
              {t(
                "codingView.inviteMeshWorkNoDirect",
                "No direct-bonded contacts yet. Bond with a friend first.",
              )}
            </p>
          ) : (
            <ul
              className="coding-invite-review-list"
              data-testid="coding-invite-mesh-work-list"
            >
              {directBonds.map((bond) => {
                const label =
                  bond.displayName?.trim() || bond.peerOwnerId
                const active = selected === bond.peerOwnerId
                return (
                  <li key={bond.peerOwnerId}>
                    <button
                      type="button"
                      className={
                        active
                          ? "coding-invite-review-row active"
                          : "coding-invite-review-row"
                      }
                      disabled={busy}
                      onClick={() => setSelected(bond.peerOwnerId)}
                    >
                      {label}
                    </button>
                  </li>
                )
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
              data-testid="coding-invite-mesh-work-confirm"
              disabled={busy || !canSend}
              onClick={() => {
                if (selected && canSend) onInvite(selected, prompt.trim())
              }}
            >
              {busy
                ? t("codingView.inviteMeshWorkSending", "Sending…")
                : t("codingView.inviteMeshWorkSend", "Send invite")}
            </button>
          </footer>
        </section>
      </div>
    </ModalPortal>
  )
}