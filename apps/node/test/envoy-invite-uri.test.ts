import { describe, expect, it } from "vitest";
import {
  getPairingUriForInvite,
  parseEnvoyInviteUri,
} from "../src/envoy-invite-uri.js";
import type { CompanyInviteRecord } from "@envoymesh/api";

const baseInvite: CompanyInviteRecord = {
  inviteId: "abc",
  token: "tok-xyz",
  ownerId: "envoy:owner:self",
  wsUrl: "ws://localhost:3030/ws",
  lanWsUrl: "ws://192.168.1.5:3030/ws",
  relayWsUrl: "wss://relay.example.com",
  agentPeerId: "envoy_agent:1",
  agentName: "agent",
  homeNodePeerId: "envoy_home:1",
  createdAt: "2024-01-01T00:00:00.000Z",
  expiresAt: "2024-01-08T00:00:00.000Z",
};

describe("getPairingUriForInvite", () => {
  it("emits an envoy://invite URI with all known fields", () => {
    const uri = getPairingUriForInvite(baseInvite);
    expect(uri.startsWith("envoy://invite?")).toBe(true);
    expect(uri).toContain("token=tok-xyz");
    expect(uri).toContain("wsUrl=ws%3A%2F%2Flocalhost%3A3030%2Fws");
    expect(uri).toContain("ownerId=envoy%3Aowner%3Aself");
  });

  it("omits optional fields when not provided", () => {
    const uri = getPairingUriForInvite({
      ...baseInvite,
      lanWsUrl: undefined,
      relayWsUrl: undefined,
      agentPeerId: undefined,
      agentName: undefined,
      homeNodePeerId: undefined,
    });
    expect(uri).not.toContain("lanWsUrl=");
    expect(uri).not.toContain("relayWsUrl=");
    expect(uri).not.toContain("agentPeerId=");
    expect(uri).not.toContain("homeNodePeerId=");
  });
});

describe("parseEnvoyInviteUri", () => {
  it("round-trips through the URI", () => {
    const uri = getPairingUriForInvite(baseInvite);
    const parsed = parseEnvoyInviteUri(uri);
    expect(parsed.token).toBe(baseInvite.token);
    expect(parsed.wsUrl).toBe(baseInvite.wsUrl);
    expect(parsed.lanWsUrl).toBe(baseInvite.lanWsUrl);
    expect(parsed.ownerId).toBe(baseInvite.ownerId);
    expect(parsed.agentPeerId).toBe(baseInvite.agentPeerId);
  });

  it("accepts a raw query string with no envoy:// scheme", () => {
    const parsed = parseEnvoyInviteUri("invite?token=tok-xyz&wsUrl=ws%3A%2F%2Fhost");
    expect(parsed.token).toBe("tok-xyz");
    expect(parsed.wsUrl).toBe("ws://host");
  });

  it("rejects input without a token", () => {
    expect(() => parseEnvoyInviteUri("envoy://invite?wsUrl=ws%3A%2F%2Fhost")).toThrow(/token/);
  });

  it("rejects input without a wsUrl", () => {
    expect(() => parseEnvoyInviteUri("envoy://invite?token=tok-xyz")).toThrow(/wsUrl/);
  });

  it("rejects empty input", () => {
    expect(() => parseEnvoyInviteUri("")).toThrow(/empty/);
  });
});
