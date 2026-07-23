/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  canGoBack,
  canGoForward,
  createEmptyNavStack,
  goBack,
  goForward,
  pushNav,
  recordBrowserRecent,
  suggestBrowserUrls,
} from "../src/lib/browser-history-store.js";
import {
  addBrowserBookmark,
  isBookmarked,
  loadBrowserBookmarks,
  removeBrowserBookmark,
  toggleBrowserBookmark,
} from "../src/lib/browser-bookmark-store.js";

beforeEach(() => {
  localStorage.clear();
});

describe("browser-history-store", () => {
  it("pushNav truncates forward entries", () => {
    let stack = createEmptyNavStack();
    stack = pushNav(stack, "envoy://envoy:owner:a/one");
    stack = pushNav(stack, "envoy://envoy:owner:a/two");
    stack = pushNav(stack, "envoy://envoy:owner:a/three");
    const back = goBack(stack)!;
    stack = back.stack;
    expect(canGoForward(stack)).toBe(true);
    stack = pushNav(stack, "envoy://envoy:owner:a/four");
    expect(canGoForward(stack)).toBe(false);
    expect(stack.entries).toEqual([
      "envoy://envoy:owner:a/one",
      "envoy://envoy:owner:a/two",
      "envoy://envoy:owner:a/four",
    ]);
  });

  it("back from the first page returns home (empty stack)", () => {
    let stack = createEmptyNavStack();
    stack = pushNav(stack, "envoy://envoy:owner:a/");
    expect(canGoBack(stack)).toBe(true);
    const back = goBack(stack)!;
    expect(back.url).toBeNull();
    expect(back.stack.index).toBe(-1);
    expect(canGoBack(back.stack)).toBe(false);
  });

  it("back and forward move the index", () => {
    let stack = createEmptyNavStack();
    stack = pushNav(stack, "a");
    stack = pushNav(stack, "b");
    expect(canGoBack(stack)).toBe(true);
    const back = goBack(stack)!;
    expect(back.url).toBe("a");
    const fwd = goForward(back.stack)!;
    expect(fwd.url).toBe("b");
  });

  it("records recent urls for autocomplete (per owner)", () => {
    const owner = "envoy:owner:a";
    recordBrowserRecent(owner, "envoy://envoy:owner:a/hello", "Hello");
    recordBrowserRecent(owner, "envoy://envoy:owner:a/other");
    recordBrowserRecent("envoy:owner:b", "envoy://envoy:owner:a/hello", "Other profile");
    const hits = suggestBrowserUrls(owner, "hello");
    expect(hits[0]?.url).toContain("hello");
    expect(hits[0]?.title).toBe("Hello");
    expect(suggestBrowserUrls("envoy:owner:b", "hello")[0]?.title).toBe("Other profile");
  });
});

describe("browser-bookmark-store", () => {
  const owner = "envoy:owner:self";

  it("toggles bookmarks per owner", () => {
    expect(isBookmarked(owner, "envoy://envoy:owner:a/x")).toBe(false);
    const added = toggleBrowserBookmark(owner, "envoy://envoy:owner:a/x", "X");
    expect(added.bookmarked).toBe(true);
    expect(loadBrowserBookmarks(owner)).toHaveLength(1);
    const removed = toggleBrowserBookmark(owner, "envoy://envoy:owner:a/x");
    expect(removed.bookmarked).toBe(false);
    expect(loadBrowserBookmarks(owner)).toHaveLength(0);
  });

  it("add and remove by url", () => {
    addBrowserBookmark(owner, "envoy://envoy:owner:a/y", "Y");
    expect(isBookmarked(owner, "envoy://envoy:owner:a/y")).toBe(true);
    removeBrowserBookmark(owner, "envoy://envoy:owner:a/y");
    expect(isBookmarked(owner, "envoy://envoy:owner:a/y")).toBe(false);
  });
});
