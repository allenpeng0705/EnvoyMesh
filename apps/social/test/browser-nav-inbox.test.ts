/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  OPEN_BROWSER_EVENT,
  OPEN_INBOX_EVENT,
  clearInboxPublisherFilter,
  getInboxPublisherFilter,
  openBrowserAuthor,
  openChatInbox,
  takePendingAuthorTemplate,
} from "../src/lib/browser-nav.js";
import { publishSearchTopic } from "../src/lib/publish-topic.js";

afterEach(() => {
  clearInboxPublisherFilter();
  takePendingAuthorTemplate();
});

describe("publishSearchTopic", () => {
  it("slugifies ASCII and Unicode topics", () => {
    expect(publishSearchTopic("Photography Tips")).toBe("publish:photography-tips");
    expect(publishSearchTopic("摄影")).toBe("publish:摄影");
    expect(publishSearchTopic("publish:烹饪")).toBe("publish:烹饪");
  });
});

describe("inbox publisher filter persistence", () => {
  it("persists filter across get until cleared", () => {
    openChatInbox({ publisherOwnerId: "envoy:owner:alice" });
    expect(getInboxPublisherFilter()).toBe("envoy:owner:alice");
    expect(getInboxPublisherFilter()).toBe("envoy:owner:alice");
    clearInboxPublisherFilter();
    expect(getInboxPublisherFilter()).toBeNull();
  });

  it("dispatches open-inbox event", () => {
    let seen = false;
    const handler = () => {
      seen = true;
    };
    window.addEventListener(OPEN_INBOX_EVENT, handler);
    openChatInbox({ publisherOwnerId: "envoy:owner:bob" });
    window.removeEventListener(OPEN_INBOX_EVENT, handler);
    expect(seen).toBe(true);
    expect(getInboxPublisherFilter()).toBe("envoy:owner:bob");
  });
});

describe("openBrowserAuthor", () => {
  it("stores pending template and dispatches open-browser", () => {
    let seen = false;
    const handler = () => {
      seen = true;
    };
    window.addEventListener(OPEN_BROWSER_EVENT, handler);
    openBrowserAuthor("blog-post");
    window.removeEventListener(OPEN_BROWSER_EVENT, handler);
    expect(seen).toBe(true);
    expect(takePendingAuthorTemplate()).toBe("blog-post");
    expect(takePendingAuthorTemplate()).toBeNull();
  });
});
