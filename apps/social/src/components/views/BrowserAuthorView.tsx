/**
 * Phase 45D — Browser authoring panel (templates + Publish).
 *
 * Design: docs/web-content-browsing-design.md §4.8, §9.2.
 */
import { useState } from "react";
import type {
  BondRecord,
  PublishWebContentParams,
  PublishWebContentResult,
  PublishWebContentTemplate,
  PublishWebContentVisibility,
} from "@envoymesh/api";
import { useT } from "../../context/I18nContext.js";
import { useNodeState } from "../../context/NodeStateContext.js";
import { useNodeService } from "../../hooks/useNodeService.js";
import { contactLabel } from "../../lib/display.js";
import { MarkdownEditor } from "../MarkdownEditor.js";
import { VisibilitySelector } from "../VisibilitySelector.js";

export type AuthorTemplate = PublishWebContentTemplate;

export interface BrowserAuthorViewProps {
  onPublished?: (result: PublishWebContentResult) => void;
  onCancel?: () => void;
  initialTemplate?: AuthorTemplate;
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Failed to read file"));
        return;
      }
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

function eligibleBonds(bonds: BondRecord[]): BondRecord[] {
  return bonds.filter((b) => b.level !== "blocked" && Boolean(b.peerOwnerId));
}

export function BrowserAuthorView({
  onPublished,
  onCancel,
  initialTemplate,
}: BrowserAuthorViewProps) {
  const t = useT();
  const nodeService = useNodeService();
  const { bonds } = useNodeState();
  const [template, setTemplate] = useState<AuthorTemplate | null>(initialTemplate ?? null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [gallery, setGallery] = useState("wall");
  const [visibility, setVisibility] = useState<PublishWebContentVisibility>("bonded");
  const [contactIds, setContactIds] = useState<string[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [published, setPublished] = useState<PublishWebContentResult | null>(null);

  const selectableBonds = eligibleBonds(bonds);
  const isBinary = template === "photo" || template === "file";
  const contactsOk = visibility !== "contacts" || contactIds.length > 0;
  const canPublish =
    title.trim().length > 0 &&
    !busy &&
    template != null &&
    contactsOk &&
    (!isBinary || file != null);

  function handleVisibilityChange(next: PublishWebContentVisibility) {
    setVisibility(next);
    if (next !== "contacts") {
      setContactIds([]);
    }
  }

  function toggleContact(ownerId: string) {
    setContactIds((prev) =>
      prev.includes(ownerId) ? prev.filter((id) => id !== ownerId) : [...prev, ownerId],
    );
  }

  async function handlePublish() {
    if (!template || !canPublish) return;
    setBusy(true);
    setError(null);
    try {
      const params: PublishWebContentParams = {
        template,
        title: title.trim(),
        visibility,
      };
      if (visibility === "contacts") {
        params.contactIds = [...contactIds];
      }
      if (template === "blog-post" || template === "note" || template === "profile") {
        params.body = body;
      } else if (file) {
        params.contentBase64 = await readFileAsBase64(file);
        params.mimeType = file.type || (template === "photo" ? "image/png" : "application/octet-stream");
        params.fileName = file.name;
        if (template === "photo") {
          params.gallery = gallery.trim() || "wall";
        }
      }
      const result = await nodeService.publishWebContentEntry(params);
      setPublished(result);
      onPublished?.(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function resetForm() {
    setPublished(null);
    setTemplate(null);
    setTitle("");
    setBody("");
    setGallery("wall");
    setVisibility("bonded");
    setContactIds([]);
    setFile(null);
  }

  if (published) {
    return (
      <div className="browser-author" data-testid="browser-author-published">
        <h3>{t("browser.author.publishedTitle", "Published")}</h3>
        <p data-testid="browser-author-published-url">{published.url}</p>
        {published.listingUrl ? (
          <p data-testid="browser-author-listing-url">{published.listingUrl}</p>
        ) : null}
        <div className="browser-author__actions">
          <button
            type="button"
            className="btn btn-primary"
            data-testid="browser-author-done"
            onClick={() => {
              resetForm();
              onCancel?.();
            }}
          >
            {t("browser.author.done", "Done")}
          </button>
        </div>
      </div>
    );
  }

  if (!template) {
    return (
      <div className="browser-author" data-testid="browser-author-picker">
        <h3>{t("browser.author.newItem", "New item")}</h3>
        <p className="field-desc">
          {t("browser.author.pickerHint", "Choose a template to publish to your mesh site.")}
        </p>
        <div className="browser-author__templates">
          <button
            type="button"
            className="btn btn-primary"
            data-testid="browser-author-template-blog-post"
            onClick={() => setTemplate("blog-post")}
          >
            {t("browser.author.newBlogPost", "New Blog Post")}
          </button>
          <button
            type="button"
            className="btn"
            data-testid="browser-author-template-note"
            onClick={() => setTemplate("note")}
          >
            {t("browser.author.newNote", "New Note")}
          </button>
          <button
            type="button"
            className="btn"
            data-testid="browser-author-template-profile"
            onClick={() => setTemplate("profile")}
          >
            {t("browser.author.newProfile", "Profile page")}
          </button>
          <button
            type="button"
            className="btn"
            data-testid="browser-author-template-photo"
            onClick={() => setTemplate("photo")}
          >
            {t("browser.author.newPhoto", "Photo")}
          </button>
          <button
            type="button"
            className="btn"
            data-testid="browser-author-template-file"
            onClick={() => setTemplate("file")}
          >
            {t("browser.author.newFile", "File upload")}
          </button>
        </div>
        {onCancel ? (
          <button type="button" className="btn" onClick={onCancel} data-testid="browser-author-cancel">
            {t("browser.author.cancel", "Cancel")}
          </button>
        ) : null}
      </div>
    );
  }

  const heading =
    template === "blog-post"
      ? t("browser.author.newBlogPost", "New Blog Post")
      : template === "note"
        ? t("browser.author.newNote", "New Note")
        : template === "profile"
          ? t("browser.author.newProfile", "Profile page")
          : template === "photo"
            ? t("browser.author.newPhoto", "Photo")
            : t("browser.author.newFile", "File upload");

  return (
    <div className="browser-author" data-testid="browser-author-form">
      <h3>{heading}</h3>

      <label className="field-label" htmlFor="browser-author-title">
        {t("browser.author.title", "Title")}
      </label>
      <input
        id="browser-author-title"
        className="browser-author__title"
        data-testid="browser-author-title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        disabled={busy}
        placeholder={
          template === "photo"
            ? t("browser.author.photoTitlePlaceholder", "Sunset")
            : t("browser.author.titlePlaceholder", "My First Post")
        }
      />

      {template === "photo" ? (
        <>
          <label className="field-label" htmlFor="browser-author-gallery">
            {t("browser.author.gallery", "Gallery")}
          </label>
          <input
            id="browser-author-gallery"
            className="browser-author__title"
            data-testid="browser-author-gallery"
            value={gallery}
            onChange={(e) => setGallery(e.target.value)}
            disabled={busy}
            placeholder="wall"
          />
        </>
      ) : null}

      {isBinary ? (
        <>
          <label className="field-label" htmlFor="browser-author-file">
            {t("browser.author.file", "File")}
          </label>
          <input
            id="browser-author-file"
            type="file"
            data-testid="browser-author-file"
            accept={template === "photo" ? "image/*" : undefined}
            disabled={busy}
            onChange={(e) => {
              const next = e.target.files?.[0] ?? null;
              setFile(next);
              if (next && !title.trim()) {
                setTitle(next.name.replace(/\.[^.]+$/, "") || next.name);
              }
            }}
          />
          {file ? (
            <p className="field-desc" data-testid="browser-author-file-name">
              {file.name} ({Math.round(file.size / 1024)} KiB)
            </p>
          ) : null}
        </>
      ) : (
        <>
          <label className="field-label" htmlFor="browser-author-body">
            {t("browser.author.body", "Body")}
          </label>
          <MarkdownEditor
            value={body}
            onChange={setBody}
            disabled={busy}
            placeholder={t(
              "browser.author.bodyPlaceholder",
              "Hello world! This is my first post on my EnvoyMesh blog.",
            )}
          />
        </>
      )}

      <label className="field-label" htmlFor="web-content-visibility">
        {t("browser.author.visibility", "Visibility")}
      </label>
      <VisibilitySelector value={visibility} onChange={handleVisibilityChange} disabled={busy} />

      {visibility === "contacts" ? (
        <fieldset
          className="browser-author__contacts"
          data-testid="browser-author-contacts"
          disabled={busy}
        >
          <legend className="field-label">
            {t("browser.author.contactsLabel", "Selected contacts")}
          </legend>
          <p className="field-desc">
            {t(
              "browser.author.contactsHint",
              "Only these bonded contacts can open this item. At least one is required.",
            )}
          </p>
          {selectableBonds.length === 0 ? (
            <p className="field-desc" data-testid="browser-author-contacts-empty">
              {t(
                "browser.author.contactsEmpty",
                "No bonded contacts yet — add a contact first, or choose Bonded/Public.",
              )}
            </p>
          ) : (
            <ul className="browser-author__contact-list">
              {selectableBonds.map((bond) => {
                const id = `browser-author-contact-${bond.peerOwnerId}`;
                const checked = contactIds.includes(bond.peerOwnerId);
                return (
                  <li key={bond.peerOwnerId}>
                    <label className="browser-author__contact-row" htmlFor={id}>
                      <input
                        id={id}
                        type="checkbox"
                        data-testid="browser-author-contact-checkbox"
                        data-owner-id={bond.peerOwnerId}
                        checked={checked}
                        disabled={busy}
                        onChange={() => toggleContact(bond.peerOwnerId)}
                      />
                      <span>{contactLabel(bond)}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </fieldset>
      ) : null}

      {error ? (
        <p className="browser-author__error" data-testid="browser-author-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="browser-author__actions">
        <button
          type="button"
          className="btn"
          disabled={busy}
          onClick={() => {
            if (initialTemplate) {
              onCancel?.();
            } else {
              setTemplate(null);
              setFile(null);
              setContactIds([]);
            }
          }}
          data-testid="browser-author-back"
        >
          {t("browser.author.back", "Back")}
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!canPublish}
          onClick={() => void handlePublish()}
          data-testid="browser-author-publish"
        >
          {busy
            ? t("browser.author.publishing", "Publishing…")
            : t("browser.author.publish", "Publish")}
        </button>
      </div>
    </div>
  );
}
