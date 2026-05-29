import { describe, expect, it } from "vitest";
import {
  DEFAULT_ENVOY_DISCLOSURE_SETTINGS,
  normalizeEnvoyDisclosureSettings,
  resolveChatBubblePresentation,
} from "../src/envoy-disclosure.js";

describe("resolveChatBubblePresentation", () => {
  it("defaults to agent badges (Phase 13 behavior)", () => {
    const result = resolveChatBubblePresentation(
      {
        actorRole: "agent",
        agentVerified: true,
        outgoing: false,
        contactDisplayName: "Bob",
        threadKind: "human",
      },
      DEFAULT_ENVOY_DISCLOSURE_SETTINGS,
    );
    expect(result.variant).toBe("incoming-agent");
    expect(result.actorBadge).toBe("Bob's agent");
  });

  it("collapses verified peer agent when configured", () => {
    const result = resolveChatBubblePresentation(
      {
        actorRole: "agent",
        agentVerified: true,
        outgoing: false,
        contactDisplayName: "Bob",
        threadKind: "human",
      },
      { showAgentBadges: false, collapsePeerAgentToContact: true },
    );
    expect(result.variant).toBe("incoming-peer");
    expect(result.actorBadge).toBe("Bob");
  });

  it("never collapses unverified peer agent", () => {
    const result = resolveChatBubblePresentation(
      {
        actorRole: "agent",
        agentVerified: false,
        outgoing: false,
        contactDisplayName: "Bob",
        threadKind: "human",
      },
      { showAgentBadges: false, collapsePeerAgentToContact: true },
    );
    expect(result.variant).toBe("incoming-agent");
    expect(result.actorBadge).toContain("unverified");
  });

  it("hides outgoing agent badge when showAgentBadges is false", () => {
    const result = resolveChatBubblePresentation(
      {
        actorRole: "agent",
        agentVerified: true,
        outgoing: true,
        contactDisplayName: "Bob",
        threadKind: "human",
      },
      { showAgentBadges: false, collapsePeerAgentToContact: false },
    );
    expect(result.variant).toBe("outgoing");
    expect(result.actorBadge).toBeUndefined();
  });

  it("normalizes partial disclosure settings", () => {
    expect(normalizeEnvoyDisclosureSettings({ showAgentBadges: false })).toEqual({
      showAgentBadges: false,
      collapsePeerAgentToContact: false,
    });
  });
});
