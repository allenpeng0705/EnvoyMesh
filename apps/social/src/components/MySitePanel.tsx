/**
 * Phase 45 Step 2–3 — My site: open seeded surfaces, custom sections, author templates.
 */
import { useEffect, useState } from "react";
import type { WebContentSectionSummary } from "@envoymesh/api";
import { useT } from "../context/I18nContext.js";
import { useNodeService } from "../hooks/useNodeService.js";
import {
  openBrowserAt,
  openBrowserAuthor,
  WEB_SECTIONS_CHANGED_EVENT,
  type PendingAuthorTemplate,
} from "../lib/browser-nav.js";
import { webContentUrl, type WebContentSurface } from "../lib/web-content-urls.js";

export type MySiteAuthorTemplate = PendingAuthorTemplate;

export interface MySitePanelProps {
  ownerId: string;
  /** Open a URL in-Browser (preferred when already on Browser). */
  onOpenUrl?: (url: string) => void;
  /**
   * Open author panel with a template. When omitted, dispatches
   * `openBrowserAuthor` so App switches to Browser + author.
   */
  onCreate?: (template: MySiteAuthorTemplate) => void;
  /** Compact for Profile / embedded surfaces. */
  compact?: boolean;
  /**
   * Bump to force a section-list reload (in addition to
   * {@link WEB_SECTIONS_CHANGED_EVENT}).
   */
  sectionsRefreshKey?: number;
}

export function MySitePanel({
  ownerId,
  onOpenUrl,
  onCreate,
  compact = false,
  sectionsRefreshKey = 0,
}: MySitePanelProps) {
  const t = useT();
  const nodeService = useNodeService();
  const [sections, setSections] = useState<WebContentSectionSummary[]>([]);
  const [eventTick, setEventTick] = useState(0);
  const id = ownerId.trim();

  useEffect(() => {
    const onChanged = () => setEventTick((n) => n + 1);
    window.addEventListener(WEB_SECTIONS_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(WEB_SECTIONS_CHANGED_EVENT, onChanged);
  }, []);

  useEffect(() => {
    if (!id || !nodeService.listWebContentSections) return;
    let cancelled = false;
    void nodeService
      .listWebContentSections()
      .then((rows) => {
        if (!cancelled) setSections(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        if (!cancelled) setSections([]);
      });
    return () => {
      cancelled = true;
    };
  }, [id, nodeService, sectionsRefreshKey, eventTick]);

  if (!id) return null;

  const openSurface = (surface: WebContentSurface) => {
    const url = webContentUrl(id, surface);
    if (onOpenUrl) onOpenUrl(url);
    else openBrowserAt(url);
  };

  const openUrl = (url: string) => {
    if (onOpenUrl) onOpenUrl(url);
    else openBrowserAt(url);
  };

  const create = (template: MySiteAuthorTemplate) => {
    if (onCreate) onCreate(template);
    else openBrowserAuthor(template);
  };

  return (
    <section
      className={`my-site-panel${compact ? " my-site-panel--compact" : ""}`}
      data-testid="my-site-panel"
      aria-labelledby="my-site-heading"
    >
      <h3 id="my-site-heading" className="my-site-panel__title">
        {t("browser.mySite.title", "My site")}
      </h3>
      <p className="my-site-panel__intro">
        {t(
          "browser.mySite.intro",
          "Open your published pages, or create / update them without typing a URL.",
        )}
      </p>

      <div className="my-site-panel__group">
        <span className="my-site-panel__label">{t("browser.mySite.openLabel", "Open")}</span>
        <div
          className="my-site-panel__actions my-site-panel__actions--links"
          role="group"
          aria-label={t("browser.mySite.openLabel", "Open")}
        >
          <span className="contact-web-content__link-item">
            <button
              type="button"
              className="contact-web-content__link"
              data-testid="my-site-open-profile"
              onClick={() => openSurface("profile")}
            >
              {t("agentCard.openProfile", "Profile")}
            </button>
          </span>
          <span className="contact-web-content__link-item">
            <span className="contact-web-content__sep" aria-hidden="true">·</span>
            <button
              type="button"
              className="contact-web-content__link"
              data-testid="my-site-open-blog"
              onClick={() => openSurface("blog")}
            >
              {t("agentCard.openBlog", "Blog")}
            </button>
          </span>
          <span className="contact-web-content__link-item">
            <span className="contact-web-content__sep" aria-hidden="true">·</span>
            <button
              type="button"
              className="contact-web-content__link"
              data-testid="my-site-open-photowall"
              onClick={() => openSurface("photowall")}
            >
              {t("agentCard.openPhotoWall", "PhotoWall")}
            </button>
          </span>
          {sections.map((s) => (
            <span key={s.path} className="contact-web-content__link-item">
              <span className="contact-web-content__sep" aria-hidden="true">·</span>
              <button
                type="button"
                className="contact-web-content__link"
                data-testid={`my-site-open-section-${s.slug}`}
                title={s.url}
                onClick={() => openUrl(s.url)}
              >
                {s.title}
              </button>
            </span>
          ))}
        </div>
      </div>

      <div className="my-site-panel__group">
        <span className="my-site-panel__label">{t("browser.mySite.editLabel", "Create / edit")}</span>
        <div
          className="my-site-panel__actions"
          role="group"
          aria-label={t("browser.mySite.editLabel", "Create / edit")}
        >
          <button
            type="button"
            className="contact-web-content__btn contact-web-content__btn--primary"
            data-testid="my-site-edit-profile"
            onClick={() => create("profile")}
          >
            {t("browser.mySite.editProfile", "Edit Profile")}
          </button>
          <button
            type="button"
            className="contact-web-content__btn contact-web-content__btn--primary"
            data-testid="my-site-new-post"
            onClick={() => create("blog-post")}
          >
            {t("browser.mySite.newPost", "New Blog Post")}
          </button>
          <button
            type="button"
            className="contact-web-content__btn contact-web-content__btn--primary"
            data-testid="my-site-add-photo"
            onClick={() => create("photo")}
          >
            {t("browser.mySite.addPhoto", "Add Photo")}
          </button>
          <button
            type="button"
            className="contact-web-content__btn contact-web-content__btn--primary"
            data-testid="my-site-add-section"
            onClick={() => create("section")}
          >
            {t("browser.mySite.addSection", "Add section")}
          </button>
        </div>
      </div>
    </section>
  );
}
