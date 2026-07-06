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
  ContactsIcon,
  SettingsIcon,
  InfoIcon,
} from "../icons.js";
import type { ViewName } from "../App.js";

interface GettingStartedGuideProps {
  onClose: () => void;
  /** Navigate the host app to a view when a "try it" button is clicked. */
  onNavigate?: (view: ViewName) => void;
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

  const go = (view: ViewName) => {
    onNavigate?.(view);
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
              onAction={() => go("discover")}
            />
            <GuideSection
              icon={<ChatIcon size={22} />}
              title={t("guide.chat.title")}
              body={t("guide.chat.body")}
              actionLabel={t("guide.chat.cta")}
              onAction={() => go("chat")}
            />
            <GuideSection
              icon={<AIIcon size={22} />}
              title={t("guide.agent.title")}
              body={t("guide.agent.body")}
              actionLabel={t("guide.agent.cta")}
              onAction={() => go("chat")}
            />
            <GuideSection
              icon={<ContactsIcon size={22} />}
              title={t("guide.contacts.title")}
              body={t("guide.contacts.body")}
              actionLabel={t("guide.contacts.cta")}
              onAction={() => go("chat")}
            />
            <GuideSection
              icon={<SettingsIcon size={22} />}
              title={t("guide.settings.title")}
              body={t("guide.settings.body")}
              actionLabel={t("guide.settings.cta")}
              onAction={() => go("settings")}
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
