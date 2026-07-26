/**
 * Content → Feed (Friend Circle): Moments-style text + images for you and bonded contacts.
 * Default visibility: bonded. Compose + timeline; tap photos for fullscreen.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import type { BondRecord, FeedNotification, FeedPostSummary } from "@envoymesh/api";
import { MAX_FEED_POST_IMAGES } from "@envoymesh/api";
import { useT } from "../../context/I18nContext.js";
import { useNodeState } from "../../context/NodeStateContext.js";
import { useNodeService } from "../../hooks/useNodeService.js";
import { contactLabel, shortOwnerId } from "../../lib/display.js";
import { AuthorAiDraftField, applyAuthorDraft } from "../AuthorAiDraftField.js";
import { PeerProfileAvatar } from "../PeerProfileAvatar.js";
import { ProfilePhotoAvatar } from "../ProfilePhotoAvatar.js";
import { FeedMediaGrid } from "../FeedMediaGrid.js";
import { ContentEngagementBar } from "../ContentEngagementBar.js";
import { formatMomentsTime } from "../../lib/moments-time.js";

type FeedVisibility = "bonded" | "contacts" | "private";

type TimelineItem = {
  key: string;
  source: "own" | "peer";
  publisherOwnerId: string;
  title: string;
  body?: string;
  url: string;
  /** Own post path under web/ — required for delete. */
  path?: string;
  publishedAt: string;
  imageUrls: string[];
  visibility?: string;
};

function eligibleBonds(bonds: BondRecord[]): BondRecord[] {
  return bonds.filter((b) => b.level !== "blocked" && Boolean(b.peerOwnerId));
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Failed to read image"));
        return;
      }
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read image"));
    reader.readAsDataURL(file);
  });
}

