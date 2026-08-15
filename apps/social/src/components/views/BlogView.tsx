/**
 * Content → Blog: own posts list + compose (AI draft). Long-form publishing.
 * Peer mode (from Chat contact → Blog): card list via library.read of blog/index.md
 * (paged + lazy body enrich — see peer-blog-fetch).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BLOG_INDEX_MAX_POSTS,
  type BlogPostSummary,
  type BondRecord,
  type PublishWebContentVisibility,
} from "@envoymesh/api";
import { useT } from "../../context/I18nContext.js";
import { useNodeState } from "../../context/NodeStateContext.js";
import { useNodeService } from "../../hooks/useNodeService.js";
import { contactLabel, shortOwnerId } from "../../lib/display.js";
import { openBrowserAt } from "../../lib/browser-nav.js";
import {
  enrichPeerBlogSummaries,
  parsePeerBlogIndex,
  takePeerBlogPage,
} from "../../lib/peer-blog-fetch.js";
import { AuthorAiDraftField, applyAuthorDraft } from "../AuthorAiDraftField.js";
import { MarkdownEditor } from "../MarkdownEditor.js";
import { VisibilitySelector } from "../VisibilitySelector.js";
import { ProfilePhotoAvatar } from "../ProfilePhotoAvatar.js";
import { FeedMediaGrid } from "../FeedMediaGrid.js";
import { ContentEngagementBar } from "../ContentEngagementBar.js";
import { formatMomentsTime } from "../../lib/moments-time.js";

function eligibleBonds(bonds: BondRecord[]): BondRecord[] {
  return bonds.filter((b) => b.level !== "blocked" && Boolean(b.peerOwnerId));
}

export function BlogView({
  peerOwnerId,
  onClearPeerFilter,
}: {
  peerOwnerId?: string | null;
  onClearPeerFilter?: () => void;
} = {}) {
  const t = useT();
  const nodeService = useNodeService();
  const { bonds, humanProfile } = useNodeState();
  const locale = typeof navigator !== "undefined" ? navigator.language : "en";
  const peerFilter = peerOwnerId?.trim() || "";

  const [posts, setPosts] = useState<BlogPostSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [peerHasMore, setPeerHasMore] = useState(false);
  const [peerRecentOnly, setPeerRecentOnly] = useState(false);
  const peerCatalogRef = useRef<BlogPostSummary[]>([]);
  const peerOffsetRef = useRef(0);

  const [composeOpen, setComposeOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [visibility, setVisibility] = useState<PublishWebContentVisibility>("bonded");
  const [contactIds, setContactIds] = useState<string[]>([]);
  const [publishing, setPublishing] = useState(false);
  const [deletingPath, setDeletingPath] = useState<string | null>(null);

  const selectableBonds = useMemo(() => eligibleBonds(bonds), [bonds]);
  const selfOwnerId = humanProfile?.ownerId?.trim() ?? "";
  const selfName = humanProfile?.displayName?.trim() || t("blog.you", "You");
  const selfPhoto = humanProfile?.publicThumbnail;
  const peerName = useMemo(() => {
    if (!peerFilter) return "";
    const bond = bonds.find((b) => b.peerOwnerId === peerFilter);
    if (bond) return contactLabel(bond);
    return shortOwnerId(peerFilter);
  }, [bonds, peerFilter]);

  const refresh = useCallback(async () => {
    setBusy(true);
    setError(null);
    setPeerHasMore(false);
    setPeerRecentOnly(false);
    peerCatalogRef.current = [];
    peerOffsetRef.current = 0;
    try {
      if (peerFilter) {
        const result = await nodeService.libraryRead({
          targetOwnerId: peerFilter,
          path: "blog/",
          timeoutMs: 45_000,
        });
        if (result.status !== "ok" || typeof result.body !== "string") {
          setPosts([]);
          if (result.status !== "ok") {
            setError(
              result.error ||
                t("blog.peerLoadFailed", "Could not load this contact’s Blog"),
            );
          }
          return;
        }
        const catalog = parsePeerBlogIndex(result.body, peerFilter);
        peerCatalogRef.current = catalog;
        setPeerRecentOnly(catalog.length >= BLOG_INDEX_MAX_POSTS);
        const { page, nextOffset, hasMore } = takePeerBlogPage(catalog, 0);
        peerOffsetRef.current = nextOffset;
        setPeerHasMore(hasMore);
        setPosts(page);
        const enriched = await enrichPeerBlogSummaries(
          (params) => nodeService.libraryRead(params),
          page,
        );
        setPosts(enriched);
        return;
      }
      await nodeService.ensureDefaultWebSite?.().catch(() => undefined);
      const rows = await nodeService.listBlogPosts();
      setPosts(Array.isArray(rows) ? rows : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("blog.loadFailed", "Could not load Blog"));
    } finally {
      setBusy(false);
    }
  }, [nodeService, peerFilter, t]);

  const loadMorePeer = useCallback(async () => {
    if (!peerFilter || !peerHasMore || loadingMore || busy) return;
    setLoadingMore(true);
    setError(null);
    try {
      const { page, nextOffset, hasMore } = takePeerBlogPage(
        peerCatalogRef.current,
        peerOffsetRef.current,
      );
      if (page.length === 0) {
        setPeerHasMore(false);
        return;
      }
      peerOffsetRef.current = nextOffset;
      setPeerHasMore(hasMore);
      setPosts((prev) => [...prev, ...page]);
      const enriched = await enrichPeerBlogSummaries(
        (params) => nodeService.libraryRead(params),
        page,
      );
      setPosts((prev) => {
        const byUrl = new Map(enriched.map((p) => [p.url, p]));
        return prev.map((p) => byUrl.get(p.url) ?? p);
      });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t("blog.loadMoreFailed", "Could not load older posts"),
      );
    } finally {
      setLoadingMore(false);
    }
  }, [peerFilter, peerHasMore, loadingMore, busy, nodeService, t]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function handleVisibilityChange(next: PublishWebContentVisibility) {
    setVisibility(next);
    if (next !== "contacts") setContactIds([]);
  }

  function toggleContact(ownerId: string) {
    setContactIds((prev) =>
      prev.includes(ownerId) ? prev.filter((id) => id !== ownerId) : [...prev, ownerId],
    );
  }

  async function publish() {
    const trimmedTitle = title.trim();
    const trimmedBody = body.trim();
    if (!trimmedTitle) {
      setError(t("blog.needTitle", "Title is required"));
      return;
    }
    if (!trimmedBody) {
      setError(t("blog.needBody", "Write something for your post"));
      return;
    }
    if (visibility === "contacts" && contactIds.length === 0) {
      setError(t("blog.needContacts", "Select at least one contact"));
      return;
    }
    setPublishing(true);
    setError(null);
    try {
      await nodeService.publishWebContentEntry({
        template: "blog-post",
        title: trimmedTitle,
        body: trimmedBody,
        visibility,
        ...(visibility === "contacts" ? { contactIds: [...contactIds] } : {}),
      });
      setTitle("");
      setBody("");
      setVisibility("bonded");
      setContactIds([]);
      setComposeOpen(false);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("blog.publishFailed", "Publish failed"));
    } finally {
      setPublishing(false);
    }
  }

  async function deletePost(path: string) {
    const ok = window.confirm(t("blog.deleteConfirm", "Delete this post? This cannot be undone."));
    if (!ok) return;
    setDeletingPath(path);
    setError(null);
    try {
      await nodeService.deleteWebContentEntry({
        path,
        ...(selfOwnerId ? { ownerId: selfOwnerId } : {}),
      });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("blog.deleteFailed", "Could not delete post"));
    } finally {
      setDeletingPath(null);
    }
  }

  return (
    <div className="feed-view blog-view" data-testid="blog-view">
      <div className="feed-view__atmosphere" aria-hidden />

      <header className="feed-view__header">
        <div className="feed-view__brand">
          <h2 className="feed-view__title">
            {peerFilter
              ? t("blog.peerTitle", "{name}'s Blog", { name: peerName })
              : t("blog.title", "Blog")}
          </h2>
          <p className="feed-view__lede">
            {peerFilter
              ? peerRecentOnly
                ? t(
                    "blog.peerLedeRecent",
                    "Showing recent posts from this contact.",
                  )
                : t("blog.peerLede", "Posts published by this contact.")
              : t("blog.lede", "Longer posts you publish on the mesh.")}
          </p>
        </div>
        <div className="blog-view__header-actions">
          {peerFilter ? (
            <button
              type="button"
              className="feed-view__text-btn"
              data-testid="blog-clear-peer-filter"
              onClick={() => onClearPeerFilter?.()}
            >
              {t("blog.showMine", "My Blog")}
            </button>
          ) : null}
          <button
            type="button"
            className="feed-view__icon-btn"
            onClick={() => void refresh()}
            disabled={busy || publishing}
            title={busy ? t("blog.refreshing", "Refreshing…") : t("blog.refresh", "Refresh")}
            aria-label={t("blog.refresh", "Refresh")}
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
        </div>
      </header>

      {!peerFilter && !composeOpen ? (
        <button
          type="button"
          className="feed-view__compose-prompt"
          data-testid="blog-compose-open"
          onClick={() => setComposeOpen(true)}
          disabled={publishing}
        >
          <ProfilePhotoAvatar
            photo={selfPhoto}
            fallbackLabel={selfName}
            className="feed-view__compose-avatar"
          />
          <span className="feed-view__compose-hint">
            {t("blog.composeHint", "Write a new blog post…")}
          </span>
          <span className="feed-view__compose-cta">{t("blog.compose", "New post")}</span>
        </button>
      ) : null}
      {!peerFilter && composeOpen ? (
        <section className="feed-view__composer blog-view__composer" data-testid="blog-composer">
          <label className="field-label" htmlFor="blog-compose-title">
            {t("blog.titleLabel", "Title")}
          </label>
          <input
            id="blog-compose-title"
            className="blog-view__title-input"
            data-testid="blog-compose-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={publishing}
            placeholder={t("blog.titlePlaceholder", "Post title")}
            autoFocus
          />
          <AuthorAiDraftField
            surface="blog"
            label={t("blog.bodyLabel", "Story")}
            htmlFor="blog-compose-body"
            value={body}
            title={title}
            disabled={publishing}
            onApply={(draft, action) => setBody((prev) => applyAuthorDraft(prev, draft, action))}
          >
            <MarkdownEditor
              value={body}
              onChange={setBody}
              disabled={publishing}
              rows={12}
              articleMode
              data-testid="blog-compose-body"
              placeholder={t(
                "blog.bodyPlaceholder",
                "Start writing… Use headings, images, and links as you go.",
              )}
            />
          </AuthorAiDraftField>
          <label className="field-label" htmlFor="blog-compose-visibility">
            {t("blog.visibility", "Visibility")}
          </label>
          <VisibilitySelector
            value={visibility}
            onChange={handleVisibilityChange}
            disabled={publishing}
          />
          {visibility === "contacts" ? (
            <fieldset className="blog-view__contacts" disabled={publishing}>
              <legend className="field-label">{t("blog.contactsLabel", "Selected contacts")}</legend>
              {selectableBonds.length === 0 ? (
                <p className="field-desc">{t("blog.contactsEmpty", "No bonded contacts yet.")}</p>
              ) : (
                <ul className="blog-view__contact-list">
                  {selectableBonds.map((bond) => {
                    const id = `blog-contact-${bond.peerOwnerId}`;
                    return (
                      <li key={bond.peerOwnerId}>
                        <label htmlFor={id}>
                          <input
                            id={id}
                            type="checkbox"
                            checked={contactIds.includes(bond.peerOwnerId)}
                            onChange={() => toggleContact(bond.peerOwnerId)}
                          />{" "}
                          {contactLabel(bond)}
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </fieldset>
          ) : null}
          <div className="feed-view__composer-actions">
            <button
              type="button"
              className="btn"
              disabled={publishing}
              onClick={() => {
                setComposeOpen(false);
                setError(null);
              }}
            >
              {t("common.cancel", "Cancel")}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              data-testid="blog-compose-publish"
              disabled={publishing}
              onClick={() => void publish()}
            >
              {publishing ? t("blog.publishing", "Publishing…") : t("blog.publish", "Publish")}
            </button>
          </div>
        </section>
      ) : null}

      {error ? (
        <p className="feed-view__error" role="alert" data-testid="blog-error">
          {error}
        </p>
      ) : null}

      {posts.length === 0 && !busy ? (
        <div className="feed-view__empty blog-view__empty" data-testid="blog-empty">
          <div className="feed-view__empty-orb" aria-hidden />
          <h3>
            {peerFilter
              ? t("blog.peerEmptyTitle", "No blog posts from this contact yet")
              : t("blog.emptyTitle", "No posts yet")}
          </h3>
          <p>
            {peerFilter
              ? t("blog.peerEmpty", "Their published Blog posts will appear here.")
              : t("blog.empty", "Write your first blog post for bonded contacts or the mesh.")}
          </p>
          {!peerFilter ? (
            <button type="button" className="primary" onClick={() => setComposeOpen(true)}>
              {t("blog.compose", "New post")}
            </button>
          ) : (
            <button type="button" className="primary" onClick={() => onClearPeerFilter?.()}>
              {t("blog.showMine", "My Blog")}
            </button>
          )}
        </div>
      ) : (
        <>
          <ul className="blog-view__list" data-testid="blog-list">
            {posts.map((post, index) => (
              <li
                key={post.path}
                className="blog-view__card"
                data-testid="blog-card"
                style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
              >
                <button
                  type="button"
                  className="blog-view__card-hit"
                  onClick={() => openBrowserAt(post.url)}
                  aria-label={t("blog.openPost", "Open post") + `: ${post.title}`}
                >
                  <h3 className="blog-view__card-title">{post.title}</h3>
                  {post.bodyPreview ? (
                    <p className="blog-view__card-excerpt">{post.bodyPreview}</p>
                  ) : null}
                </button>
                {post.imageUrls && post.imageUrls.length > 0 ? (
                  <div className="blog-view__card-media feed-view__card-media">
                    <FeedMediaGrid
                      urls={post.imageUrls}
                      libraryRead={(params) => nodeService.libraryRead(params)}
                    />
                  </div>
                ) : null}
                <ContentEngagementBar
                  url={post.url}
                  className="blog-view__engagement"
                  meta={
                    <time className="content-engagement__time" dateTime={post.publishedAt}>
                      {formatMomentsTime(post.publishedAt, locale)}
                    </time>
                  }
                  leading={
                    peerFilter ? null : (
                    <button
                      type="button"
                      className="blog-view__delete"
                      data-testid="blog-delete"
                      disabled={deletingPath === post.path || publishing}
                      aria-label={t("blog.delete", "Delete")}
                      title={t("blog.delete", "Delete")}
                      onClick={(e) => {
                        e.stopPropagation();
                        void deletePost(post.path);
                      }}
                    >
                      {deletingPath === post.path ? (
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
                    )
                  }
                />
              </li>
            ))}
          </ul>
          {peerFilter && peerHasMore ? (
            <div className="feed-view__load-more">
              <button
                type="button"
                className="btn"
                data-testid="blog-peer-load-more"
                disabled={loadingMore || busy}
                onClick={() => void loadMorePeer()}
              >
                {loadingMore
                  ? t("blog.loadingMore", "Loading…")
                  : t("blog.loadMore", "Load older posts")}
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
