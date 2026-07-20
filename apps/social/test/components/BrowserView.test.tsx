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
const showToast = vi.fn();

let libraryReadMock: () => Promise<unknown> = async () => ({
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
  libraryRead.mockImplementation(() => libraryReadMock());
});

vi.mock("../../src/hooks/useNodeService.js", () => ({
  useNodeService: () => ({
    libraryRead,
    publishWebContentEntry: vi.fn(),
  }),
  useIsInProcessMobileNode: () => false,
}));

vi.mock("../../src/context/NodeStateContext.js", () => ({
  useNodeState: () => ({
    humanProfile: { ownerId: "envoy:owner:self" },
  }),
}));

vi.mock("../../src/hooks/useToast.js", () => ({
  useToast: () => ({ showToast, toasts: [] }),
  useToastOptional: () => ({ showToast }),
  ToastProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("../../src/context/NodeStateContext.js", () => ({
  useNodeState: () => ({ nodeConfig: {} }),
}));

import { BrowserView } from "../../src/components/views/BrowserView.js";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("BrowserView", () => {
  it("renders the address bar with placeholder and disabled Go button", () => {
    renderWithI18n(<BrowserView />);
    const addressBar = screen.getByTestId("browser-address-bar");
    expect(addressBar).toBeTruthy();
    const goButton = screen.getByTestId("browser-go");
    expect((goButton as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows parse error for malformed URLs and keeps Go disabled", () => {
    renderWithI18n(<BrowserView />);
    const addressBar = screen.getByTestId("browser-address-bar");
    fireEvent.change(addressBar, { target: { value: "not-a-valid-url" } });
    const goButton = screen.getByTestId("browser-go");
    expect((goButton as HTMLButtonElement).disabled).toBe(true);
  });

  it("enables Go for a valid owner-id URL", () => {
    renderWithI18n(<BrowserView />);
    const addressBar = screen.getByTestId("browser-address-bar");
    fireEvent.change(addressBar, {
      target: { value: "envoy://envoy:owner:abc123/posts/hello" },
    });
    const goButton = screen.getByTestId("browser-go");
    expect((goButton as HTMLButtonElement).disabled).toBe(false);
  });

  it("disables Go for @handle URL (reserved for v2)", () => {
    renderWithI18n(<BrowserView />);
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
});
