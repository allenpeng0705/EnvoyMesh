import { describe, expect, it } from "vitest";
import {
  defaultSocialAutonomousPolicy,
  ensureDefaultAutonomousPoliciesForModel,
  isModelProviderConfigured,
} from "../src/autonomous-policy.js";

describe("isModelProviderConfigured", () => {
  it("treats disabled as not configured", () => {
    expect(isModelProviderConfigured("disabled")).toBe(false);
    expect(isModelProviderConfigured(undefined)).toBe(false);
  });

  it("treats mock and remote modes as configured", () => {
    expect(isModelProviderConfigured("mock")).toBe(true);
    expect(isModelProviderConfigured("ollama")).toBe(true);
  });
});

describe("ensureDefaultAutonomousPoliciesForModel", () => {
  it("adds social auto-send policy when model is configured and none exists", () => {
    const policies = ensureDefaultAutonomousPoliciesForModel([], "ollama");
    expect(policies).toEqual([defaultSocialAutonomousPolicy()]);
  });

  it("does nothing when model is disabled", () => {
    expect(ensureDefaultAutonomousPoliciesForModel([], "disabled")).toEqual([]);
  });

  it("preserves existing social policy including user opt-out", () => {
    const existing = [
      {
        domain: "social" as const,
        maxSensitivity: "friends" as const,
        autoAnswer: false,
        autoSendChat: false,
      },
    ];
    expect(ensureDefaultAutonomousPoliciesForModel(existing, "mock")).toEqual(existing);
  });
});