export function FeedView() {
  const t = useT();
  const nodeService = useNodeService();
  const { bonds, humanProfile } = useNodeState();
  const locale = typeof navigator !== "undefined" ? navigator.language : "en";

  const [ownPosts, setOwnPosts] = useState<FeedPostSummary[]>([]);
  const [notifications, setNotifications] = useState<FeedNotification[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [composeOpen, setComposeOpen] = useState(false);
  const [text, setText] = useState("");
  const [visibility, setVisibility] = useState<FeedVisibility>("bonded");
  const [contactIds, setContactIds] = useState<string[]>([]);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [publishing, setPublishing] = useState(false);
  const [deletingPath, setDeletingPath] = useState<string | null>(null);

  const selectableBonds = useMemo(() => eligibleBonds(bonds), [bonds]);
  const contactsOk = visibility !== "contacts" || contactIds.length > 0;

  const selfOwnerId = humanProfile?.ownerId?.trim() ?? "";
  const selfName = humanProfile?.displayName?.trim() || t("feed.you", "You");
  const selfPhoto = humanProfile?.publicThumbnail;

  const nameFor = useCallback(
    (ownerId: string) => {
      if (ownerId && ownerId === selfOwnerId) return selfName;
      const bond = bonds.find((b) => b.peerOwnerId === ownerId);
      if (bond) return contactLabel(bond);
      return shortOwnerId(ownerId);
    },
    [bonds, selfName, selfOwnerId],
  );

  const refresh = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const [posts, notes] = await Promise.all([
        nodeService.listFeedPosts(),
        nodeService.listFeedNotifications(),
      ]);
      setOwnPosts(posts);
      setNotifications(notes);
    } catch (err) {
      // Keep prior timeline on RPC / store flake (reconnect, mid-write JSON).
      setError(err instanceof Error ? err.message : t("feed.loadFailed", "Could not load Feed"));
    } finally {
      setBusy(false);
    }
  }, [nodeService, t]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const unsub = nodeService.on?.("feed:notify", (data: FeedNotification) => {
      setNotifications((prev) => {
        if (prev.some((p) => p.id === data.id || p.messageId === data.messageId)) return prev;
        return [data, ...prev];
      });
    });
    return () => {
      unsub?.();
    };
  }, [nodeService]);

  useEffect(() => {
    return () => {
      for (const url of imagePreviews) URL.revokeObjectURL(url);
    };
  }, [imagePreviews]);

  const bondedIds = useMemo(
    () => new Set(bonds.filter((b) => b.level === "direct" || b.level === "referred").map((b) => b.peerOwnerId)),
    [bonds],
  );

  const timeline = useMemo((): TimelineItem[] => {
    const items: TimelineItem[] = [];
    for (const p of ownPosts) {
      items.push({
        key: `own:${p.path}`,
        source: "own",
        publisherOwnerId: p.publisherOwnerId,
        title: p.title,
        body: p.bodyPreview ?? p.summary,
        url: p.url,
        path: p.path,
        publishedAt: p.publishedAt,
        imageUrls: p.imageUrls ?? [],
        visibility: p.visibility,
      });
    }
    for (const n of notifications) {
      if (n.kind !== "feed" && n.kind !== "note" && n.kind !== "photo" && n.kind !== "article") continue;
      if (n.kind !== "feed" && !n.url.includes("/feeds/")) continue;
      if (selfOwnerId && n.publisherOwnerId === selfOwnerId) continue;
      if (!bondedIds.has(n.publisherOwnerId)) continue;
      items.push({
        key: `peer:${n.id}`,
        source: "peer",
        publisherOwnerId: n.publisherOwnerId,
        title: n.title,
        body: n.summary,
        url: n.url,
        publishedAt: n.publishedAt || n.receivedAt,
        imageUrls: [],
        visibility: n.visibility,
      });
    }
    items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
    return items;
  }, [ownPosts, notifications, bondedIds, selfOwnerId]);

  function onPickImages(files: FileList | null) {
    if (!files?.length) return;
    const next = [...imageFiles];
    const nextPreviews = [...imagePreviews];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) continue;
      if (next.length >= MAX_FEED_POST_IMAGES) break;
      next.push(file);
      nextPreviews.push(URL.createObjectURL(file));
    }
    setImageFiles(next);
    setImagePreviews(nextPreviews);
  }

  function removeImage(index: number) {
    URL.revokeObjectURL(imagePreviews[index]!);
    setImageFiles((prev) => prev.filter((_, i) => i !== index));
    setImagePreviews((prev) => prev.filter((_, i) => i !== index));
  }

  function handleVisibilityChange(next: FeedVisibility) {
    setVisibility(next);
    if (next !== "contacts") setContactIds([]);
  }

  function toggleContact(ownerId: string) {
    setContactIds((prev) =>
      prev.includes(ownerId) ? prev.filter((id) => id !== ownerId) : [...prev, ownerId],
    );
  }

  async function publish() {
    const body = text.trim();
    if (!body && imageFiles.length === 0) {
      setError(t("feed.needContent", "Add text or at least one photo"));
      return;
    }
    if (visibility === "contacts" && contactIds.length === 0) {
      setError(t("feed.needContacts", "Select at least one contact"));
      return;
    }
    setPublishing(true);
    setError(null);
    try {
      const images = await Promise.all(
        imageFiles.map(async (file) => ({
          contentBase64: await fileToBase64(file),
          mimeType: file.type || "image/jpeg",
          fileName: file.name,
        })),
      );
      const title = body.slice(0, 48).trim() || t("feed.defaultTitle", "Feed post");
      await nodeService.publishWebContentEntry({
        template: "feed-post",
        title,
        body: body || undefined,
        visibility,
        ...(visibility === "contacts" ? { contactIds: [...contactIds] } : {}),
        images,
      });
      for (const url of imagePreviews) URL.revokeObjectURL(url);
      setText("");
      setImageFiles([]);
      setImagePreviews([]);
      setVisibility("bonded");
      setContactIds([]);
      setComposeOpen(false);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("feed.publishFailed", "Publish failed"));
    } finally {
      setPublishing(false);
    }
  }

  async function deleteOwnPost(path: string) {
    const ok = window.confirm(t("feed.deleteConfirm", "Delete this post? This cannot be undone."));
    if (!ok) return;
    setDeletingPath(path);
    setError(null);
    try {
      await nodeService.deleteWebContentEntry({ path });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("feed.deleteFailed", "Could not delete post"));
    } finally {
      setDeletingPath(null);
    }
  }

  return (
    <div className="feed-view" data-testid="feed-view">
      <div className="feed-view__atmosphere" aria-hidden />

      <header className="feed-view__header">
        <div className="feed-view__brand">
          <h2 className="feed-view__title">{t("feed.title", "Feed")}</h2>
          <p className="feed-view__lede">{t("feed.lede", "Updates from you and bonded contacts.")}</p>
        </div>
        <button
          type="button"
          className="feed-view__icon-btn"
          onClick={() => void refresh()}
          disabled={busy || publishing}
          title={busy ? t("feed.refreshing", "Refreshing…") : t("feed.refresh", "Refresh")}
          aria-label={t("feed.refresh", "Refresh")}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </header>

      {!composeOpen ? (
        <button
          type="button"
          className="feed-view__compose-prompt"
          data-testid="feed-compose-open"
          onClick={() => setComposeOpen(true)}
          disabled={publishing}
        >
          <ProfilePhotoAvatar
            photo={selfPhoto}
            fallbackLabel={selfName}
            className="feed-view__compose-avatar"
          />
          <span className="feed-view__compose-hint">
            {t("feed.textPlaceholder", "Share an update with bonded contacts…")}
          </span>
          <span className="feed-view__compose-cta">{t("feed.compose", "New post")}</span>
        </button>
      ) : (
        <section className="feed-view__composer" data-testid="feed-composer">
          <div className="feed-view__composer-top">
            <ProfilePhotoAvatar
              photo={selfPhoto}
              fallbackLabel={selfName}
              className="feed-view__compose-avatar"
            />
            <div className="feed-view__composer-who">
              <strong>{selfName}</strong>
            </div>
          </div>
          <AuthorAiDraftField
            surface="feed"
            label={t("feed.textLabel", "What's on your mind?")}
            htmlFor="feed-compose-text"
            value={text}
            disabled={publishing}
            onApply={(draft, action) => setText((prev) => applyAuthorDraft(prev, draft, action))}
          >
            <textarea
              id="feed-compose-text"
              className="feed-view__textarea"
              data-testid="feed-compose-text"
              rows={4}
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={publishing}
              autoFocus
              placeholder={t("feed.textLabel", "What's on your mind?")}
            />
          </AuthorAiDraftField>
          {imagePreviews.length > 0 || imageFiles.length < MAX_FEED_POST_IMAGES ? (
            <div className="feed-view__images-wrap">
              <div className="feed-view__images" data-testid="feed-compose-images">
                {imagePreviews.map((src, i) => (
                  <div key={src} className="feed-view__image-thumb">
                    <img src={src} alt="" />
                    <button
                      type="button"
                      className="feed-view__image-remove"
                      onClick={() => removeImage(i)}
                      disabled={publishing}
                      aria-label={t("feed.removeImage", "Remove image")}
                    >
                      ×
                    </button>
                  </div>
                ))}
                {imageFiles.length < MAX_FEED_POST_IMAGES ? (
                  <label className="feed-view__image-add">
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      hidden
                      disabled={publishing}
                      onChange={(e) => {
                        onPickImages(e.target.files);
                        e.target.value = "";
                      }}
                    />
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <path
                        d="M4 7h3l2-2h6l2 2h3a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z"
                        stroke="currentColor"
                        strokeWidth="1.75"
                      />
                      <circle cx="12" cy="13" r="3.5" stroke="currentColor" strokeWidth="1.75" />
                    </svg>
                    <span>{t("feed.addPhotos", "Add photos")}</span>
                  </label>
                ) : null}
              </div>
              <p className="feed-view__images-count">
                {t("feed.photoCount", "{current}/{max}", {
                  current: String(imageFiles.length),
                  max: String(MAX_FEED_POST_IMAGES),
                })}
              </p>
            </div>
          ) : null}
          <div className="feed-view__composer-row">
            <label className="feed-view__visibility">
              <span>{t("feed.visibility", "Visibility")}</span>
              <select
                value={visibility}
                disabled={publishing}
                onChange={(e) => handleVisibilityChange(e.target.value as FeedVisibility)}
                data-testid="feed-visibility"
              >
                <option value="bonded">{t("feed.visibilityBonded", "Bonded contacts")}</option>
                <option value="contacts">{t("feed.visibilityContacts", "Selected contacts")}</option>
                <option value="private">{t("feed.visibilityPrivate", "Only me")}</option>
              </select>
            </label>
            <div className="feed-view__composer-actions">
              <button
                type="button"
                className="btn-secondary"
                disabled={publishing}
                onClick={() => setComposeOpen(false)}
              >
                {t("common.cancel", "Cancel")}
              </button>
              <button
                type="button"
                className="primary"
                data-testid="feed-publish"
                disabled={publishing || !contactsOk}
                onClick={() => void publish()}
              >
                {publishing ? t("feed.publishing", "Posting…") : t("feed.publish", "Post")}
              </button>
            </div>
          </div>
          {visibility === "contacts" ? (
            <fieldset
              className="feed-view__contacts"
              data-testid="feed-contacts"
              disabled={publishing}
            >
              <legend>{t("feed.contactsLabel", "Selected contacts")}</legend>
              <p className="feed-view__contacts-hint">
                {t(
                  "feed.contactsHint",
                  "Only these contacts can see this post. Pick at least one.",
                )}
              </p>
              {selectableBonds.length === 0 ? (
                <p className="feed-view__contacts-hint" data-testid="feed-contacts-empty">
                  {t(
                    "feed.contactsEmpty",
                    "No bonded contacts yet — add a contact first, or choose Bonded / Only me.",
                  )}
                </p>
              ) : (
                <ul className="feed-view__contact-list">
                  {selectableBonds.map((bond) => {
                    const id = `feed-contact-${bond.peerOwnerId}`;
                    const checked = contactIds.includes(bond.peerOwnerId);
                    return (
                      <li key={bond.peerOwnerId}>
                        <label className="feed-view__contact-row" htmlFor={id}>
                          <input
                            id={id}
                            type="checkbox"
                            data-testid="feed-contact-checkbox"
                            data-owner-id={bond.peerOwnerId}
                            checked={checked}
                            disabled={publishing}
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
        </section>
      )}

      {error ? (
        <p className="feed-view__error" role="alert">
          {error}
        </p>
      ) : null}

      {timeline.length === 0 && !busy ? (
        <div className="feed-view__empty">
          <div className="feed-view__empty-orb" aria-hidden />
          <h3>{t("feed.emptyTitle", "Your circle is quiet")}</h3>
          <p>{t("feed.empty", "No posts yet. Share an update with your bonded contacts.")}</p>
          <button
            type="button"
            className="primary"
            onClick={() => setComposeOpen(true)}
          >
            {t("feed.compose", "New post")}
          </button>
        </div>
      ) : (
        <ul className="feed-view__list" data-testid="feed-timeline">
          {timeline.map((item, index) => {
            const name = nameFor(item.publisherOwnerId);
            return (
              <li
                key={item.key}
                className="feed-view__card"
                style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
              >
                <div className="feed-view__card-head">
                  {item.source === "own" ? (
                    <ProfilePhotoAvatar
                      photo={selfPhoto}
                      fallbackLabel={name}
                      className="feed-view__card-avatar"
                    />
                  ) : (
                    <PeerProfileAvatar
                      ownerId={item.publisherOwnerId}
                      fallbackLabel={name}
                      className="feed-view__card-avatar"
                    />
                  )}
                  <div className="feed-view__card-meta">
                    <strong>{name}</strong>
                  </div>
                </div>
                <div className="feed-view__card-content">
                  {item.body ? <p className="feed-view__card-body">{item.body}</p> : null}
                  {item.imageUrls.length > 0 ? (
                    <div className="feed-view__card-media">
                      <FeedMediaGrid
                        urls={item.imageUrls}
                        libraryRead={(params) => nodeService.libraryRead(params)}
                      />
                    </div>
                  ) : null}
                  <ContentEngagementBar
                    url={item.url}
                    className="feed-view__engagement"
                    meta={
                      <time className="content-engagement__time" dateTime={item.publishedAt}>
                        {formatMomentsTime(item.publishedAt, locale)}
                      </time>
                    }
                    leading={
                      item.source === "own" && item.path ? (
                        <button
                          type="button"
                          className="feed-view__delete-btn"
                          data-testid="feed-delete"
                          disabled={deletingPath === item.path || publishing}
                          title={t("feed.delete", "Delete")}
                          aria-label={t("feed.delete", "Delete")}
                          onClick={() => void deleteOwnPost(item.path!)}
                        >
                          {deletingPath === item.path ? (
                            <span className="feed-view__delete-busy" aria-hidden>
                              …
                            </span>
                          ) : (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                              <path
                                d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"
                                stroke="currentColor"
                                strokeWidth="1.75"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          )}
                        </button>
                      ) : null
                    }
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
