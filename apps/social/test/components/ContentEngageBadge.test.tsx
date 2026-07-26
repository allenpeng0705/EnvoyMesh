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
import { I18nTestProvider } from "../../src/context/I18nContext.js";
import { ToastProvider } from "../../src/hooks/useToast.js";
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
      expect(onDismissEngage).toHaveBeenCalledWith("all", { feedNotify: true });
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
    await waitFor(() =>
      expect(onDismissEngage).toHaveBeenCalledWith("all", { feedNotify: true }),
    );
    onDismissEngage.mockClear();

    fireEvent.click(screen.getByTestId("content-tab-blog"));
    await waitFor(() => {
      expect(onDismissEngage).toHaveBeenCalledWith("blog");
    });

    fireEvent.click(screen.getByTestId("content-tab-feed"));
    await waitFor(() => {
      expect(onDismissEngage).toHaveBeenCalledWith("feed", { feedNotify: true });
    });
  });

  it("auto-dismisses feed engage without clearing feed.notify", async () => {
    const onDismissEngage = vi.fn(async () => {});
    const view = renderWithI18n(
      <ContentView
        feedEngageCount={0}
        blogEngageCount={0}
        onDismissEngage={onDismissEngage}
      />,
    );
    await waitFor(() =>
      expect(onDismissEngage).toHaveBeenCalledWith("all", { feedNotify: true }),
    );
    onDismissEngage.mockClear();

    view.rerender(
      <I18nTestProvider>
        <ToastProvider>
          <ContentView
            feedEngageCount={2}
            blogEngageCount={0}
            onDismissEngage={onDismissEngage}
          />
        </ToastProvider>
      </I18nTestProvider>,
    );
    await waitFor(() => {
      expect(onDismissEngage).toHaveBeenCalledWith("feed");
    });
    expect(onDismissEngage.mock.calls.some((c) => c[1]?.feedNotify === true)).toBe(false);
  });

  it("shows blog badge when Feed is active (Feed badge hidden)", () => {
    renderWithI18n(
      <ContentView
        feedEngageCount={2}
        feedNotifyCount={3}
        blogEngageCount={4}
        onDismissEngage={async () => {}}
      />,
    );
    const blogTab = screen.getByTestId("content-tab-blog");
    expect(blogTab.textContent).toMatch(/4/);
  });

  it("shows combined engage+notify on Feed when viewing another tab", async () => {
    const onDismissEngage = vi.fn(async () => {});
    renderWithI18n(
      <ContentView
        feedEngageCount={2}
        feedNotifyCount={3}
        blogEngageCount={0}
        onDismissEngage={onDismissEngage}
      />,
    );
    await waitFor(() => expect(onDismissEngage).toHaveBeenCalled());
    fireEvent.click(screen.getByTestId("content-tab-blog"));
    await waitFor(() => {
      expect(screen.getByTestId("content-tab-feed").textContent).toMatch(/5/);
    });
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
