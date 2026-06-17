/** @vitest-environment jsdom */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { AgentCardPanel, useAgentCard } from "../../src/components/AgentCardPanel.js";
import type { CachedAgentCardSummary } from "@envoymesh/api";

// Stub I18n — no provider in the unit-test env.
vi.mock("../../src/context/I18nContext.js", () => ({
  useT: () => (key: string, fallback?: string) => fallback ?? key,
}));

let cards: CachedAgentCardSummary[] = [];
const mockListAgentCards = vi.fn(async () => cards);
const mockOn = vi.fn((_event: string, _cb: (...args: unknown[]) => void) => {
  return () => {};
});

vi.mock("../../src/hooks/useNodeService.js", () => ({
  useAgentCards: () => cards,
  useNodeService: () => ({
    listAgentCards: mockListAgentCards,
    on: mockOn,
  }),
}));

const baseCard: CachedAgentCardSummary = {
  ownerId: "envoy:owner:alice",
  displayName: "Alice's agent",
  capabilities: ["knowledge.query", "chat.message"],
  cachedAt: "2026-06-16T10:00:00.000Z",
  sourceAgentPeerId: "envoy_agent_alice",
  nodeProfile: "full",
  publicTopics: ["envoymesh:topic:agents"],
  trustPolicySummary: {
    acceptsDirectBondRequests: true,
    acceptsReferralRequests: false,
    requiresHumanApprovalForRawFiles: true,
  },
  supportedProtocolVersions: ["0.1"],
};

describe("AgentCardPanel", () => {
  beforeEach(() => {
    cards = [baseCard];
    vi.clearAllMocks();
  });
  afterEach(() => {
    cleanup();
  });

  it("renders the empty placeholder when no card is cached", () => {
    cards = [];
    render(<AgentCardPanel ownerId="envoy:owner:alice" />);
    expect(document.querySelector(".agent-card-panel--empty")).not.toBeNull();
  });

  it("renders the display name and nodeProfile pill", () => {
    render(<AgentCardPanel ownerId="envoy:owner:alice" />);
    expect(screen.getByText("Alice's agent")).toBeDefined();
    const pill = document.querySelector(".agent-card-profile");
    expect(pill).not.toBeNull();
    expect(pill?.classList.contains("agent-card-profile--full")).toBe(true);
    // The mocked i18n returns the raw `nodeProfile` value (e.g. "full") as the
    // fallback arg. The real i18n returns the localized label from
    // `agentCard.nodeProfileByName.<profile>`.
    expect(pill?.textContent).toBe("full");
  });

  it("renders capabilities as code chips", () => {
    render(<AgentCardPanel ownerId="envoy:owner:alice" />);
    const items = document.querySelectorAll(".agent-card-capability code");
    expect(items).toHaveLength(2);
    expect(items[0]?.textContent).toBe("knowledge.query");
    expect(items[1]?.textContent).toBe("chat.message");
  });

  it("renders public topics when present", () => {
    render(<AgentCardPanel ownerId="envoy:owner:alice" />);
    expect(screen.getByText("envoymesh:topic:agents")).toBeDefined();
  });

  it("renders trust policy with yes/no values", () => {
    render(<AgentCardPanel ownerId="envoy:owner:alice" />);
    const policy = document.querySelector(".agent-card-trust-policy");
    expect(policy).not.toBeNull();
    const text = policy?.textContent ?? "";
    expect(text).toContain("Yes"); // acceptsDirectBondRequests = true
    expect(text).toContain("No"); // acceptsReferralRequests = false
  });

  it("renders protocol versions when present", () => {
    render(<AgentCardPanel ownerId="envoy:owner:alice" />);
    const items = document.querySelectorAll(".agent-card-protocol code");
    expect(items).toHaveLength(1);
    expect(items[0]?.textContent).toBe("0.1");
  });

  it("hides optional sections that are not present on the card", () => {
    cards = [
      {
        ownerId: "envoy:owner:bob",
        displayName: "Bob",
        capabilities: ["knowledge.query"],
        cachedAt: "2026-06-16T10:00:00.000Z",
      },
    ];
    render(<AgentCardPanel ownerId="envoy:owner:bob" />);
    expect(document.querySelector(".agent-card-profile")).toBeNull();
    expect(document.querySelector(".agent-card-trust-policy")).toBeNull();
    expect(document.querySelector(".agent-card-protocol-list")).toBeNull();
  });

  it("shows cachedAt timestamp and source agent peer id", () => {
    render(<AgentCardPanel ownerId="envoy:owner:alice" />);
    const cached = document.querySelector(".agent-card-cached-at");
    expect(cached).not.toBeNull();
    expect(cached?.textContent).toContain("envoy_agent_alice");
  });
});

describe("useAgentCard", () => {
  it("returns the card row matching the ownerId", () => {
    let result: CachedAgentCardSummary | undefined;
    function Probe() {
      result = useAgentCard("envoy:owner:alice");
      return null;
    }
    render(<Probe />);
    expect(result?.displayName).toBe("Alice's agent");
  });

  it("returns undefined when no card matches", () => {
    let result: CachedAgentCardSummary | undefined;
    function Probe() {
      result = useAgentCard("envoy:owner:nobody");
      return null;
    }
    render(<Probe />);
    expect(result).toBeUndefined();
  });
});
