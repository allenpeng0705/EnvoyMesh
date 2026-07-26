import { describe, expect, it } from "vitest";
import { createUnsignedMandate, type Mandate } from "@envoymesh/protocol";
import {
  checkCapabilityTopicRateLimit,
  checkPublicKnowledgeRateLimit,
  evaluateCapability,
  evaluateMandateAction,
  evaluatePolicy,
} from "../src/index.js";

describe("bonds", () => {
  it("allows direct peers to request friend-level knowledge", () => {
    expect(
      evaluatePolicy({
        peerId: "peer-a",
        bondLevel: "direct",
        intent: "knowledge.query",
        requestedSensitivity: "friends",
      }),
    ).toEqual({ action: "allow", maxSensitivity: "friends" });
  });

  it("requires approval when direct peers request trusted knowledge", () => {
    expect(
      evaluatePolicy({
        peerId: "peer-a",
        bondLevel: "direct",
        intent: "knowledge.query",
        requestedSensitivity: "trusted",
      }),
    ).toEqual({
      action: "approval_required",
      reason: "requested sensitivity exceeds friends",
    });
  });

  it("allows public peers to query public knowledge (Phase 44B)", () => {
    expect(
      evaluatePolicy({
        peerId: "peer-a",
        bondLevel: "public",
        intent: "knowledge.query",
      }),
    ).toEqual({ action: "allow", maxSensitivity: "public" });
  });

  it("caps public knowledge queries at public sensitivity regardless of request (Phase 44B)", () => {
    // The bonds layer allows the intent but caps sensitivity at "public".
    // The knowledge-query handler enforces the cap when searching the vault.
    expect(
      evaluatePolicy({
        peerId: "peer-a",
        bondLevel: "public",
        intent: "knowledge.query",
        requestedSensitivity: "friends",
      }),
    ).toEqual({ action: "allow", maxSensitivity: "public" });
  });

  it("challenges public bond requests", () => {
    expect(
      evaluatePolicy({
        peerId: "peer-a",
        bondLevel: "public",
        intent: "bond.request",
      }),
    ).toEqual({
      action: "challenge",
      challengeType: "referral_or_manual_approval",
    });
  });

  it("allows public peers to exchange social.intro.sync", () => {
    expect(
      evaluatePolicy({
        peerId: "peer-a",
        bondLevel: "public",
        intent: "social.intro.sync",
      }),
    ).toEqual({ action: "allow", maxSensitivity: "public" });
  });

  it("challenges public peers sending social.intro.propose", () => {
    expect(
      evaluatePolicy({
        peerId: "peer-a",
        bondLevel: "public",
        intent: "social.intro.propose",
      }),
    ).toEqual({
      action: "challenge",
      challengeType: "referral_or_manual_approval",
    });
  });

  it("allows referred peers to use Trust-mode social intents", () => {
    for (const intent of ["social.intro.sync", "social.intro.propose", "social.intro.owner-ready"] as const) {
      expect(
        evaluatePolicy({
          peerId: "peer-a",
          bondLevel: "referred",
          intent,
        }),
      ).toEqual({ action: "allow", maxSensitivity: "public" });
    }
  });

  it("allows referred peers to library.read up to friends sensitivity", () => {
    expect(
      evaluatePolicy({
        peerId: "peer-a",
        bondLevel: "referred",
        intent: "library.read",
        requestedSensitivity: "friends",
      }),
    ).toEqual({ action: "allow", maxSensitivity: "friends" });
  });

  it("allows referred peers to feed.notify / feed.engage and denies public strangers", () => {
    expect(
      evaluatePolicy({
        peerId: "peer-a",
        bondLevel: "referred",
        intent: "feed.notify",
      }),
    ).toEqual({ action: "allow", maxSensitivity: "public" });
    expect(
      evaluatePolicy({
        peerId: "peer-a",
        bondLevel: "referred",
        intent: "feed.engage",
      }),
    ).toEqual({ action: "allow", maxSensitivity: "public" });
    expect(
      evaluatePolicy({
        peerId: "peer-a",
        bondLevel: "direct",
        intent: "feed.notify",
      }),
    ).toEqual({ action: "allow", maxSensitivity: "friends" });
    expect(
      evaluatePolicy({
        peerId: "peer-a",
        bondLevel: "public",
        intent: "feed.notify",
      }),
    ).toEqual({ action: "deny", reason: "public peers cannot use this intent" });
    expect(
      evaluatePolicy({
        peerId: "peer-a",
        bondLevel: "public",
        intent: "feed.engage",
      }),
    ).toEqual({ action: "deny", reason: "public peers cannot use this intent" });
  });

  it("denies blocked peers", () => {
    expect(
      evaluatePolicy({
        peerId: "peer-a",
        bondLevel: "blocked",
        intent: "system.ping",
      }),
    ).toEqual({ action: "deny", reason: "peer is blocked" });
  });

  it("requires approval for raw file requests", () => {
    expect(
      evaluatePolicy({
        peerId: "peer-a",
        bondLevel: "direct",
        intent: "knowledge.query",
        allowRawFiles: true,
      }),
    ).toEqual({
      action: "approval_required",
      reason: "raw file sharing requires approval",
    });
  });

  it("requires messaging capability for social.intro.sync", () => {
    expect(evaluateCapability("social.intro.sync", ["message.send"])).toEqual({ action: "allow" });
    expect(evaluateCapability("social.intro.sync", ["vault.retrieve"])).toEqual({
      action: "deny",
      reason: "missing capability for social.intro.sync",
      requiredCapabilities: ["message.send"],
    });
  });

  it("allows system.signal for primary mesh devices", () => {
    expect(evaluateCapability("system.signal", ["mesh.listen"])).toEqual({
      action: "allow",
    });
  });

  it("allows system.signal for thin mobile UI devices", () => {
    expect(evaluateCapability("system.signal", ["ui.channel"])).toEqual({
      action: "allow",
    });
  });

  it("denies knowledge queries without vault retrieve capability", () => {
    expect(evaluateCapability("knowledge.query", ["message.send"])).toEqual({
      action: "deny",
      reason: "missing capability for knowledge.query",
      requiredCapabilities: ["vault.retrieve"],
    });
  });

  it("requires device sync capability for sync.state", () => {
    expect(evaluateCapability("sync.state", ["ui.channel"])).toEqual({
      action: "deny",
      reason: "missing capability for sync.state",
      requiredCapabilities: ["device.sync"],
    });
  });

  it("allows auth challenge responses from thin mobile UI devices", () => {
    expect(evaluateCapability("auth.challenge.response", ["ui.channel"])).toEqual({
      action: "allow",
    });
  });

  it("allows agent card requests from thin mobile UI devices", () => {
    expect(evaluateCapability("agent.card.request", ["ui.channel"])).toEqual({
      action: "allow",
    });
  });

  it("denies agent card responses without messaging or UI capability", () => {
    expect(evaluateCapability("agent.card.response", ["vault.retrieve"])).toEqual({
      action: "deny",
      reason: "missing capability for agent.card.response",
      requiredCapabilities: ["message.send", "ui.channel"],
    });
  });

  it("allows task mandates for messaging-capable devices", () => {
    expect(evaluateCapability("task.mandate", ["message.send"])).toEqual({
      action: "allow",
    });
  });

  it("allows task negotiation, rejection, and cancellation with safe capabilities", () => {
    expect(evaluateCapability("task.negotiate", ["message.send"])).toEqual({
      action: "allow",
    });
    expect(evaluateCapability("task.reject", ["message.send"])).toEqual({
      action: "allow",
    });
    expect(evaluateCapability("task.cancel", ["approval.prompt"])).toEqual({
      action: "allow",
    });
  });

  it("requires task execution or messaging capability for task progress and reports", () => {
    expect(evaluateCapability("task.heartbeat", ["task.execute"])).toEqual({
      action: "allow",
    });
    expect(evaluateCapability("report.create", ["task.execute"])).toEqual({
      action: "allow",
    });
    expect(evaluateCapability("report.create", ["vault.retrieve"])).toEqual({
      action: "deny",
      reason: "missing capability for report.create",
      requiredCapabilities: ["task.execute", "message.send"],
    });
  });

  it("allows actions inside an active mandate", () => {
    expect(
      evaluateMandateAction({
        mandate: testMandate(),
        requestedAction: "query",
        peerScope: "direct",
        requestedSensitivity: "public",
        requestedCost: { amount: 0, currency: "USD" },
        now: "2026-04-27T09:00:00.000Z",
      }),
    ).toEqual({ action: "allow" });
  });

  it("denies expired or explicitly disallowed mandate actions", () => {
    expect(
      evaluateMandateAction({
        mandate: testMandate(),
        requestedAction: "send.raw_files",
        now: "2026-04-27T09:00:00.000Z",
      }),
    ).toEqual({
      action: "deny",
      reason: "send.raw_files is explicitly disallowed",
    });
    expect(
      evaluateMandateAction({
        mandate: testMandate(),
        requestedAction: "query",
        now: "2026-04-28T10:00:00.000Z",
      }),
    ).toEqual({
      action: "deny",
      reason: "mandate has expired",
    });
  });

  it("requires owner approval for actions that exceed mandate policy", () => {
    expect(
      evaluateMandateAction({
        mandate: testMandate(),
        requestedAction: "purchase",
        now: "2026-04-27T09:00:00.000Z",
      }),
    ).toEqual({
      action: "approval_required",
      reason: "purchase is outside mandate actions",
    });
    expect(
      evaluateMandateAction({
        mandate: testMandate(),
        requestedAction: "query",
        peerScope: "public",
        now: "2026-04-27T09:00:00.000Z",
      }),
    ).toEqual({
      action: "approval_required",
      reason: "public peer scope is outside mandate",
    });
    expect(
      evaluateMandateAction({
        mandate: testMandate(),
        requestedAction: "query",
        requestedSensitivity: "friends",
        now: "2026-04-27T09:00:00.000Z",
      }),
    ).toEqual({
      action: "approval_required",
      reason: "requested sensitivity exceeds public",
    });
  });
});

