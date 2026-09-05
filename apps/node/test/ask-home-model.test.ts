/**
 * Unit tests for the EM-3 `askHomeModel` pure helpers: providerMode derivation
 * from a providerId and the routing-decision → catalog-token error mapping.
 * (The full handler lives in NodeServiceImpl.askHomeModel and is covered by
 * typecheck + the router/owner-gate and model-call seam tests.)
 */
import { describe, expect, it } from "vitest";
import {
  deriveHomeModelProviderMode,
  homeModelRoutingError,
} from "../src/ask-home-model.js";

describe("deriveHomeModelProviderMode", () => {
  it("maps known buildModelProviders providerIds to canonical modes", () => {
    expect(deriveHomeModelProviderMode("local.envoy-local")).toBe("envoy-local");
    expect(deriveHomeModelProviderMode("local.ollama.llama3.1")).toBe("ollama");
    expect(deriveHomeModelProviderMode("cloud.openai-compatible")).toBe(
      "openai-compatible",
    );
    expect(deriveHomeModelProviderMode("cloud.anthropic-compatible")).toBe("cloud");
    expect(deriveHomeModelProviderMode("cloud.gpt-4o-mini")).toBe("cloud");
    expect(deriveHomeModelProviderMode("local.mock")).toBe("mock");
    expect(deriveHomeModelProviderMode("cloud.mock")).toBe("mock");
    expect(deriveHomeModelProviderMode("peer.mock")).toBe("mock");
  });

  it("returns undefined for unrecognized providerIds and for undefined", () => {
    expect(deriveHomeModelProviderMode("local.custom-thing")).toBeUndefined();
    expect(deriveHomeModelProviderMode(undefined)).toBeUndefined();
  });
});

describe("homeModelRoutingError", () => {
  it("maps approval_required to cloud-approval-needed", () => {
    const err = homeModelRoutingError({
      action: "approval_required",
      reason: "private context exceeds cloud.openai policy",
      provider: {
        providerId: "cloud.openai",
        providerType: "cloud",
        enabled: true,
        allowedSensitivity: ["public"],
        allowedTaskTypes: ["*"],
        requiresOwnerApproval: true,
      },
    });
    expect(err).toBeInstanceOf(Error);
    expect(err!.message.startsWith("cloud-approval-needed:")).toBe(true);
  });

  it("maps semantic_firewall denials to semantic-firewall", () => {
    const err = homeModelRoutingError({
      action: "deny",
      reason: "semantic_firewall: prompt is empty",
    });
    expect(err!.message.startsWith("semantic-firewall:")).toBe(true);
    expect(err!.message).toContain("prompt is empty");
  });

  it("maps oversized prompts to prompt-too-large", () => {
    const err = homeModelRoutingError({
      action: "deny",
      reason: "semantic_firewall: prompt exceeds max length (48000)",
    });
    expect(err!.message.startsWith("prompt-too-large:")).toBe(true);
  });

  it("returns undefined for allow and ordinary denials (handler reports model-not-configured)", () => {
    expect(
      homeModelRoutingError({
        action: "allow",
        provider: {
          providerId: "local.mock",
          providerType: "local",
          enabled: true,
          allowedSensitivity: ["public", "friends", "trusted", "private"],
          allowedTaskTypes: ["*"],
          requiresOwnerApproval: false,
        },
      }),
    ).toBeUndefined();
    expect(
      homeModelRoutingError({
        action: "deny",
        reason: "no model providers available",
      }),
    ).toBeUndefined();
  });
});
