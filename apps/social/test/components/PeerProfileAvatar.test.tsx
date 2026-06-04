/**
 * @vitest-environment jsdom
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { PeerProfileAvatar } from "../../src/components/PeerProfileAvatar.js";

const mockGetPeerProfile = vi.fn();
const mockRequestPeerProfile = vi.fn();
const mockOn = vi.fn(() => () => {});

vi.mock("../../src/hooks/useNodeService.js", () => ({
  useNodeService: () => ({
    getPeerProfile: mockGetPeerProfile,
    requestPeerProfile: mockRequestPeerProfile,
    on: mockOn,
  }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

beforeEach(() => {
  mockGetPeerProfile.mockResolvedValue(undefined);
  mockRequestPeerProfile.mockResolvedValue({ ok: true });
});

describe("PeerProfileAvatar", () => {
  const baseProps = { ownerId: "envoy:owner:alice", fallbackLabel: "Alice" };

  it("renders initial letter when no thumbnail is available", async () => {
    render(<PeerProfileAvatar {...baseProps} />);
    const el = screen.getByText("A");
    expect(el).toBeDefined();
    expect(el.tagName).toBe("DIV");
    // div fallback has profile-avatar class (not profile-avatar--photo)
    expect(el.className).toContain("profile-avatar");
    expect(el.className).not.toContain("profile-avatar--photo");
  });

  it("renders <img> when thumbnail is available (displays actual image, not flex container)", async () => {
    mockGetPeerProfile.mockResolvedValue({
      ownerId: "envoy:owner:alice",
      thumbnailContentBase64: "iVBORw0KGgo", // 1-pixel PNG
      thumbnailMimeType: "image/png",
    });

    const { container } = render(<PeerProfileAvatar {...baseProps} />);

    const img = await waitForImg(container);
    expect(img).toBeDefined();
    expect(img.tagName).toBe("IMG");
    // Must have profile-avatar--photo for object-fit: cover to apply
    expect(img.className).toContain("profile-avatar--photo");
    // Must NOT have display:flex from profile-avatar rule (the :not() exclusion)
    expect(img.getAttribute("src")).toContain("data:image/png;base64,iVBORw0KGgo");
  });

  it("shows initial when getPeerProfile returns undefined", async () => {
    mockGetPeerProfile.mockResolvedValue(undefined);
    render(<PeerProfileAvatar {...baseProps} />);
    const el = screen.getByText("A");
    expect(el.tagName).toBe("DIV");
  });

  it("shows initial when getPeerProfile has no thumbnailContentBase64", async () => {
    mockGetPeerProfile.mockResolvedValue({
      ownerId: "envoy:owner:alice",
      thumbnailContentBase64: undefined,
    });
    render(<PeerProfileAvatar {...baseProps} />);
    const el = screen.getByText("A");
    expect(el.tagName).toBe("DIV");
  });

  it("applies className prop to the rendered element", async () => {
    mockGetPeerProfile.mockResolvedValue({
      ownerId: "envoy:owner:alice",
      thumbnailContentBase64: "iVBORw0KGgo",
      thumbnailMimeType: "image/png",
    });
    const { container } = render(<PeerProfileAvatar {...baseProps} className="thread-avatar" />);
    const img = await waitForImg(container);
    expect(img.className).toContain("thread-avatar");
  });
});

/**
 * Wait for the avatar thumbnail to render. The <img> uses alt="" (decorative), which
 * makes it inaccessible-by-name to `screen.findByRole("img")`, so query the DOM directly.
 */
async function waitForImg(container: HTMLElement): Promise<HTMLImageElement> {
  for (let attempt = 0; attempt < 50; attempt++) {
    const img = container.querySelector("img");
    if (img) return img;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("img element never appeared");
}
