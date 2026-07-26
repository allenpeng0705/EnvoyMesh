/**
 * @vitest-environment jsdom
 *
 * Phase 45 — BrowserView component test.
 *
 * Tests the in-app "Browser" view's URL parsing, navigation, and
 * render dispatch on the response from nodeService.libraryRead.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithI18n } from "../helpers/render-with-i18n.js";

const libraryRead = vi.fn();
const ensureDefaultWebSite = vi.fn(async () => ({
  created: [] as string[],
  urls: {
    profile: "envoy://envoy:owner:self/",
    blog: "envoy://envoy:owner:self/blog/",
    photowall: "envoy://envoy:owner:self/photos/wall/",
  },
}));
const showToast = vi.fn();

let libraryReadMock: (params?: { path?: string }) => Promise<unknown> = async () => ({
  status: "not_found",
  peerOwnerId: "envoy:owner:test",
  libp2pPeerId: "12D3KooWTest",
  latencyMs: 0,
  error: "no peer resolved",
});

beforeEach(() => {
  libraryReadMock = async () => ({
    status: "not_found",
    peerOwnerId: "envoy:owner:test",
    libp2pPeerId: "12D3KooWTest",
    latencyMs: 0,
    error: "no peer resolved",
  });
  libraryRead.mockImplementation((params: unknown) =>
    libraryReadMock(params as { path?: string }),
  );
  ensureDefaultWebSite.mockClear();
  ensureDefaultWebSite.mockImplementation(async () => ({
    created: [],
    urls: {
      profile: "envoy://envoy:owner:self/",
      blog: "envoy://envoy:owner:self/blog/",
      photowall: "envoy://envoy:owner:self/photos/wall/",
    },
  }));
});

vi.mock("../../src/hooks/useNodeService.js", () => ({
  useNodeService: () => ({
    libraryRead,
    publishWebContentEntry: vi.fn(),
    ensureDefaultWebSite,
    listWebContentSections: vi.fn(async () => []),
    listFeedNotifications: vi.fn(async () => []),
    requestAgentCard: vi.fn(async () => ({ ok: true })),
    searchPeers: vi.fn(async () => []),
    runCapabilityDiscovery: vi.fn(async () => undefined),
    listAgentCards: vi.fn(async () => []),
    on: vi.fn(() => () => undefined),
    isConnected: true,
  }),
  useAgentCards: () => [],
  useIsInProcessMobileNode: () => false,
  useTransportWsOpen: () => true,
}));

vi.mock("../../src/context/NodeStateContext.js", () => ({
  useNodeState: () => ({
    humanProfile: { ownerId: "envoy:owner:self", displayName: "Self" },
    bonds: [],
    nodeConfig: {},
  }),
}));

vi.mock("../../src/hooks/useToast.js", () => ({
  useToast: () => ({ showToast, toasts: [] }),
  useToastOptional: () => ({ showToast }),
  ToastProvider: ({ children }: { children: React.ReactNode }) => children,
}));

import { BrowserView } from "../../src/components/views/BrowserView.js";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});


function openReader() {
  fireEvent.click(screen.getByTestId("browser-mode-open"));
}

describe("BrowserView", () => {
  it("defaults to Following; Open shows the address bar", () => {
    renderWithI18n(<BrowserView />);
    expect(screen.getByTestId("browser-mode-following")).toBeTruthy();
    expect(screen.getByTestId("browser-mode-open")).toBeTruthy();
    expect(screen.getByTestId("browser-following")).toBeTruthy();
    expect(screen.queryByTestId("browser-address-bar")).toBeNull();
    openReader();
    expect(screen.getByTestId("browser-address-bar")).toBeTruthy();
    expect(screen.getByTestId("browser-idle")).toBeTruthy();
  });

  it("renders the address bar with placeholder and disabled Go button", () => {
    renderWithI18n(<BrowserView />);
    openReader();
    const addressBar = screen.getByTestId("browser-address-bar");
    expect(addressBar).toBeTruthy();
    const goButton = screen.getByTestId("browser-go");
    expect((goButton as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows parse error for malformed URLs and keeps Go disabled", () => {
    renderWithI18n(<BrowserView />);
    openReader();
    const addressBar = screen.getByTestId("browser-address-bar");
    fireEvent.change(addressBar, { target: { value: "not-a-valid-url" } });
    const goButton = screen.getByTestId("browser-go");
    expect((goButton as HTMLButtonElement).disabled).toBe(true);
  });

  it("enables Go for a valid owner-id URL", () => {
    renderWithI18n(<BrowserView />);
    openReader();
    const addressBar = screen.getByTestId("browser-address-bar");
    fireEvent.change(addressBar, {
      target: { value: "envoy://envoy:owner:abc123/posts/hello" },
    });
    const goButton = screen.getByTestId("browser-go");
    expect((goButton as HTMLButtonElement).disabled).toBe(false);
  });

  it("disables Go for @handle URL (reserved for v2)", () => {
    renderWithI18n(<BrowserView />);
    openReader();
    const addressBar = screen.getByTestId("browser-address-bar");
    fireEvent.change(addressBar, { target: { value: "envoy://@allen/posts/hello" } });
    const goButton = screen.getByTestId("browser-go");
    // Handle form parses but is rejected by resolveEnvoyUrl — Go stays
    // disabled because the parser treats it as non-content.
    expect((goButton as HTMLButtonElement).disabled).toBe(true);
  });

  it("calls libraryRead on submit and renders markdown on ok response", async () => {
    libraryReadMock = async () => ({
      status: "ok",
      peerOwnerId: "envoy:owner:abc123",
      libp2pPeerId: "12D3KooWTest",
      body: "# Hello from Alice",
      contentType: "text/markdown",
      byteLength: 18,
      latencyMs: 10,
    });
    libraryRead.mockImplementation(libraryReadMock);

    renderWithI18n(<BrowserView />);
    openReader();
    const addressBar = screen.getByTestId("browser-address-bar");
    fireEvent.change(addressBar, {
      target: { value: "envoy://envoy:owner:abc123/posts/hello" },
    });
    const goButton = screen.getByTestId("browser-go");
    fireEvent.click(goButton);

    await waitFor(() => {
      expect(libraryRead).toHaveBeenCalledWith({
        targetOwnerId: "envoy:owner:abc123",
        path: "posts/hello",
      });
    });
    await waitFor(() => {
      const markdown = screen.getByTestId("browser-markdown");
      expect(markdown.textContent).toContain("Hello from Alice");
    });
  });

  it("renders PhotoWall markdown as a photo gallery grid", async () => {
    const pngBase64 =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    libraryReadMock = async (params?: { path?: string }) => {
      if (params?.path?.endsWith(".png") || params?.path?.endsWith(".jpg")) {
        return {
          status: "ok",
          peerOwnerId: "envoy:owner:abc123",
          libp2pPeerId: "12D3KooWTest",
          body: pngBase64,
          contentType: "image/png",
          byteLength: 68,
          latencyMs: 5,
        };
      }
      return {
        status: "ok",
        peerOwnerId: "envoy:owner:abc123",
        libp2pPeerId: "12D3KooWTest",
        body: [
          "# Photos",
          "",
          "[![Trip](envoy://envoy:owner:abc123/photos/wall/a.png)](envoy://envoy:owner:abc123/photos/wall/a.png)",
          "",
        ].join("\n"),
        contentType: "text/markdown",
        byteLength: 120,
        latencyMs: 5,
      };
    };
    libraryRead.mockImplementation((params: unknown) =>
      libraryReadMock(params as { path?: string }),
    );

    renderWithI18n(<BrowserView />);
    openReader();
    fireEvent.change(screen.getByTestId("browser-address-bar"), {
      target: { value: "envoy://envoy:owner:abc123/photos/wall/" },
    });
    fireEvent.click(screen.getByTestId("browser-go"));

    await waitFor(() => {
      expect(screen.getByTestId("browser-photo-gallery")).toBeTruthy();
      expect(screen.getAllByTestId("browser-photo-tile")).toHaveLength(1);
    });
  });

  it("keeps PhotoWall listing links clickable (envoy:// href not stripped)", async () => {
    libraryReadMock = async () => ({
      status: "ok",
      peerOwnerId: "envoy:owner:abc123",
      libp2pPeerId: "12D3KooWTest",
      body: "# Photos\n\n- [wall](envoy://envoy:owner:abc123/photos/wall/) (5 photos)\n",
      contentType: "text/markdown",
      byteLength: 80,
      latencyMs: 5,
    });
    libraryRead.mockImplementation(libraryReadMock);

    renderWithI18n(<BrowserView />);
    openReader();
    fireEvent.change(screen.getByTestId("browser-address-bar"), {
      target: { value: "envoy://envoy:owner:abc123/photos/" },
    });
    fireEvent.click(screen.getByTestId("browser-go"));

    await waitFor(() => {
      const link = screen.getByTestId("browser-markdown").querySelector("a");
      expect(link?.getAttribute("href")).toBe("envoy://envoy:owner:abc123/photos/wall/");
      expect(link?.textContent).toBe("wall");
    });
  });

  it("shows a friendly empty state when a contact page is missing", async () => {
    libraryReadMock = async () => ({
      status: "not_found",
      peerOwnerId: "envoy:owner:bob",
      libp2pPeerId: "12D3KooWBob",
      latencyMs: 5,
      error: "not found",
    });
    libraryRead.mockImplementation(libraryReadMock);

    renderWithI18n(<BrowserView />);
    openReader();
    fireEvent.change(screen.getByTestId("browser-address-bar"), {
      target: { value: "envoy://envoy:owner:bob/blog/" },
    });
    fireEvent.click(screen.getByTestId("browser-go"));

    await waitFor(() => {
      const err = screen.getByTestId("browser-error");
      expect(err.textContent).toMatch(/Not published yet/i);
      expect(err.textContent).toMatch(/hasn’t published/i);
      expect(err.className).toContain("browser-view__empty--remote");
    });
  });

  it("renders status text on ok response", async () => {
    libraryReadMock = async () => ({
      status: "ok",
      peerOwnerId: "envoy:owner:abc123",
      libp2pPeerId: "12D3KooWTest",
      body: "# x",
      contentType: "text/markdown",
      byteLength: 2,
      latencyMs: 5,
    });
    libraryRead.mockImplementation(libraryReadMock);

    renderWithI18n(<BrowserView />);
    openReader();
    const addressBar = screen.getByTestId("browser-address-bar");
    fireEvent.change(addressBar, {
      target: { value: "envoy://envoy:owner:abc123/x" },
    });
    fireEvent.click(screen.getByTestId("browser-go"));

    await waitFor(() => {
      const status = screen.getByTestId("browser-status");
      expect(status.textContent).toContain("text/markdown");
      expect(status.textContent).toContain("2");
    });
  });

  it("renders not_found error state", async () => {
    libraryReadMock = async () => ({
      status: "not_found",
      peerOwnerId: "envoy:owner:abc123",
      libp2pPeerId: "12D3KooWTest",
      latencyMs: 5,
    });
    libraryRead.mockImplementation(libraryReadMock);

    renderWithI18n(<BrowserView />);
    openReader();
    const addressBar = screen.getByTestId("browser-address-bar");
    fireEvent.change(addressBar, {
      target: { value: "envoy://envoy:owner:abc123/missing" },
    });
    fireEvent.click(screen.getByTestId("browser-go"));

    await waitFor(() => {
      const err = screen.getByTestId("browser-error");
      expect(err).toBeTruthy();
    });
  });

  it("renders access_denied error state", async () => {
    libraryReadMock = async () => ({
      status: "forbidden",
      peerOwnerId: "envoy:owner:abc123",
      libp2pPeerId: "12D3KooWTest",
      latencyMs: 5,
    });
    libraryRead.mockImplementation(libraryReadMock);

    renderWithI18n(<BrowserView />);
    openReader();
    const addressBar = screen.getByTestId("browser-address-bar");
    fireEvent.change(addressBar, {
      target: { value: "envoy://envoy:owner:abc123/secret" },
    });
    fireEvent.click(screen.getByTestId("browser-go"));

    await waitFor(() => {
      const err = screen.getByTestId("browser-error");
      expect(err).toBeTruthy();
    });
  });

  it("renders too_large error state", async () => {
    libraryReadMock = async () => ({
      status: "too_large",
      peerOwnerId: "envoy:owner:abc123",
      libp2pPeerId: "12D3KooWTest",
      latencyMs: 5,
    });
    libraryRead.mockImplementation(libraryReadMock);

    renderWithI18n(<BrowserView />);
    openReader();
    const addressBar = screen.getByTestId("browser-address-bar");
    fireEvent.change(addressBar, {
      target: { value: "envoy://envoy:owner:abc123/big" },
    });
    fireEvent.click(screen.getByTestId("browser-go"));

    await waitFor(() => {
      const err = screen.getByTestId("browser-error");
      expect(err).toBeTruthy();
    });
  });

  it("renders binary image as <img> with object URL", async () => {
    libraryReadMock = async () => ({
      status: "ok",
      peerOwnerId: "envoy:owner:abc123",
      libp2pPeerId: "12D3KooWTest",
      // base64 of a 1x1 white PNG
      body: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
      contentType: "image/png",
      byteLength: 70,
      latencyMs: 5,
    });
    libraryRead.mockImplementation(libraryReadMock);

    renderWithI18n(<BrowserView />);
    openReader();
    const addressBar = screen.getByTestId("browser-address-bar");
    fireEvent.change(addressBar, {
      target: { value: "envoy://envoy:owner:abc123/pixel.png" },
    });
    fireEvent.click(screen.getByTestId("browser-go"));

    await waitFor(() => {
      const img = screen.getByTestId("browser-image");
      expect(img).toBeTruthy();
      expect(img.getAttribute("src")?.startsWith("blob:")).toBe(true);
    });
  });

  it("enables Back on the first page and returns to Open idle", async () => {
    libraryReadMock = async () => ({
      status: "ok",
      peerOwnerId: "envoy:owner:self",
      libp2pPeerId: "",
      body: "# Me\n\nWelcome.\n",
      contentType: "text/markdown",
      byteLength: 16,
      latencyMs: 5,
    });
    libraryRead.mockImplementation(libraryReadMock);

    renderWithI18n(<BrowserView />);
    openReader();
    fireEvent.change(screen.getByTestId("browser-address-bar"), {
      target: { value: "envoy://envoy:owner:self/blog/" },
    });
    fireEvent.click(screen.getByTestId("browser-go"));

    await waitFor(() => {
      expect(screen.getByTestId("browser-markdown").textContent).toContain("Welcome");
    });

    const back = screen.getByTestId("browser-back") as HTMLButtonElement;
    expect(back.disabled).toBe(false);
    fireEvent.click(back);

    await waitFor(() => {
      expect(screen.getByTestId("browser-idle")).toBeTruthy();
    });
  });

  it("can leave a hung load via Back", async () => {
    libraryReadMock = () => new Promise(() => {});
    libraryRead.mockImplementation(libraryReadMock);

    renderWithI18n(<BrowserView />);
    openReader();
    fireEvent.change(screen.getByTestId("browser-address-bar"), {
      target: { value: "envoy://envoy:owner:self/blog/" },
    });
    fireEvent.click(screen.getByTestId("browser-go"));

    await waitFor(() => {
      expect(screen.getByTestId("browser-loading")).toBeTruthy();
    });

    const back = screen.getByTestId("browser-back") as HTMLButtonElement;
    expect(back.disabled).toBe(false);
    fireEvent.click(back);

    await waitFor(() => {
      expect(screen.getByTestId("browser-idle")).toBeTruthy();
      expect(screen.queryByTestId("browser-loading")).toBeNull();
    });
  });

  it("seeds default site before opening own Blog URL", async () => {
    libraryReadMock = async () => ({
      status: "ok",
      peerOwnerId: "envoy:owner:self",
      libp2pPeerId: "",
      body: "# Seeded\n",
      contentType: "text/markdown",
      byteLength: 9,
      latencyMs: 1,
    });
    libraryRead.mockImplementation(libraryReadMock);

    renderWithI18n(<BrowserView />);
    openReader();
    fireEvent.change(screen.getByTestId("browser-address-bar"), {
      target: { value: "envoy://envoy:owner:self/blog/" },
    });
    fireEvent.click(screen.getByTestId("browser-go"));

    await waitFor(() => {
      expect(ensureDefaultWebSite).toHaveBeenCalled();
      expect(libraryRead).toHaveBeenCalled();
      expect(screen.getByTestId("browser-markdown").textContent).toContain("Seeded");
    });
    const ensureOrder = ensureDefaultWebSite.mock.invocationCallOrder[0] ?? 0;
    const readOrder = libraryRead.mock.invocationCallOrder[0] ?? 0;
    expect(ensureOrder).toBeLessThan(readOrder);
  });
});
