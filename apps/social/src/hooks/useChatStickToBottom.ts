import { useCallback, useEffect, useLayoutEffect, useRef } from "react";

/** Distance from bottom (px) still counted as "stuck" to the latest messages. */
export const CHAT_STICK_BOTTOM_THRESHOLD_PX = 96;

export function isNearBottom(
  el: Pick<HTMLElement, "scrollHeight" | "scrollTop" | "clientHeight">,
  thresholdPx = CHAT_STICK_BOTTOM_THRESHOLD_PX,
): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= thresholdPx;
}

/**
 * Chat list scroll: jump to bottom on open (instant, no smooth scrub through
 * history), keep following new messages only while the user is near the bottom,
 * and stop fighting the user when they scroll up to read a long reply.
 */
export function useChatStickToBottom(
  threadKey: string | null | undefined,
  contentRevision: unknown,
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const stickRef = useRef(true);
  const ignoreScrollRef = useRef(false);
  const prevThreadRef = useRef(threadKey);

  if (prevThreadRef.current !== threadKey) {
    prevThreadRef.current = threadKey;
    stickRef.current = true;
  }

  const scrollToBottomNow = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    // Skip while the pane has no layout (hidden / not sized yet).
    if (el.clientHeight <= 0) return;
    ignoreScrollRef.current = true;
    el.scrollTop = el.scrollHeight;
    // Clear after the browser has delivered any scroll events from this jump.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        ignoreScrollRef.current = false;
      });
    });
  }, []);

  /** Call when the local user sends — re-pin even if they had scrolled up. */
  const pinToBottom = useCallback(() => {
    stickRef.current = true;
    scrollToBottomNow();
  }, [scrollToBottomNow]);

  const onScroll = useCallback(() => {
    if (ignoreScrollRef.current) return;
    const el = containerRef.current;
    if (!el) return;
    // Hidden / zero-height panes are not a user scroll-away.
    if (el.clientHeight <= 0) return;
    stickRef.current = isNearBottom(el);
  }, []);

  useLayoutEffect(() => {
    if (!stickRef.current) return;
    scrollToBottomNow();
  }, [threadKey, contentRevision, scrollToBottomNow]);

  // After paint: history / rich answers often grow past the layout-effect
  // measurement. Re-pin once more while still stuck.
  useEffect(() => {
    if (!stickRef.current) return;
    scrollToBottomNow();
    const id = requestAnimationFrame(() => {
      if (stickRef.current) scrollToBottomNow();
    });
    return () => cancelAnimationFrame(id);
  }, [threadKey, contentRevision, scrollToBottomNow]);

  return { containerRef, onScroll, pinToBottom };
}
