/**
 * Phase 45D — Browser authoring panel (templates + Publish).
 *
 * Design: docs/web-content-browsing-design.md §4.8, §9.2.
 */
import { useState, useEffect, useRef } from "react";
import { buildProfilePortalHtml, MAX_PROFILE_GALLERY_PHOTOS, MAX_PROFILE_THUMBNAIL_BYTES, MAX_PROFILE_GALLERY_PHOTO_BYTES } from "@envoymesh/api";
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
import { blobToBase64, fitImageFileToMaxBytes } from "../../lib/fit-image.js";
import { MarkdownEditor } from "../MarkdownEditor.js";
import { VisibilitySelector } from "../VisibilitySelector.js";
import { AuthorAiDraftField, applyAuthorDraft } from "../AuthorAiDraftField.js";

export type AuthorTemplate = PublishWebContentTemplate;

export interface BrowserAuthorViewProps {
  onPublished?: (result: PublishWebContentResult) => void;
  onCancel?: () => void;
  initialTemplate?: AuthorTemplate;
}

function base64ToBlob(contentBase64: string, mimeType: string): Blob {
  const byteString = atob(contentBase64);
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }
  return new Blob([ab], { type: mimeType });
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("file_read_failed"));
        return;
      }
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error("file_read_failed"));
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
  const nodeServiceRef = useRef(nodeService);
  nodeServiceRef.current = nodeService;
  const { bonds, humanProfile } = useNodeState();
  const [template, setTemplate] = useState<AuthorTemplate | null>(initialTemplate ?? null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [gallery, setGallery] = useState("wall");
  const [sectionSlug, setSectionSlug] = useState("");
  const [advertiseTopic, setAdvertiseTopic] = useState(true);
  const [visibility, setVisibility] = useState<PublishWebContentVisibility>(
    template === "profile" ? "public" : "bonded",
  );
  const [contactIds, setContactIds] = useState<string[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [published, setPublished] = useState<PublishWebContentResult | null>(null);
  const [profileAvatar, setProfileAvatar] = useState<File | null>(null);
  /** Newly picked gallery files (not yet on the profile). */
  const [profilePhotos, setProfilePhotos] = useState<File[]>([]);
  /** Existing gallery photos loaded from the vault for edit preview. */
  const [existingGalleryPhotos, setExistingGalleryPhotos] = useState<
    Array<{ photoId: string; vaultRelativePath: string; previewUrl: string; label?: string }>
  >([]);
  const [removedGalleryPaths, setRemovedGalleryPaths] = useState<string[]>([]);
  const [profileDisplayName, setProfileDisplayName] = useState(humanProfile?.displayName ?? "");
  const [profileBio, setProfileBio] = useState(humanProfile?.bio ?? "");

  const galleryFingerprint = (humanProfile?.galleryPhotos ?? [])
    .map((p) => `${p.photoId}:${p.contentSha256}`)
    .join("|");
  const thumbnailKey = humanProfile?.publicThumbnail
    ? `${humanProfile.publicThumbnail.vaultRelativePath}:${humanProfile.publicThumbnail.contentSha256}`
    : "";

  useEffect(() => {
    if (humanProfile && template === "profile") {
      setProfileDisplayName(humanProfile.displayName ?? "");
      setTitle(humanProfile.username ?? "");
      setProfileBio(humanProfile.bio ?? "");
    }
  }, [humanProfile, template]);

  useEffect(() => {
    if (template !== "profile" || !humanProfile?.publicThumbnail) {
      return;
    }
    const thumbnail = humanProfile.publicThumbnail;
    let cancelled = false;
    void nodeServiceRef.current
      .readLibraryItemContent({
        relativePath: thumbnail.vaultRelativePath,
        maxBytes: MAX_PROFILE_THUMBNAIL_BYTES,
      })
      .then((result) => {
        if (cancelled) return;
        const blob = base64ToBlob(result.contentBase64, result.mimeType);
        const fileName = thumbnail.vaultRelativePath.split("/").pop() ?? "thumbnail";
        setProfileAvatar(new File([blob], fileName, { type: result.mimeType }));
      })
      .catch(() => {
        if (!cancelled) setProfileAvatar(null);
      });
    return () => {
      cancelled = true;
    };
  }, [template, thumbnailKey, humanProfile?.publicThumbnail]);

  useEffect(() => {
    if (template !== "profile") {
      setExistingGalleryPhotos((prev) => {
        for (const p of prev) URL.revokeObjectURL(p.previewUrl);
        return prev.length === 0 ? prev : [];
      });
      setRemovedGalleryPaths((prev) => (prev.length === 0 ? prev : []));
      setProfilePhotos((prev) => (prev.length === 0 ? prev : []));
      return;
    }
    const gallery = humanProfile?.galleryPhotos ?? [];
    let cancelled = false;
    const createdUrls: string[] = [];
    setRemovedGalleryPaths([]);
    setProfilePhotos([]);
    void (async () => {
      const loaded: Array<{
        photoId: string;
        vaultRelativePath: string;
        previewUrl: string;
        label?: string;
      }> = [];
      for (const photo of gallery) {
        try {
          const result = await nodeServiceRef.current.readLibraryItemContent({
            relativePath: photo.vaultRelativePath,
            maxBytes: MAX_PROFILE_GALLERY_PHOTO_BYTES,
          });
          const previewUrl = URL.createObjectURL(
            base64ToBlob(result.contentBase64, result.mimeType),
          );
          if (cancelled) {
            URL.revokeObjectURL(previewUrl);
            return;
          }
          createdUrls.push(previewUrl);
          loaded.push({
            photoId: photo.photoId,
            vaultRelativePath: photo.vaultRelativePath,
            previewUrl,
            label: photo.label,
          });
        } catch {
          /* skip unreadables */
        }
      }
      if (!cancelled) setExistingGalleryPhotos(loaded);
    })();
    return () => {
      cancelled = true;
      for (const url of createdUrls) URL.revokeObjectURL(url);
    };
  }, [template, galleryFingerprint, humanProfile?.galleryPhotos]);

  const selectableBonds = eligibleBonds(bonds);
  const isBinary = template === "photo" || template === "file";
  const isArticle =
    template === "blog-post" ||
    template === "note" ||
    template === "profile" ||
    template === "section";
  const contactsOk = visibility !== "contacts" || contactIds.length > 0;
  const canPublish =
    title.trim().length > 0 &&
    !busy &&
    template != null &&
    contactsOk &&
    (!isBinary || file != null);

  function handleVisibilityChange(next: PublishWebContentVisibility) {
    if (template === "profile") return;
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
      if (template === "profile") {
        if (profileAvatar) {
          const fitted = await fitImageFileToMaxBytes(
            profileAvatar,
            MAX_PROFILE_THUMBNAIL_BYTES,
            profileAvatar.type,
          );
          await nodeService.setPublicProfileThumbnail({
            contentBase64: await blobToBase64(fitted.blob),
            mimeType: fitted.mimeType as "image/jpeg" | "image/png" | "image/webp",
          });
        }
        for (const path of removedGalleryPaths) {
          await nodeService.removeProfileGalleryPhoto({ vaultRelativePath: path });
        }
        for (const photo of profilePhotos) {
          const fitted = await fitImageFileToMaxBytes(
            photo,
            MAX_PROFILE_GALLERY_PHOTO_BYTES,
            photo.type,
          );
          await nodeService.upsertProfileGalleryPhoto({
            contentBase64: await blobToBase64(fitted.blob),
            mimeType: fitted.mimeType as "image/jpeg" | "image/png" | "image/webp",
            visibility: "public",
            label: photo.name,
          });
        }
        await nodeService.updateHumanProfile({
          displayName: profileDisplayName.trim() || title.trim(),
          username: title.trim(),
          bio: profileBio,
        });
        void nodeService.syncProfileToBonds().catch((err) => {
          console.warn("[profile.sync] broadcast to bonds failed:", err);
        });
        const refreshed = await nodeService.getHumanProfile();
        const ownerId = refreshed?.ownerId ?? humanProfile?.ownerId ?? "";
        const photos = (refreshed?.galleryPhotos ?? []).map((p) => {
          const ext =
            p.mimeType === "image/png" ? "png" : p.mimeType === "image/webp" ? "webp" : "jpg";
          return {
            title: p.label?.trim() || p.photoId,
            url: `envoy://${ownerId}/photos/wall/gallery-${p.photoId}.${ext}`,
          };
        });
        const avatarExt =
          refreshed?.publicThumbnail?.mimeType === "image/png"
            ? "png"
            : refreshed?.publicThumbnail?.mimeType === "image/webp"
              ? "webp"
              : refreshed?.publicThumbnail
                ? "jpg"
                : undefined;
        const profileBody = buildProfilePortalHtml({
          displayName: profileDisplayName.trim() || title.trim(),
          username: title.trim(),
          bio: profileBio,
          hobbies: refreshed?.hobbies ?? humanProfile?.hobbies ?? [],
          knowledge: refreshed?.knowledge ?? humanProfile?.knowledge ?? [],
          capabilities: refreshed?.capabilities ?? humanProfile?.capabilities ?? [],
          ownerId,
          avatarUrl: avatarExt ? `envoy://${ownerId}/avatar.${avatarExt}` : undefined,
          photos,
        });
        const result = await nodeService.publishWebContentEntry({
          template: "profile",
          title: title.trim(),
          visibility: "public",
          body: profileBody,
        });
        setPublished(result);
        onPublished?.(result);
      } else {
        const params: PublishWebContentParams = {
          template,
          title: title.trim(),
          visibility,
        };
        if (visibility === "contacts") {
          params.contactIds = [...contactIds];
        }
        if (template === "blog-post" || template === "note" || template === "section") {
          params.body = body;
        }
        if (template === "photo" && body.trim()) {
          params.body = body.trim();
        }
        if (template === "section") {
          if (sectionSlug.trim()) params.sectionSlug = sectionSlug.trim();
          params.advertiseTopic = advertiseTopic;
        } else if (file) {
          if (template === "photo") {
            const fitted = await fitImageFileToMaxBytes(file, 2 * 1024 * 1024, file.type);
            params.contentBase64 = await blobToBase64(fitted.blob);
            params.mimeType = fitted.mimeType;
            params.fileName = file.name.replace(/\.[^.]+$/, "") + (fitted.mimeType === "image/png" ? ".png" : fitted.mimeType === "image/webp" ? ".webp" : ".jpg");
            params.gallery = gallery.trim() || "wall";
          } else {
            params.contentBase64 = await readFileAsBase64(file);
            params.mimeType = file.type || "application/octet-stream";
            params.fileName = file.name;
          }
        }
        const result = await nodeService.publishWebContentEntry(params);
        setPublished(result);
        onPublished?.(result);
      }
    } catch (e) {
      if (e instanceof Error && e.message === "file_read_failed") {
        setError(t("browser.author.fileReadFailed", "Failed to read file"));
      } else {
        setError(e instanceof Error ? e.message : String(e));
      }
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
    setSectionSlug("");
    setAdvertiseTopic(true);
    setVisibility("bonded");
    setContactIds([]);
    setFile(null);
    setProfileAvatar(null);
    setProfilePhotos([]);
    setProfileDisplayName("");
    setProfileBio("");
  }

  if (published) {
    return (
      <div className="browser-author browser-author__success" data-testid="browser-author-published">
        <div className="browser-author__success-icon" aria-hidden="true">
          <AuthorIconCheck />
        </div>
        <h3>{t("browser.author.publishedTitle", "Published")}</h3>
        <p className="browser-author__success-url" data-testid="browser-author-published-url">
          {published.url}
        </p>
        {published.listingUrl ? (
          <p className="browser-author__success-listing" data-testid="browser-author-listing-url">
            {published.listingUrl}
          </p>
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
          {t(
            "browser.author.pickerHint",
            "Choose a template. Profile and Photos are under your avatar (top right).",
          )}
        </p>
        <div className="browser-author__templates">
          <button
            type="button"
            className="browser-author__template-card"
            data-testid="browser-author-template-blog-post"
            onClick={() => setTemplate("blog-post")}
          >
            <span className="browser-author__template-icon" aria-hidden="true">
              <AuthorIconArticle />
            </span>
            <span className="browser-author__template-name">
              {t("browser.author.newBlogPost", "New Blog Post")}
            </span>
          </button>
          <button
            type="button"
            className="browser-author__template-card"
            data-testid="browser-author-template-note"
            onClick={() => setTemplate("note")}
          >
            <span className="browser-author__template-icon" aria-hidden="true">
              <AuthorIconNote />
            </span>
            <span className="browser-author__template-name">
              {t("browser.author.newNote", "New Note")}
            </span>
          </button>
          <button
            type="button"
            className="browser-author__template-card"
            data-testid="browser-author-template-file"
            onClick={() => setTemplate("file")}
          >
            <span className="browser-author__template-icon" aria-hidden="true">
              <AuthorIconFile />
            </span>
            <span className="browser-author__template-name">
              {t("browser.author.newFile", "File upload")}
            </span>
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
            : template === "section"
              ? t("browser.author.newSection", "Custom section")
              : t("browser.author.newFile", "File upload");

  const isProfile = template === "profile";

  if (isProfile) {
    return (
      <div className="browser-author browser-author--profile" data-testid="browser-author-form">
        <header className="browser-author__header">
          <h3>{heading}</h3>
          <p className="browser-author__lede">
            {t(
              "browser.author.profileLede",
              "Create your profile page to share who you are with the mesh.",
            )}
          </p>
        </header>

        <div className="browser-author__profile-card">
          <div className="browser-author__profile-avatar">
            <input
              id="browser-author-profile-avatar"
              type="file"
              className="browser-author__profile-avatar-input"
              accept="image/*"
              disabled={busy}
              onChange={(e) => {
                const next = e.target.files?.[0] ?? null;
                setProfileAvatar(next);
              }}
            />
            <label htmlFor="browser-author-profile-avatar" className="browser-author__profile-avatar-placeholder">
              {profileAvatar ? (
                <img
                  src={URL.createObjectURL(profileAvatar)}
                  alt={t("browser.author.profileAvatarAlt", "Profile avatar")}
                />
              ) : (
                <AuthorIconProfilePlaceholder />
              )}
              <span className="browser-author__profile-avatar-overlay">
                <AuthorIconCamera />
              </span>
            </label>
            {profileAvatar && (
              <button
                type="button"
                className="browser-author__profile-avatar-remove"
                onClick={() => setProfileAvatar(null)}
                disabled={busy}
                aria-label={t("browser.author.removeAvatar", "Remove avatar")}
              >
                <AuthorIconX />
              </button>
            )}
          </div>

          <div className="browser-author__profile-photos">
            <label className="field-label browser-author__profile-photos-label">
              {t("browser.author.profilePhotos", "Photos")}
              <span className="field-desc">
                {t(
                  "browser.author.profilePhotosHint",
                  `Add up to ${MAX_PROFILE_GALLERY_PHOTOS} photos to showcase your profile (also appears on PhotoWall)`,
                )}
              </span>
            </label>
            <div className="browser-author__profile-photos-grid">
              {existingGalleryPhotos.map((photo) => (
                <div
                  key={photo.photoId}
                  className="browser-author__profile-photo-item"
                  data-testid="browser-author-existing-photo"
                >
                  <img
                    src={photo.previewUrl}
                    alt={photo.label ?? t("browser.author.profilePhotoAlt", "Profile photo")}
                    className="browser-author__profile-photo-img"
                  />
                  <button
                    type="button"
                    className="browser-author__profile-photo-remove"
                    onClick={() => {
                      URL.revokeObjectURL(photo.previewUrl);
                      setExistingGalleryPhotos((prev) =>
                        prev.filter((p) => p.photoId !== photo.photoId),
                      );
                      setRemovedGalleryPaths((prev) =>
                        prev.includes(photo.vaultRelativePath)
                          ? prev
                          : [...prev, photo.vaultRelativePath],
                      );
                    }}
                    disabled={busy}
                    aria-label={t("browser.author.removePhoto", "Remove photo")}
                  >
                    <AuthorIconX />
                  </button>
                </div>
              ))}
              {profilePhotos.map((photo, index) => (
                <div key={`new-${index}-${photo.name}`} className="browser-author__profile-photo-item">
                  <img
                    src={URL.createObjectURL(photo)}
                    alt={t("browser.author.profilePhotoAlt", "Profile photo")}
                    className="browser-author__profile-photo-img"
                  />
                  <button
                    type="button"
                    className="browser-author__profile-photo-remove"
                    onClick={() => {
                      setProfilePhotos((prev) => prev.filter((_, i) => i !== index));
                    }}
                    disabled={busy}
                  >
                    <AuthorIconX />
                  </button>
                </div>
              ))}
              {existingGalleryPhotos.length + profilePhotos.length < MAX_PROFILE_GALLERY_PHOTOS && (
                <div className="browser-author__profile-photos-add">
                  <input
                    id="browser-author-profile-photos"
                    type="file"
                    className="browser-author__profile-photos-input"
                    accept="image/*"
                    multiple
                    disabled={busy}
                    onChange={(e) => {
                      const remaining =
                        MAX_PROFILE_GALLERY_PHOTOS -
                        existingGalleryPhotos.length -
                        profilePhotos.length;
                      const newFiles = Array.from(e.target.files ?? []).slice(0, Math.max(0, remaining));
                      setProfilePhotos((prev) => [...prev, ...newFiles]);
                    }}
                  />
                  <label htmlFor="browser-author-profile-photos" className="browser-author__profile-photos-add-btn">
                    <AuthorIconPlus />
                  </label>
                </div>
              )}
            </div>
          </div>

          <div className="browser-author__profile-fields">
            <label className="field-label" htmlFor="browser-author-profile-displayname">
              {t("browser.author.profileDisplayName", "Display Name")}
            </label>
            <input
              id="browser-author-profile-displayname"
              className="browser-author__profile-input"
              data-testid="browser-author-profile-displayname"
              value={profileDisplayName}
              onChange={(e) => setProfileDisplayName(e.target.value)}
              disabled={busy}
              placeholder={t("browser.author.profileDisplayNamePlaceholder", "Your name")}
            />

            <label className="field-label" htmlFor="browser-author-profile-title">
              {t("browser.author.profileTitle", "Title")}
            </label>
            <input
              id="browser-author-profile-title"
              className="browser-author__profile-input"
              data-testid="browser-author-profile-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={busy}
              placeholder={t("browser.author.profileTitlePlaceholder", "e.g., AI Enthusiast")}
            />

            <AuthorAiDraftField
              surface="bio"
              label={t("browser.author.profileBio", "Bio")}
              htmlFor="browser-author-profile-bio"
              value={profileBio}
              title={title}
              disabled={busy}
              onApply={(text, action) => setProfileBio((prev) => applyAuthorDraft(prev, text, action))}
            >
              <textarea
                id="browser-author-profile-bio"
                className="browser-author__profile-textarea"
                data-testid="browser-author-profile-bio"
                value={profileBio}
                onChange={(e) => setProfileBio(e.target.value)}
                disabled={busy}
                rows={4}
                placeholder={t("browser.author.profileBioPlaceholder", "Tell us about yourself…")}
              />
            </AuthorAiDraftField>
          </div>
        </div>

        {template !== "profile" && (
          <>
            <label className="field-label" htmlFor="web-content-visibility">
              {t("browser.author.visibility", "Visibility")}
            </label>
            <VisibilitySelector value={visibility} onChange={handleVisibilityChange} disabled={busy} />
          </>
        )}

        {error ? (
          <p className="browser-author__error" data-testid="browser-author-error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="browser-author__actions">
          <button
            type="button"
            className="btn browser-author__back-btn"
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
            <AuthorIconBack />
            {t("browser.author.back", "Back")}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!((profileDisplayName.trim() || title.trim()) && !busy)}
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

  return (
    <div
      className={`browser-author${isArticle ? " browser-author--article" : ""}`}
      data-testid="browser-author-form"
    >
      <header className="browser-author__header">
        <h3>{heading}</h3>
        <p className="browser-author__lede">
          {isArticle
            ? t(
                "browser.author.articleLede",
                "Write like an article — titles, headings, lists, links, and images. Preview anytime.",
              )
            : t("browser.author.binaryLede", "Add a file, set visibility, then publish to your mesh site.")}
        </p>
      </header>

      <label className="field-label" htmlFor="browser-author-title">
        {isArticle
          ? t("browser.author.articleTitle", "Headline")
          : t("browser.author.title", "Title")}
      </label>
      <input
        id="browser-author-title"
        className={`browser-author__title${isArticle ? " browser-author__title--headline" : ""}`}
        data-testid="browser-author-title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        disabled={busy}
        placeholder={
          template === "photo"
            ? t("browser.author.photoTitlePlaceholder", "Sunset")
            : template === "section"
              ? t("browser.author.sectionTitlePlaceholder", "Market")
              : t("browser.author.titlePlaceholder", "My First Post")
        }
      />

      {template === "section" ? (
        <>
          <p className="field-desc">
            {t(
              "browser.author.sectionHint",
              "Creates envoy://…/{slug}/ — share the link or discover via topic search.",
            )}
          </p>
          <label className="field-label" htmlFor="browser-author-section-slug">
            {t("browser.author.sectionSlug", "Path slug (optional)")}
          </label>
          <input
            id="browser-author-section-slug"
            className="browser-author__title"
            data-testid="browser-author-section-slug"
            value={sectionSlug}
            onChange={(e) => setSectionSlug(e.target.value)}
            disabled={busy}
            placeholder={t("browser.author.sectionSlugPlaceholder", "market")}
          />
          <label className="browser-author__check">
            <input
              type="checkbox"
              data-testid="browser-author-advertise-topic"
              checked={advertiseTopic}
              disabled={busy}
              onChange={(e) => setAdvertiseTopic(e.target.checked)}
            />
            {t(
              "browser.author.advertiseTopic",
              "List in Discover / Bazaar topic search (publish:slug)",
            )}
          </label>
        </>
      ) : null}

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
            placeholder={t("browser.author.galleryPlaceholder", "wall")}
          />
        </>
      ) : null}

      {isBinary ? (
        <>
          <label className="field-label" htmlFor="browser-author-file">
            {t("browser.author.file", "File")}
          </label>
          <div className="browser-author__file-picker">
            <input
              id="browser-author-file"
              type="file"
              className="browser-author__file-input"
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
            <label htmlFor="browser-author-file" className="btn browser-author__file-btn">
              <AuthorIconFile />
              {t("browser.author.chooseFile", "Choose File")}
            </label>
            {file ? (
              <span className="browser-author__file-name" data-testid="browser-author-file-name">
                {file.name} ({Math.round(file.size / 1024)} {t("browser.author.fileSizeUnit", "KiB")})
              </span>
            ) : (
              <span className="browser-author__file-name browser-author__file-name--empty">
                {t("browser.author.noFileChosen", "No file chosen")}
              </span>
            )}
          </div>
          {template === "photo" ? (
            <AuthorAiDraftField
              surface="caption"
              label={t("browser.author.caption", "Caption (optional)")}
              htmlFor="browser-author-caption"
              value={body}
              title={title}
              disabled={busy}
              onApply={(text, action) => setBody((prev) => applyAuthorDraft(prev, text, action))}
            >
              <MarkdownEditor
                value={body}
                onChange={setBody}
                disabled={busy}
                rows={6}
                articleMode
                data-testid="browser-author-caption"
                placeholder={t(
                  "browser.author.captionPlaceholder",
                  "A short story under the photo…",
                )}
              />
            </AuthorAiDraftField>
          ) : null}
        </>
      ) : template === "blog-post" || template === "section" || template === "note" ? (
        <AuthorAiDraftField
          surface={template === "section" ? "section" : "blog"}
          label={t("browser.author.story", "Story")}
          htmlFor="browser-author-body"
          value={body}
          title={title}
          disabled={busy}
          onApply={(text, action) => setBody((prev) => applyAuthorDraft(prev, text, action))}
        >
          <MarkdownEditor
            value={body}
            onChange={setBody}
            disabled={busy}
            rows={16}
            articleMode
            data-testid="browser-author-body"
            placeholder={t(
              "browser.author.bodyPlaceholder",
              "Start writing… Use Title / Heading for structure, insert images and links as you go.",
            )}
          />
        </AuthorAiDraftField>
      ) : (
        <>
          <label className="field-label" htmlFor="browser-author-body">
            {t("browser.author.story", "Story")}
          </label>
          <MarkdownEditor
            value={body}
            onChange={setBody}
            disabled={busy}
            rows={16}
            articleMode
            placeholder={t(
              "browser.author.bodyPlaceholder",
              "Start writing… Use Title / Heading for structure, insert images and links as you go.",
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
          className="btn browser-author__back-btn"
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
          <AuthorIconBack />
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

function iconProps() {
  return {
    viewBox: "0 0 24 24",
    width: 18,
    height: 18,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
  };
}

function AuthorIconArticle() {
  return (
    <svg {...iconProps()}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="8" y1="13" x2="16" y2="13" />
      <line x1="8" y1="17" x2="14" y2="17" />
    </svg>
  );
}

function AuthorIconNote() {
  return (
    <svg {...iconProps()}>
      <path d="M4 4a2 2 0 0 1 2-2h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
      <path d="M15 2v5h5" />
      <line x1="8" y1="12" x2="14" y2="12" />
      <line x1="8" y1="16" x2="12" y2="16" />
    </svg>
  );
}

function AuthorIconFile() {
  return (
    <svg {...iconProps()}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <path d="M12 18v-6" />
      <path d="M9 15l3 3 3-3" />
    </svg>
  );
}

function AuthorIconProfilePlaceholder() {
  return (
    <svg
      viewBox="0 0 48 48"
      width="48"
      height="48"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="24" cy="14" r="11" />
      <path d="M42 40c0-6-8-12-18-12s-18 6-18 12" />
      <circle cx="19" cy="12" r="2" />
      <circle cx="29" cy="12" r="2" />
      <path d="M20 20c2 2 4 2 6 0" />
    </svg>
  );
}

function AuthorIconCamera() {
  return (
    <svg {...iconProps()}>
      <path d="M23 19h-2v-2h2v2z" />
      <path d="M19 24h10v9H19z" />
      <path d="M30 24l1.5-3a11.1 11.1 0 0 0-2.5-3l-2.5 2a11.1 11.1 0 0 0-3 0l-2.5-2a11.1 11.1 0 0 0-2.5 3L6 24" />
      <path d="M4 20h4v4H4z" />
      <path d="M40 20h4v4h-4z" />
    </svg>
  );
}

function AuthorIconPlus() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

function AuthorIconX() {
  return (
    <svg {...iconProps()}>
      <path d="M18 6L6 18" />
      <path d="M6 6l12 12" />
    </svg>
  );
}

function AuthorIconBack() {
  return (
    <svg {...iconProps()}>
      <path d="M19 12H5" />
      <path d="M12 19l-7-7 7-7" />
    </svg>
  );
}

function AuthorIconCheck() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="32"
      height="32"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}
