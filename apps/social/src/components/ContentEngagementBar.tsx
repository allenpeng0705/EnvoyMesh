/**
 * WeChat Moments–style likes + comments for Feed/Blog cards.
 * Footer: time + trash on the left, ··· menu on the right;
 * gray box lists actor thumbnails with names / comments.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { ContentEngagementSummary } from "@envoymesh/api";
import { useT } from "../context/I18nContext.js";
import { useNodeService } from "../hooks/useNodeService.js";
import { contactLabel, shortOwnerId } from "../lib/display.js";
import { useNodeState } from "../context/NodeStateContext.js";
import { PeerProfileAvatar } from "./PeerProfileAvatar.js";
import { ProfilePhotoAvatar } from "./ProfilePhotoAvatar.js";

export interface ContentEngagementBarProps {
  url: string;
  className?: string;
  /** e.g. post delete — rendered next to time on the left (WeChat Moments). */
  leading?: ReactNode;
  /** Timestamp on the far left. */
  meta?: ReactNode;
}

function LikeIcon({ filled, size = 14 }: { filled: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className="content-engagement__icon">
      <path
        d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.55"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CommentIcon({ size = 14, filled = false }: { size?: number; filled?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className="content-engagement__icon">
      <path
        d="M6.5 5.5h11A2.5 2.5 0 0 1 20 8v6.5a2.5 2.5 0 0 1-2.5 2.5H11l-4.35 3.05A.75.75 0 0 1 5.5 19.4V17A2.5 2.5 0 0 1 3 14.5V8A2.5 2.5 0 0 1 5.5 5.5Z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.55"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function EngageActorAvatar({
  ownerId,
  label,
  selfOwnerId,
  selfPhoto,
}: {
  ownerId: string;
  label: string;
  selfOwnerId: string;
  selfPhoto: import("@envoymesh/api").ProfilePhotoRef | undefined;
}) {
  if (selfOwnerId && ownerId === selfOwnerId) {
    return (
      <ProfilePhotoAvatar
        photo={selfPhoto}
        fallbackLabel={label}
        className="content-engagement__avatar"
      />
    );
  }
  return (
    <PeerProfileAvatar
      ownerId={ownerId}
      fallbackLabel={label}
      className="content-engagement__avatar"
    />
  );
}

export function ContentEngagementBar({
  url,
  className,
  leading,
  meta,
}: ContentEngagementBarProps) {
  const t = useT();
  const nodeService = useNodeService();
  const { bonds, humanProfile } = useNodeState();
  const [summary, setSummary] = useState<ContentEngagementSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const composeRef = useRef<HTMLInputElement>(null);

  const selfOwnerId = humanProfile?.ownerId?.trim() ?? "";
  const selfPhoto = humanProfile?.publicThumbnail;
  const contentOwnerId = /^envoy:\/\/(envoy:owner:[^/]+)\//.exec(url.trim())?.[1] ?? "";

  const refresh = useCallback(async () => {
    if (!url.trim() || !nodeService.getContentEngagement) return;
    try {
      const next = await nodeService.getContentEngagement({ url });
      setSummary(next);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("engagement.loadFailed", "Could not load"));
    }
  }, [nodeService, t, url]);

  useEffect(() => {
    void refresh();
    const timer = window.setTimeout(() => void refresh(), 1800);
    const unsub = nodeService.on?.("content:engage", (data: { url?: string }) => {
      if (data?.url && data.url === url) void refresh();
    });
    return () => {
      window.clearTimeout(timer);
      unsub?.();
    };
  }, [refresh, nodeService, url]);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  useEffect(() => {
    if (composeOpen) composeRef.current?.focus();
  }, [composeOpen]);

  const nameFor = (ownerId: string) => {
    if (ownerId === selfOwnerId) return t("engagement.you", "You");
    const bond = bonds.find((b) => b.peerOwnerId === ownerId);
    if (bond) return contactLabel(bond);
    return shortOwnerId(ownerId);
  };

  async function onToggleStar() {
    if (busy || !nodeService.toggleContentStar) return;
    setMenuOpen(false);
    setBusy(true);
    try {
      const next = await nodeService.toggleContentStar({ url });
      setSummary(next);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("engagement.starFailed", "Could not like"));
    } finally {
      setBusy(false);
    }
  }

  function onOpenCompose() {
    setMenuOpen(false);
    setComposeOpen(true);
  }

  async function onAddComment() {
    const text = draft.trim();
    if (!text || busy || !nodeService.addContentComment) return;
    setBusy(true);
    try {
      const next = await nodeService.addContentComment({ url, text });
      setSummary(next);
      setDraft("");
      setComposeOpen(false);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("engagement.commentFailed", "Could not comment"));
    } finally {
      setBusy(false);
    }
  }

  async function onRemoveComment(commentId: string) {
    if (busy || !nodeService.removeContentComment) return;
    const ok = window.confirm(t("engagement.removeCommentConfirm", "Remove this comment?"));
    if (!ok) return;
    setBusy(true);
    try {
      const next = await nodeService.removeContentComment({ url, commentId });
      setSummary(next);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t("engagement.removeCommentFailed", "Could not remove"),
      );
    } finally {
      setBusy(false);
    }
  }

  const starred = summary?.starredByMe ?? false;
  const starOwnerIds = summary?.starOwnerIds ?? [];
  const comments = summary?.comments ?? [];
  const hasEngagement = starOwnerIds.length > 0 || comments.length > 0;

  return (
    <div
      ref={rootRef}
      className={`content-engagement${className ? ` ${className}` : ""}`}
      data-testid="content-engagement"
    >
      <div className="content-engagement__footer">
        <div className="content-engagement__left">
          {meta ? <div className="content-engagement__meta">{meta}</div> : null}
          {leading}
        </div>
        <div className="content-engagement__actions">
          <div className="content-engagement__more-wrap">
            {menuOpen ? (
              <div className="content-engagement__popover" role="menu" data-testid="content-engagement-menu">
                <button
                  type="button"
                  role="menuitem"
                  className={`content-engagement__popover-btn${starred ? " content-engagement__popover-btn--liked" : ""}`}
                  data-testid="content-engagement-like"
                  disabled={busy}
                  aria-pressed={starred}
                  onClick={() => void onToggleStar()}
                >
                  <span className="content-engagement__popover-icon" aria-hidden>
                    <LikeIcon filled={false} size={17} />
                  </span>
                  <span>
                    {starred
                      ? t("engagement.unstarTitle", "Unlike")
                      : t("engagement.starTitle", "Like")}
                  </span>
                </button>
                <span className="content-engagement__popover-divider" aria-hidden />
                <button
                  type="button"
                  role="menuitem"
                  className="content-engagement__popover-btn"
                  data-testid="content-engagement-comments"
                  disabled={busy}
                  onClick={onOpenCompose}
                >
                  <span className="content-engagement__popover-icon" aria-hidden>
                    <CommentIcon size={17} />
                  </span>
                  <span>{t("engagement.commentsTitle", "Comment")}</span>
                </button>
              </div>
            ) : null}
            <button
              type="button"
              className={`content-engagement__more-btn${menuOpen ? " content-engagement__more-btn--open" : ""}`}
              data-testid="content-engagement-more"
              disabled={busy}
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              aria-label={t("engagement.moreAria", "Like or comment")}
              title={t("engagement.moreAria", "Like or comment")}
              onClick={() => setMenuOpen((v) => !v)}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
                <circle cx="6" cy="12" r="1.65" fill="currentColor" />
                <circle cx="12" cy="12" r="1.65" fill="currentColor" />
                <circle cx="18" cy="12" r="1.65" fill="currentColor" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {hasEngagement ? (
        <div className="content-engagement__moments" data-testid="content-engagement-moments">
          {starOwnerIds.length > 0 ? (
            <div className="content-engagement__stars" data-testid="content-engagement-stars">
              <span className="content-engagement__stars-icon" aria-hidden>
                <LikeIcon filled size={15} />
              </span>
              <div className="content-engagement__stars-body">
                <div className="content-engagement__stars-avatars" aria-hidden>
                  {starOwnerIds.slice(0, 8).map((id) => (
                    <EngageActorAvatar
                      key={id}
                      ownerId={id}
                      label={nameFor(id)}
                      selfOwnerId={selfOwnerId}
                      selfPhoto={selfPhoto}
                    />
                  ))}
                </div>
                <p className="content-engagement__stars-names">
                  {starOwnerIds.map((id, i) => (
                    <span key={id}>
                      {i > 0 ? <span className="content-engagement__stars-sep">, </span> : null}
                      <span
                        className={`content-engagement__stars-name${id === selfOwnerId ? " content-engagement__stars-name--self" : ""}`}
                      >
                        {nameFor(id)}
                      </span>
                    </span>
                  ))}
                </p>
              </div>
            </div>
          ) : null}

          {starOwnerIds.length > 0 && comments.length > 0 ? (
            <div className="content-engagement__moments-divider" aria-hidden />
          ) : null}

          {comments.length > 0 ? (
            <ul className="content-engagement__list">
              {comments.map((c) => {
                const canRemove =
                  Boolean(selfOwnerId) &&
                  (c.authorOwnerId === selfOwnerId || selfOwnerId === contentOwnerId);
                const label = nameFor(c.authorOwnerId);
                const isSelf = c.authorOwnerId === selfOwnerId;
                return (
                  <li key={c.id}>
                    <EngageActorAvatar
                      ownerId={c.authorOwnerId}
                      label={label}
                      selfOwnerId={selfOwnerId}
                      selfPhoto={selfPhoto}
                    />
                    <p className="content-engagement__comment-line">
                      <strong className={isSelf ? "content-engagement__name--self" : undefined}>
                        {label}
                      </strong>
                      <span className="content-engagement__comment-colon">: </span>
                      <span>{c.text}</span>
                    </p>
                    {canRemove ? (
                      <button
                        type="button"
                        className="content-engagement__comment-remove"
                        data-testid="content-engagement-comment-remove"
                        disabled={busy}
                        aria-label={t("engagement.removeComment", "Remove comment")}
                        title={t("engagement.removeComment", "Remove comment")}
                        onClick={() => void onRemoveComment(c.id)}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
                          <path
                            d="M6 6l12 12M18 6L6 18"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                          />
                        </svg>
                      </button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      ) : null}

      {composeOpen ? (
        <div className="content-engagement__compose" data-testid="content-engagement-compose">
          <input
            ref={composeRef}
            type="text"
            data-testid="content-engagement-comment-input"
            value={draft}
            maxLength={280}
            disabled={busy}
            placeholder={t("engagement.commentPlaceholder", "Write a comment…")}
            aria-label={t("engagement.commentPlaceholder", "Write a comment…")}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void onAddComment();
              }
              if (e.key === "Escape") {
                setComposeOpen(false);
                setDraft("");
              }
            }}
          />
          <button
            type="button"
            className="content-engagement__send"
            data-testid="content-engagement-comment-send"
            disabled={busy || !draft.trim()}
            aria-label={t("engagement.sendComment", "Send")}
            onClick={() => void onAddComment()}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M4 12h14M13 6l7 6-7 6"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      ) : null}

      {error ? (
        <p className="content-engagement__error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
