/**
 * Phase 51 — profile-scoped chat:message WS routing.
 */
import { describe, expect, it } from "vitest";
import { resolveChatMessageTargetProfiles } from "../src/ws-server.js";

describe("resolveChatMessageTargetProfiles", () => {
  it("routes family DM to both members", () => {
    const targets = resolveChatMessageTargetProfiles({
      sender: { ownerId: "dad" },
      recipient: { ownerId: "family:dad:mom" },
    });
    expect(targets.sort()).toEqual(["dad", "mom"]);
  });

  it("routes namespaced EnvoyAI to one profile", () => {
    expect(
      resolveChatMessageTargetProfiles({
        sender: { ownerId: "__envoy_ai__:mom" },
        recipient: { ownerId: "envoy:owner:x" },
      }),
    ).toEqual(["mom"]);
  });

  it("routes bot threads by profile suffix", () => {
    expect(
      resolveChatMessageTargetProfiles({
        sender: { ownerId: "bot:luna:alex" },
        recipient: { ownerId: "envoy:owner:x" },
      }),
    ).toEqual(["alex"]);
  });

  it("returns empty for mesh DMs (owner-only fallback)", () => {
    expect(
      resolveChatMessageTargetProfiles({
        sender: { ownerId: "envoy:owner:bob" },
        recipient: { ownerId: "envoy:owner:alice" },
      }),
    ).toEqual([]);
  });
});
