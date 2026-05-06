/**
 * Phase 8L — Autonomous policy integration tests.
 *
 * Verifies that evaluateAutonomousPolicy correctly gates:
 * 1. auto_answer action — used when autonomously answering queries
 * 2. auto_send_chat action — used when autonomously sending chat messages
 *
 * These tests verify the policy evaluation in the context of what
 * knowledge-query and chat-draft handlers would pass to it.
 */

import { describe, expect, it } from "vitest";
import { evaluateAutonomousPolicy } from "../src/autonomous-inbound.js";

function makePolicy(overrides: Partial<{
  domain: "social" | "knowledge" | "home" | "research";
  maxSensitivity: "public" | "friends";
  autoAnswer: boolean;
  autoSendChat: boolean;
}> = {}) {
  return {
    domain: "social" as const,
    maxSensitivity: "friends" as const,
    autoAnswer: true,
    autoSendChat: false,
    ...overrides,
  };
}

describe("autonomous policy integration — auto_answer action", () => {
  describe("kill switch blocks auto_answer regardless of policy", () => {
    it("blocks when kill switch is true even with fully permissive policy", () => {
      const result = evaluateAutonomousPolicy({
        autonomousKillSwitch: true,
        autonomousPolicies: [
          makePolicy({ autoAnswer: true, maxSensitivity: "private" }),
        ],
        domain: "social",
        action: "auto_answer",
        requestedSensitivity: "public",
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("kill switch");
    });

    it("blocks when kill switch is true even if action is disabled in policy", () => {
      const result = evaluateAutonomousPolicy({
        autonomousKillSwitch: true,
        autonomousPolicies: [
          makePolicy({ autoAnswer: false }),
        ],
        domain: "social",
        action: "auto_answer",
        requestedSensitivity: "public",
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("kill switch");
    });
  });

  describe("auto_answer disabled blocks auto_answer", () => {
    it("blocks when autoAnswer is false in policy", () => {
      const result = evaluateAutonomousPolicy({
        autonomousKillSwitch: false,
        autonomousPolicies: [
          makePolicy({ autoAnswer: false }),
        ],
        domain: "social",
        action: "auto_answer",
        requestedSensitivity: "public",
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("auto_answer is disabled");
    });

    it("allows when autoAnswer is true", () => {
      const result = evaluateAutonomousPolicy({
        autonomousKillSwitch: false,
        autonomousPolicies: [
          makePolicy({ autoAnswer: true }),
        ],
        domain: "social",
        action: "auto_answer",
        requestedSensitivity: "public",
      });
      expect(result.allowed).toBe(true);
    });
  });

  describe("sensitivity ceiling for auto_answer", () => {
    it("allows public when ceiling is friends", () => {
      const result = evaluateAutonomousPolicy({
        autonomousKillSwitch: false,
        autonomousPolicies: [
          makePolicy({ maxSensitivity: "friends", autoAnswer: true }),
        ],
        domain: "social",
        action: "auto_answer",
        requestedSensitivity: "public",
      });
      expect(result.allowed).toBe(true);
    });

    it("allows friends when ceiling is friends", () => {
      const result = evaluateAutonomousPolicy({
        autonomousKillSwitch: false,
        autonomousPolicies: [
          makePolicy({ maxSensitivity: "friends", autoAnswer: true }),
        ],
        domain: "social",
        action: "auto_answer",
        requestedSensitivity: "friends",
      });
      expect(result.allowed).toBe(true);
    });

    it("blocks friends when ceiling is public", () => {
      const result = evaluateAutonomousPolicy({
        autonomousKillSwitch: false,
        autonomousPolicies: [
          makePolicy({ maxSensitivity: "public", autoAnswer: true }),
        ],
        domain: "social",
        action: "auto_answer",
        requestedSensitivity: "friends",
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("exceeds");
    });

    it("blocks private when ceiling is public", () => {
      const result = evaluateAutonomousPolicy({
        autonomousKillSwitch: false,
        autonomousPolicies: [
          makePolicy({ maxSensitivity: "public", autoAnswer: true }),
        ],
        domain: "social",
        action: "auto_answer",
        requestedSensitivity: "private",
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("exceeds");
    });

    it("blocks private when ceiling is friends", () => {
      const result = evaluateAutonomousPolicy({
        autonomousKillSwitch: false,
        autonomousPolicies: [
          makePolicy({ maxSensitivity: "friends", autoAnswer: true }),
        ],
        domain: "social",
        action: "auto_answer",
        requestedSensitivity: "private",
      });
      expect(result.allowed).toBe(false);
    });
  });

  describe("domain matching for auto_answer", () => {
    it("blocks when no policy exists for the domain", () => {
      const result = evaluateAutonomousPolicy({
        autonomousKillSwitch: false,
        autonomousPolicies: [
          makePolicy({ domain: "knowledge" }),
        ],
        domain: "social",
        action: "auto_answer",
        requestedSensitivity: "public",
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("no autonomous policy configured");
    });

    it("allows when matching policy exists for the domain", () => {
      const result = evaluateAutonomousPolicy({
        autonomousKillSwitch: false,
        autonomousPolicies: [
          makePolicy({ domain: "social", autoAnswer: true }),
        ],
        domain: "social",
        action: "auto_answer",
        requestedSensitivity: "public",
      });
      expect(result.allowed).toBe(true);
    });

    it("uses first matching domain policy", () => {
      // Two policies for the same domain - first one wins
      const result = evaluateAutonomousPolicy({
        autonomousKillSwitch: false,
        autonomousPolicies: [
          makePolicy({ domain: "social", autoAnswer: true }),
          makePolicy({ domain: "social", autoAnswer: false }),
        ],
        domain: "social",
        action: "auto_answer",
        requestedSensitivity: "public",
      });
      expect(result.allowed).toBe(true);
    });
  });
});

describe("autonomous policy integration — auto_send_chat action", () => {
  describe("kill switch blocks auto_send_chat", () => {
    it("blocks when kill switch is true", () => {
      const result = evaluateAutonomousPolicy({
        autonomousKillSwitch: true,
        autonomousPolicies: [
          makePolicy({ autoSendChat: true }),
        ],
        domain: "social",
        action: "auto_send_chat",
        requestedSensitivity: "public",
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("kill switch");
    });
  });

  describe("auto_send_chat disabled blocks auto_send_chat", () => {
    it("blocks when autoSendChat is false", () => {
      const result = evaluateAutonomousPolicy({
        autonomousKillSwitch: false,
        autonomousPolicies: [
          makePolicy({ autoSendChat: false }),
        ],
        domain: "social",
        action: "auto_send_chat",
        requestedSensitivity: "public",
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("auto_send_chat is disabled");
    });

    it("allows when autoSendChat is true", () => {
      const result = evaluateAutonomousPolicy({
        autonomousKillSwitch: false,
        autonomousPolicies: [
          makePolicy({ autoSendChat: true }),
        ],
        domain: "social",
        action: "auto_send_chat",
        requestedSensitivity: "public",
      });
      expect(result.allowed).toBe(true);
    });
  });

  describe("sensitivity ceiling for auto_send_chat", () => {
    it("allows public when ceiling is friends", () => {
      const result = evaluateAutonomousPolicy({
        autonomousKillSwitch: false,
        autonomousPolicies: [
          makePolicy({ maxSensitivity: "friends", autoSendChat: true }),
        ],
        domain: "social",
        action: "auto_send_chat",
        requestedSensitivity: "public",
      });
      expect(result.allowed).toBe(true);
    });

    it("blocks friends when ceiling is public", () => {
      const result = evaluateAutonomousPolicy({
        autonomousKillSwitch: false,
        autonomousPolicies: [
          makePolicy({ maxSensitivity: "public", autoSendChat: true }),
        ],
        domain: "social",
        action: "auto_send_chat",
        requestedSensitivity: "friends",
      });
      expect(result.allowed).toBe(false);
    });
  });
});

describe("autonomous policy integration — all four domains", () => {
  const allDomains: Array<"social" | "knowledge" | "home" | "research"> = [
    "social",
    "knowledge",
    "home",
    "research",
  ];

  it("allows auto_answer for knowledge domain when enabled", () => {
    const result = evaluateAutonomousPolicy({
      autonomousKillSwitch: false,
      autonomousPolicies: [
        makePolicy({ domain: "knowledge", autoAnswer: true, maxSensitivity: "friends" }),
      ],
      domain: "knowledge",
      action: "auto_answer",
      requestedSensitivity: "public",
    });
    expect(result.allowed).toBe(true);
    expect(result.domain).toBe("knowledge");
  });

  it("allows auto_answer for home domain when enabled", () => {
    const result = evaluateAutonomousPolicy({
      autonomousKillSwitch: false,
      autonomousPolicies: [
        makePolicy({ domain: "home", autoAnswer: true, maxSensitivity: "private" }),
      ],
      domain: "home",
      action: "auto_answer",
      requestedSensitivity: "public",
    });
    expect(result.allowed).toBe(true);
  });

  it("allows auto_answer for research domain when enabled", () => {
    const result = evaluateAutonomousPolicy({
      autonomousKillSwitch: false,
      autonomousPolicies: [
        makePolicy({ domain: "research", autoAnswer: true, maxSensitivity: "friends" }),
      ],
      domain: "research",
      action: "auto_answer",
      requestedSensitivity: "public",
    });
    expect(result.allowed).toBe(true);
  });

  it("blocks auto_answer for any domain when no policy exists", () => {
    for (const domain of allDomains) {
      const result = evaluateAutonomousPolicy({
        autonomousKillSwitch: false,
        autonomousPolicies: [], // empty
        domain,
        action: "auto_answer",
        requestedSensitivity: "public",
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("no autonomous policy configured");
    }
  });
});

describe("autonomous policy integration — knowledge query context", () => {
  // In the knowledge-query handler, the sensitivity is determined by bond level:
  // - public bond -> requestedSensitivity = "public"
  // - referred/direct bond -> requestedSensitivity = "friends"
  // The autonomous policy must allow this sensitivity for auto_answer

  it("allows auto_answer for knowledge query from direct bond (friends ceiling)", () => {
    const result = evaluateAutonomousPolicy({
      autonomousKillSwitch: false,
      autonomousPolicies: [
        makePolicy({ domain: "knowledge", autoAnswer: true, maxSensitivity: "friends" }),
      ],
      domain: "knowledge",
      action: "auto_answer",
      requestedSensitivity: "friends", // direct/referred bond
    });
    expect(result.allowed).toBe(true);
  });

  it("blocks auto_answer for knowledge query from stranger (public only)", () => {
    const result = evaluateAutonomousPolicy({
      autonomousKillSwitch: false,
      autonomousPolicies: [
        makePolicy({ domain: "knowledge", autoAnswer: true, maxSensitivity: "public" }),
      ],
      domain: "knowledge",
      action: "auto_answer",
      requestedSensitivity: "friends", // but stranger only gets public
    });
    expect(result.allowed).toBe(false);
  });

  it("allows auto_answer for knowledge query when no bond required (public)", () => {
    const result = evaluateAutonomousPolicy({
      autonomousKillSwitch: false,
      autonomousPolicies: [
        makePolicy({ domain: "knowledge", autoAnswer: true, maxSensitivity: "public" }),
      ],
      domain: "knowledge",
      action: "auto_answer",
      requestedSensitivity: "public",
    });
    expect(result.allowed).toBe(true);
  });
});

describe("autonomous policy integration — chat draft context", () => {
  // Chat draft uses sensitivity based on bond level, same as knowledge query.
  // auto_answer action determines whether a draft can be auto-generated.

  it("allows auto_answer for chat draft from direct bond", () => {
    const result = evaluateAutonomousPolicy({
      autonomousKillSwitch: false,
      autonomousPolicies: [
        makePolicy({ domain: "social", autoAnswer: true, maxSensitivity: "friends" }),
      ],
      domain: "social",
      action: "auto_answer",
      requestedSensitivity: "friends",
    });
    expect(result.allowed).toBe(true);
  });

  it("blocks auto_answer for chat draft when kill switch is on", () => {
    const result = evaluateAutonomousPolicy({
      autonomousKillSwitch: true,
      autonomousPolicies: [
        makePolicy({ domain: "social", autoAnswer: true, maxSensitivity: "friends" }),
      ],
      domain: "social",
      action: "auto_answer",
      requestedSensitivity: "friends",
    });
    expect(result.allowed).toBe(false);
  });

  it("blocks auto_answer when social domain has no policy", () => {
    const result = evaluateAutonomousPolicy({
      autonomousKillSwitch: false,
      autonomousPolicies: [
        makePolicy({ domain: "knowledge", autoAnswer: true }),
      ],
      domain: "social",
      action: "auto_answer",
      requestedSensitivity: "public",
    });
    expect(result.allowed).toBe(false);
  });
});

describe("autonomous policy — returns correct shape", () => {
  it("returns { allowed: true, domain, action } on success", () => {
    const result = evaluateAutonomousPolicy({
      autonomousKillSwitch: false,
      autonomousPolicies: [makePolicy({ autoAnswer: true })],
      domain: "social",
      action: "auto_answer",
      requestedSensitivity: "public",
    });
    expect(result).toEqual({
      allowed: true,
      domain: "social",
      action: "auto_answer",
    });
  });

  it("returns { allowed: false, reason: string } on failure", () => {
    const result = evaluateAutonomousPolicy({
      autonomousKillSwitch: false,
      autonomousPolicies: [makePolicy({ autoAnswer: false })],
      domain: "social",
      action: "auto_answer",
      requestedSensitivity: "public",
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBeDefined();
    expect(typeof result.reason).toBe("string");
  });
});
