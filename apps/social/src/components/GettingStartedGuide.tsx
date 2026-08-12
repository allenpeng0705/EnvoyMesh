/**
 * First-run getting-started guide.
 *
 * Single scrollable modal panel surfacing the key things a brand-new owner
 * needs to know after setup. Auto-opens once per owner (gated by
 * `hasSeenGettingStartedGuide`); re-openable from the Header Help button.
 *
 * Rendered through ModalPortal so it isn't clipped by sidebar scroll
 * containers (same pattern as ConfirmDialog). Closes via Done, the close
 * affordance, overlay click, or Esc.
 */
import { useEffect, useRef } from "react";
import { useT } from "../context/I18nContext.js";
import { ModalPortal } from "./ModalPortal.js";
import {
  CloseIcon,
  SearchIcon,
  AIIcon,
  ChatIcon,
  BridgeIcon,
  PluginIcon,
  P2PIcon,
  PrivateIcon,
  PublicIcon,
  InfoIcon,
  SettingsIcon,
} from "../icons.js";
import type { ViewName } from "../App.js";
import type { SettingsTabId } from "./views/SettingsView.js";

/** Destinations the guide CTAs can open (richer than ViewName alone). */
export type GuideDestination =
  | { kind: "view"; view: ViewName }
  | { kind: "assistant" }
  | { kind: "terminals" }
  | { kind: "content" }
  | { kind: "settings"; tab: SettingsTabId };

interface GettingStartedGuideProps {
  onClose: () => void;
  /** Navigate the host app when a "try it" button is clicked. */
  onNavigate?: (dest: GuideDestination) => void;
}

export function GettingStartedGuide({ onClose, onNavigate }: GettingStartedGuideProps) {
  const t = useT();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    panel.focus();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    panel.addEventListener("keydown", handleKeyDown);
    return () => panel.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  const go = (dest: GuideDestination) => {
    onNavigate?.(dest);
    onClose();
  };

  return (
    <ModalPortal>
      <div className="modal-overlay" role="presentation" onClick={handleOverlayClick}>
        <div
          ref={panelRef}
          className="modal-panel getting-started-guide"
          role="dialog"
          aria-modal="true"
          aria-labelledby="getting-started-title"
          tabIndex={-1}
          onClick={(e) => e.stopPropagation()}
        >
          <header className="getting-started-guide__header">
            <h2 id="getting-started-title">{t("guide.title")}</h2>
            <button
              type="button"
              className="icon-btn getting-started-guide__close"
              onClick={onClose}
              aria-label={t("common.close")}
              title={t("common.close")}
            >
              <CloseIcon size={18} />
            </button>
          </header>

          <p className="getting-started-guide__lede">{t("guide.lede")}</p>

          <div className="getting-started-guide__sections">
            <GuideSection
              icon={<SearchIcon size={22} />}
              title={t("guide.discover.title")}
              body={t("guide.discover.body")}
              actionLabel={t("guide.discover.cta")}
              onAction={() => go({ kind: "view", view: "discover" })}
            />
            <GuideSection
              icon={<ChatIcon size={22} />}
              title={t("guide.chat.title")}
              body={t("guide.chat.body")}
              actionLabel={t("guide.chat.cta")}
              onAction={() => go({ kind: "view", view: "chat" })}
            />
            <GuideSection
              icon={<AIIcon size={22} />}
              title={t("guide.envoyai.title")}
              body={t("guide.envoyai.body")}
              actionLabel={t("guide.envoyai.cta")}
              onAction={() => go({ kind: "assistant" })}
            />
            <GuideSection
              icon={<BridgeIcon size={22} />}
              title={t("guide.extagent.title")}
              body={t("guide.extagent.body")}
              actionLabel={t("guide.extagent.cta")}
              onAction={() => go({ kind: "settings", tab: "ai" })}
            />
            <GuideSection
              icon={<SettingsIcon size={22} />}
              title={t("guide.terminals.title")}
              body={t("guide.terminals.body")}
              actionLabel={t("guide.terminals.cta")}
              onAction={() => go({ kind: "terminals" })}
            />
            <GuideSection
              icon={<PluginIcon size={22} />}
              title={t("guide.pi.title")}
              body={t("guide.pi.body")}
              actionLabel={t("guide.pi.cta")}
              onAction={() => go({ kind: "terminals" })}
            />
            <GuideSection
              icon={<P2PIcon size={22} />}
              title={t("guide.chains.title")}
              body={t("guide.chains.body")}
              actionLabel={t("guide.chains.cta")}
              onAction={() => go({ kind: "view", view: "chains" })}
            />
            <GuideSection
              icon={<PrivateIcon size={22} />}
              title={t("guide.family.title")}
              body={t("guide.family.body")}
              actionLabel={t("guide.family.cta")}
              onAction={() => go({ kind: "settings", tab: "family" })}
            />
            <GuideSection
              icon={<PublicIcon size={22} />}
              title={t("guide.content.title")}
              body={t("guide.content.body")}
              actionLabel={t("guide.content.cta")}
              onAction={() => go({ kind: "content" })}
            />
            <GuideSection
              icon={<InfoIcon size={22} />}
              title={t("guide.privacy.title")}
              body={t("guide.privacy.body")}
            />
          </div>

          <footer className="getting-started-guide__footer">
            <p className="getting-started-guide__hint">{t("guide.reopenHint")}</p>
            <button type="button" className="primary" onClick={onClose}>
              {t("guide.done")}
            </button>
          </footer>
        </div>
      </div>
    </ModalPortal>
  );
}

function GuideSection({
  icon,
  title,
  body,
  actionLabel,
  onAction,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <section className="guide-section">
      <div className="guide-section__icon" aria-hidden>
        {icon}
      </div>
      <div className="guide-section__body">
        <h3 className="guide-section__title">{title}</h3>
        <p className="guide-section__text">{body}</p>
        {actionLabel && onAction ? (
          <button type="button" className="btn-secondary btn-small guide-section__cta" onClick={onAction}>
            {actionLabel}
          </button>
        ) : null}
      </div>
    </section>
  );
}
