/**
 * @vitest-environment jsdom
 *
 * Social / Feed / Blog badges for inbound stars & comments clear when those
 * surfaces open — not when Social lands on Chats (default).
 */
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { SocialView } from "../../src/components/views/SocialView.js";
import { I18nTestProvider } from "../../src/context/I18nContext.js";
import { ToastProvider } from "../../src/hooks/useToast.js";
import { renderWithI18n } from "../helpers/render-with-i18n.js";

vi.mock("../../src/components/views/FeedView.js", () => ({
  FeedView: () => <div data-testid="feed-view-stub" />,
}));
vi.mock("../../src/components/views/BlogView.js", () => ({
  BlogView: () => <div data-testid="blog-view-stub" />,
}));
vi.mock("../../src/components/views/ChatView.js", () => ({
  ChatView: () => <div data-testid="chat-view-stub" />,
}));
vi.mock("../../src/components/views/DiscoverView.js", () => ({
  DiscoverView: () => <div data-testid="discover-view-stub" />,
}));
vi.mock("../../src/components/views/BrowserView.js", () => ({
  BrowserView: () => <div data-testid="explore-view-stub" />,
}));

afterEach(() => cleanup());

const chatProps = {
  selectedContact: null as string | null,
  onSelectedContactChange: () => {},
};

/** Stateful wrapper so tab clicks update controlled props in tests. */
function SocialHarness(
  props: Omit<
    React.ComponentProps<typeof SocialView>,
    "activeTab" | "onActiveTabChange" | "chatProps"
  > & {
    initialTab?: React.ComponentProps<typeof SocialView>["activeTab"];
  },
) {
  const [activeTab, setActiveTab] = React.useState(props.initialTab ?? "chats");
  return (
    <SocialView
      {...props}
      activeTab={activeTab}
      onActiveTabChange={setActiveTab}
      chatProps={chatProps}
    />
  );
}

describe("SocialView engagement badges", () => {
  it("does not clear badges when Social opens on Chats", async () => {
    const onDismissEngage = vi.fn(async () => {});
    renderWithI18n(
      <SocialHarness
        feedEngageCount={2}
        blogEngageCount={1}
        onDismissEngage={onDismissEngage}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId("chat-view-stub")).toBeTruthy();
    });
    expect(onDismissEngage).not.toHaveBeenCalled();
  });

  it("clears feed/blog badges when those tabs are selected", async () => {
    const onDismissEngage = vi.fn(async () => {});
    renderWithI18n(
      <SocialHarness feedEngageCount={0} blogEngageCount={3} onDismissEngage={onDismissEngage} />,
    );
    expect(onDismissEngage).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("social-tab-blog"));
    await waitFor(() => {
      expect(onDismissEngage).toHaveBeenCalledWith("blog");
    });

    fireEvent.click(screen.getByTestId("social-tab-feed"));
    await waitFor(() => {
      expect(onDismissEngage).toHaveBeenCalledWith("feed", { feedNotify: true });
    });
  });

  it("dismisses feed.notify when Feed opens programmatically", async () => {
    const onDismissEngage = vi.fn(async () => {});
    renderWithI18n(
      <SocialHarness
        initialTab="feed"
        feedEngageCount={0}
        feedNotifyCount={0}
        blogEngageCount={0}
        onDismissEngage={onDismissEngage}
      />,
    );
    await waitFor(() => {
      expect(onDismissEngage).toHaveBeenCalledWith("feed", { feedNotify: true });
    });
  });

  it("re-dismisses feed engage (with feed.notify) when count rises while on Feed", async () => {
    const onDismissEngage = vi.fn(async () => {});
    const view = renderWithI18n(
      <SocialHarness
        initialTab="feed"
        feedEngageCount={0}
        blogEngageCount={0}
        onDismissEngage={onDismissEngage}
      />,
    );
    await waitFor(() => {
      expect(onDismissEngage).toHaveBeenCalled();
    });
    onDismissEngage.mockClear();

    view.rerender(
      <I18nTestProvider>
        <ToastProvider>
          <SocialHarness
            initialTab="feed"
            feedEngageCount={2}
            blogEngageCount={0}
            onDismissEngage={onDismissEngage}
          />
        </ToastProvider>
      </I18nTestProvider>,
    );
    await waitFor(() => {
      expect(onDismissEngage).toHaveBeenCalledWith("feed", { feedNotify: true });
    });
  });

  it("shows blog badge when Feed is active (Feed badge hidden)", () => {
    renderWithI18n(
      <SocialHarness
        initialTab="feed"
        feedEngageCount={2}
        feedNotifyCount={3}
        blogEngageCount={4}
        onDismissEngage={async () => {}}
      />,
    );
    const blogTab = screen.getByTestId("social-tab-blog");
    expect(blogTab.textContent).toMatch(/4/);
  });

  it("shows combined engage+notify on Feed when viewing another tab", async () => {
    const onDismissEngage = vi.fn(async () => {});
    renderWithI18n(
      <SocialHarness
        feedEngageCount={2}
        feedNotifyCount={3}
        blogEngageCount={0}
        onDismissEngage={onDismissEngage}
      />,
    );
    fireEvent.click(screen.getByTestId("social-tab-blog"));
    await waitFor(() => {
      expect(screen.getByTestId("social-tab-feed").textContent).toMatch(/5/);
    });
  });

  it("switches to Explore when open-browser fires with a pending URL", async () => {
    sessionStorage.setItem("envoymesh:browser-pending-url", "envoy://envoy:owner:alice/blog/hello.md");
    renderWithI18n(<SocialHarness onDismissEngage={async () => {}} />);
    await waitFor(() => {
      expect(screen.getByTestId("explore-view-stub")).toBeTruthy();
    });
    expect(screen.getByTestId("social-tab-explore").getAttribute("aria-selected")).toBe("true");
    sessionStorage.removeItem("envoymesh:browser-pending-url");
  });
});
