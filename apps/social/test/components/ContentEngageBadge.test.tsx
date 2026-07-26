/**
 * @vitest-environment jsdom
 *
 * Content / Feed / Blog badges for inbound stars & comments clear when those
 * surfaces open (folder-open UX, parallel to Inbox feed.notify dismissAll).
 */
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { ContentView } from "../../src/components/views/ContentView.js";
import { renderWithI18n } from "../helpers/render-with-i18n.js";

vi.mock("../../src/components/views/FeedView.js", () => ({
  FeedView: () => <div data-testid="feed-view-stub" />,
}));
vi.mock("../../src/components/views/BlogView.js", () => ({
  BlogView: () => <div data-testid="blog-view-stub" />,
}));
vi.mock("../../src/components/views/LibraryView.js", () => ({
  LibraryView: () => <div data-testid="files-view-stub" />,
}));
vi.mock("../../src/components/views/BrowserView.js", () => ({
  BrowserView: () => <div data-testid="explore-view-stub" />,
}));

afterEach(() => cleanup());

describe("ContentView engagement badges", () => {
  it("clears all badges when Content opens", async () => {
    const onDismissEngage = vi.fn(async () => {});
    renderWithI18n(
      <ContentView
        feedEngageCount={2}
        blogEngageCount={1}
        onDismissEngage={onDismissEngage}
      />,
    );
    await waitFor(() => {
      expect(onDismissEngage).toHaveBeenCalledWith("all");
    });
  });

  it("clears feed/blog badges when those tabs are selected", async () => {
    const onDismissEngage = vi.fn(async () => {});
    renderWithI18n(
      <ContentView
        feedEngageCount={0}
        blogEngageCount={3}
        onDismissEngage={onDismissEngage}
      />,
    );
    await waitFor(() => expect(onDismissEngage).toHaveBeenCalledWith("all"));
    onDismissEngage.mockClear();

    fireEvent.click(screen.getByTestId("content-tab-blog"));
    await waitFor(() => {
      expect(onDismissEngage).toHaveBeenCalledWith("blog");
    });

    fireEvent.click(screen.getByTestId("content-tab-feed"));
    await waitFor(() => {
      expect(onDismissEngage).toHaveBeenCalledWith("feed");
    });
  });

  it("shows badge counts on Feed and Blog tabs", () => {
    renderWithI18n(
      <ContentView feedEngageCount={2} blogEngageCount={4} onDismissEngage={async () => {}} />,
    );
    const feedTab = screen.getByTestId("content-tab-feed");
    const blogTab = screen.getByTestId("content-tab-blog");
    expect(feedTab.textContent).toMatch(/2/);
    expect(blogTab.textContent).toMatch(/4/);
  });

  it("switches to Explore when open-browser fires with a pending URL", async () => {
    sessionStorage.setItem("envoymesh:browser-pending-url", "envoy://envoy:owner:alice/blog/hello.md");
    renderWithI18n(<ContentView onDismissEngage={async () => {}} />);
    await waitFor(() => {
      expect(screen.getByTestId("explore-view-stub")).toBeTruthy();
    });
    expect(screen.getByTestId("content-tab-explore").getAttribute("aria-selected")).toBe("true");
    sessionStorage.removeItem("envoymesh:browser-pending-url");
  });
});