describe("checkCapabilityTopicRateLimit", () => {
  it("allows queries within the rate limit window", () => {
    const peer = "rate-test-allow-peer";
    const result = checkCapabilityTopicRateLimit(peer, 5, 60_000);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it("tracks remaining count across multiple calls", () => {
    const peer = "rate-test-count-peer";
    checkCapabilityTopicRateLimit(peer, 3, 60_000);
    checkCapabilityTopicRateLimit(peer, 3, 60_000);
    const result = checkCapabilityTopicRateLimit(peer, 3, 60_000);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(0);
  });

  it("denies queries once the limit is exceeded", () => {
    const peer = "rate-test-deny-peer";
    const limit = 2;
    checkCapabilityTopicRateLimit(peer, limit, 60_000);
    checkCapabilityTopicRateLimit(peer, limit, 60_000);
    const result = checkCapabilityTopicRateLimit(peer, limit, 60_000);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("returns the correct resetAt timestamp", () => {
    const peer = "rate-test-reset-peer";
    const windowMs = 30_000;
    const before = Date.now();
    const result = checkCapabilityTopicRateLimit(peer, 10, windowMs);
    const after = Date.now();
    expect(result.resetAt).toBeGreaterThanOrEqual(before + windowMs);
    expect(result.resetAt).toBeLessThanOrEqual(after + windowMs);
  });

  it("enforces independent limits per peer", () => {
    const peerA = "rate-test-peer-a";
    const peerB = "rate-test-peer-b";
    // Exhaust peer A's limit
    checkCapabilityTopicRateLimit(peerA, 1, 60_000);
    const resultA = checkCapabilityTopicRateLimit(peerA, 1, 60_000);
    const resultB = checkCapabilityTopicRateLimit(peerB, 1, 60_000);
    expect(resultA.allowed).toBe(false);
    expect(resultB.allowed).toBe(true);
    expect(resultB.remaining).toBe(0);
  });

  it("defaults to 30 queries per 60 seconds", () => {
    const peer = "rate-test-defaults-peer";
    const r1 = checkCapabilityTopicRateLimit(peer);
    expect(r1.remaining).toBe(29);
    expect(r1.allowed).toBe(true);
  });
});

describe("checkPublicKnowledgeRateLimit", () => {
  it("allows public knowledge queries within the rate limit window", () => {
    const peer = "pub-kq-allow-peer";
    const result = checkPublicKnowledgeRateLimit(peer, 5, 60_000);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it("tracks remaining count across multiple calls", () => {
    const peer = "pub-kq-count-peer";
    checkPublicKnowledgeRateLimit(peer, 3, 60_000);
    checkPublicKnowledgeRateLimit(peer, 3, 60_000);
    const result = checkPublicKnowledgeRateLimit(peer, 3, 60_000);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(0);
  });

  it("denies queries once the limit is exceeded", () => {
    const peer = "pub-kq-deny-peer";
    const limit = 2;
    checkPublicKnowledgeRateLimit(peer, limit, 60_000);
    checkPublicKnowledgeRateLimit(peer, limit, 60_000);
    const result = checkPublicKnowledgeRateLimit(peer, limit, 60_000);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("enforces independent limits per peer (no cross-contamination with capability limiter)", () => {
    const peerA = "pub-kq-peer-a";
    const peerB = "pub-kq-peer-b";
    // Exhaust peer A's knowledge limit
    checkPublicKnowledgeRateLimit(peerA, 1, 60_000);
    const resultA = checkPublicKnowledgeRateLimit(peerA, 1, 60_000);
    const resultB = checkPublicKnowledgeRateLimit(peerB, 1, 60_000);
    expect(resultA.allowed).toBe(false);
    expect(resultB.allowed).toBe(true);
  });

  it("defaults to 5 queries per 60 seconds", () => {
    const peer = "pub-kq-defaults-peer";
    const r1 = checkPublicKnowledgeRateLimit(peer);
    expect(r1.remaining).toBe(4);
    expect(r1.allowed).toBe(true);
  });
});

function testMandate(): Mandate {
  return {
    ...createUnsignedMandate({
      ownerId: "envoy:owner:alice",
      issuedToDeviceId: "envoy:device:desktop",
      taskIntent: "find.book",
      objective: "Find a distributed systems book.",
      allowedPeerScopes: ["direct", "referred"],
      allowedActions: ["discover", "query", "negotiate", "report"],
      disallowedActions: ["send.raw_files", "share.private_data"],
      maxSensitivity: "public",
      maxCost: { amount: 0, currency: "USD" },
      expiresAt: "2026-04-28T09:00:00.000Z",
      requiresApprovalFor: ["purchase", "raw_contact_exchange"],
      mandateId: "mandate-1",
    }),
    signature: "signature",
  };
}
