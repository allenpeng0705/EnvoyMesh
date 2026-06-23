/** @vitest-environment jsdom */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { PeerProfilePanel } from "../../src/components/PeerProfilePanel.js";

const mockGetPeerProfile = vi.fn();
const mockRequestPeerProfile = vi.fn();

vi.mock("../../src/hooks/useNodeService.js", () => ({
  useNodeService: () => ({
    getPeerProfile: mockGetPeerProfile,
    requestPeerProfile: mockRequestPeerProfile,
    on: () => undefined,
  }),
}));

vi.mock("../../src/context/I18nContext.js", () => ({
  useT: () => (key: string, fallback?: string) => fallback ?? key,
}));

vi.mock("../../src/components/AgentCardPanel.js", () => ({
  AgentCardPanel: () => <div data-testid="agent-card-panel">agent card</div>,
}));

describe("PeerProfilePanel", () => {
  beforeEach(() => {
    mockGetPeerProfile.mockResolvedValue(undefined);
    mockRequestPeerProfile.mockResolvedValue({ ok: true });
  });

  it("renders contact profile summary and agent card section", async () => {
    render(
      <PeerProfilePanel ownerId="envoy:owner:alice" fallbackDisplayName="Alice" />,
    );
    expect(screen.getByText("Contact profile")).toBeTruthy();
    expect(screen.getByText("Agent capabilities")).toBeTruthy();
    expect(screen.getByTestId("agent-card-panel")).toBeTruthy();
  });

  it("shows synced bio when profile is cached", async () => {
    mockGetPeerProfile.mockResolvedValue({
      ownerId: "envoy:owner:alice",
      cachedAt: new Date().toISOString(),
      profile: {
        ownerId: "envoy:owner:alice",
        displayName: "Alice",
        username: "alice",
        bio: "LAN tester",
        updatedAt: new Date().toISOString(),
        signature: "",
      },
    });
    render(
      <PeerProfilePanel ownerId="envoy:owner:alice" fallbackDisplayName="Alice" />,
    );
    expect(await screen.findByText("LAN tester")).toBeTruthy();
  });
});
