import { describe, expect, it } from "vitest";
import {
  evaluateAutonomousPolicy,
  type AutonomousAction,
} from "../src/autonomous-inbound.js";

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

describe("evaluateAutonomousPolicy", () => {
  it("allows action when kill switch is false and policy permits", () => {
    const result = evaluateAutonomousPolicy({
      autonomousKillSwitch: false,
      autonomousPolicies: [makePolicy()],
      domain: "social",
      action: "auto_answer",
      requestedSensitivity: "public",
    });
    expect(result).toEqual({ allowed: true, domain: "social", action: "auto_answer" });
  });

  it("blocks all actions when kill switch is true", () => {
    const result = evaluateAutonomousPolicy({
      autonomousKillSwitch: true,
      autonomousPolicies: [makePolicy()],
      domain: "social",
      action: "auto_answer",
      requestedSensitivity: "public",
    });
    expect(result).toEqual({
      allowed: false,
      reason: "autonomous kill switch is active; all autonomous actions are paused",
    });
  });

  it("blocks when no policy exists for the domain", () => {
    const result = evaluateAutonomousPolicy({
      autonomousKillSwitch: false,
      autonomousPolicies: [makePolicy({ domain: "knowledge" })],
      domain: "social",
      action: "auto_answer",
      requestedSensitivity: "public",
    });
    expect(result).toEqual({
      allowed: false,
      reason: 'no autonomous policy configured for domain "social"; approval required',
    });
  });

  it("blocks when auto_answer is disabled in policy", () => {
    const result = evaluateAutonomousPolicy({
      autonomousKillSwitch: false,
      autonomousPolicies: [makePolicy({ autoAnswer: false })],
      domain: "social",
      action: "auto_answer",
      requestedSensitivity: "public",
    });
    expect(result).toEqual({
      allowed: false,
      reason: 'autonomous auto_answer is disabled for domain "social"; approval required',
    });
  });

  it("blocks when auto_send_chat is disabled in policy", () => {
    const result = evaluateAutonomousPolicy({
      autonomousKillSwitch: false,
      autonomousPolicies: [makePolicy({ autoSendChat: false })],
      domain: "social",
      action: "auto_send_chat",
      requestedSensitivity: "public",
    });
    expect(result).toEqual({
      allowed: false,
      reason: 'autonomous auto_send_chat is disabled for domain "social"; approval required',
    });
  });

  it("allows when requested sensitivity is at the ceiling", () => {
    const result = evaluateAutonomousPolicy({
      autonomousKillSwitch: false,
      autonomousPolicies: [makePolicy({ maxSensitivity: "friends" })],
      domain: "social",
      action: "auto_answer",
      requestedSensitivity: "friends",
    });
    expect(result).toEqual({ allowed: true, domain: "social", action: "auto_answer" });
  });

  it("blocks when requested sensitivity exceeds ceiling (public ceiling, friends requested)", () => {
    const result = evaluateAutonomousPolicy({
      autonomousKillSwitch: false,
      autonomousPolicies: [makePolicy({ maxSensitivity: "public" })],
      domain: "social",
      action: "auto_answer",
      requestedSensitivity: "friends",
    });
    expect(result).toEqual({
      allowed: false,
      reason: 'requested sensitivity "friends" exceeds domain "social" ceiling "public"; approval required',
    });
  });

  it("blocks when requested sensitivity is private but ceiling is friends", () => {
    const result = evaluateAutonomousPolicy({
      autonomousKillSwitch: false,
      autonomousPolicies: [makePolicy({ maxSensitivity: "friends" })],
      domain: "social",
      action: "auto_answer",
      requestedSensitivity: "private",
    });
    expect(result).toEqual({
      allowed: false,
      reason: 'requested sensitivity "private" exceeds domain "social" ceiling "friends"; approval required',
    });
  });

  it("allows public sensitivity with friends ceiling", () => {
    const result = evaluateAutonomousPolicy({
      autonomousKillSwitch: false,
      autonomousPolicies: [makePolicy({ maxSensitivity: "friends" })],
      domain: "social",
      action: "auto_answer",
      requestedSensitivity: "public",
    });
    expect(result).toEqual({ allowed: true, domain: "social", action: "auto_answer" });
  });

  it("allows auto_send_chat when policy enables it", () => {
    const result = evaluateAutonomousPolicy({
      autonomousKillSwitch: false,
      autonomousPolicies: [makePolicy({ autoSendChat: true })],
      domain: "social",
      action: "auto_send_chat",
      requestedSensitivity: "public",
    });
    expect(result).toEqual({ allowed: true, domain: "social", action: "auto_send_chat" });
  });

  it("uses first matching domain policy", () => {
    const policies = [
      makePolicy({ domain: "knowledge", autoAnswer: true }),
      makePolicy({ domain: "social", autoAnswer: false }),
    ];
    const result = evaluateAutonomousPolicy({
      autonomousKillSwitch: false,
      autonomousPolicies: policies,
      domain: "social",
      action: "auto_answer",
      requestedSensitivity: "public",
    });
    // First matching domain is "knowledge", but action is for "social" — will find "social" which is disabled
    expect(result.allowed).toBe(false);
  });

  it("returns allowed for knowledge domain with matching policy", () => {
    const result = evaluateAutonomousPolicy({
      autonomousKillSwitch: false,
      autonomousPolicies: [
        makePolicy({ domain: "knowledge", maxSensitivity: "friends", autoAnswer: true }),
      ],
      domain: "knowledge",
      action: "auto_answer",
      requestedSensitivity: "friends",
    });
    expect(result).toEqual({ allowed: true, domain: "knowledge", action: "auto_answer" });
  });

  it("returns allowed for home domain with matching policy", () => {
    const result = evaluateAutonomousPolicy({
      autonomousKillSwitch: false,
      autonomousPolicies: [
        makePolicy({ domain: "home", maxSensitivity: "public", autoAnswer: true }),
      ],
      domain: "home",
      action: "auto_answer",
      requestedSensitivity: "public",
    });
    expect(result).toEqual({ allowed: true, domain: "home", action: "auto_answer" });
  });

  it("returns allowed for research domain with matching policy", () => {
    const result = evaluateAutonomousPolicy({
      autonomousKillSwitch: false,
      autonomousPolicies: [
        makePolicy({ domain: "research", maxSensitivity: "friends", autoAnswer: true }),
      ],
      domain: "research",
      action: "auto_answer",
      requestedSensitivity: "public",
    });
    expect(result).toEqual({ allowed: true, domain: "research", action: "auto_answer" });
  });

  it("kill switch takes precedence over domain policy", () => {
    // Even with a fully permissive policy, kill switch should block
    const result = evaluateAutonomousPolicy({
      autonomousKillSwitch: true,
      autonomousPolicies: [
        makePolicy({ autoAnswer: true, autoSendChat: true }),
      ],
      domain: "social",
      action: "auto_send_chat",
      requestedSensitivity: "public",
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("kill switch");
  });
});
