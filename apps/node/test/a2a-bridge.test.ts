/**
 * Phase 48C — A2A Agent Card Bridge tests.
 *
 * Verifies field translation between EnvoyMesh Agent Cards and the
 * A2A v1.0 standard format, plus the HTTP handler's status-code
 * behavior (404 when no card, 200 with card, 405 on non-GET).
 */

import { describe, expect, it, vi } from "vitest";
import { generateEd25519KeyPair } from "@envoymesh/identity";
import {
  toA2AAgentCard,
  withA2AAgentCardSignature,
  verifyA2AAgentCardSignature,
} from "@envoymesh/api";
import {
  handleA2AAgentCardRequest,
  type EnvoyAgentCard,
} from "../src/a2a-bridge.js";

const BASE_ENVOY_CARD: EnvoyAgentCard = {
  version: "0.1.0",
  ownerId: "envoy:owner:abc123def456abc123def456abc123def456abc123def456abc123de",
  displayName: "Atlas",
  nodeProfile: "home-desktop",
  membership: ["chat", "knowledge.query", "task.execute"],
  publicTopics: ["books", "rust"],
  trustPolicySummary: {
    acceptsDirectBondRequests: true,
    acceptsReferralRequests: false,
    requiresHumanApprovalForRawFiles: true,
  },
  supportedProtocolVersions: ["0.1"],
  agentNetworkProfile: {
    skills: ["chat", "rust"],
    spendPosture: "balanced",
    contextWindow: "200k",
    throughputTokensPerSec: 80,
  },
};

describe("a2a-bridge: toA2AAgentCard", () => {
  it("translates displayName → name", () => {
    const card = toA2AAgentCard(BASE_ENVOY_CARD, "https://relay.example.com");
    expect(card.name).toBe("Atlas");
  });

  it("translates mesh capabilities and skills → distinct skills", () => {
    const card = toA2AAgentCard(BASE_ENVOY_CARD, "https://relay.example.com");
    const ids = card.skills.map((s) => s.id);
    expect(ids).toContain("chat");
    expect(ids).toContain("knowledge.query");
    expect(ids).toContain("task.execute");
    // Skill-only tags appear even when not in mesh membership.
    expect(ids).toContain("rust");

    const chatSkill = card.skills.find((s) => s.id === "chat");
    expect(chatSkill?.tags).toContain("skill");
    expect(chatSkill?.tags).toContain("membership");
    expect(chatSkill?.tags).toContain("domain");
    expect(chatSkill?.tags).toContain("owner");

    const rustSkill = card.skills.find((s) => s.id === "rust");
    expect(rustSkill?.tags).toContain("skill");
    expect(rustSkill?.tags).toContain("domain");
    expect(rustSkill?.tags).toContain("owner");
    expect(rustSkill?.tags).not.toContain("membership");

    const taskSkill = card.skills.find((s) => s.id === "task.execute");
    expect(taskSkill?.tags).not.toContain("skill");
    expect(taskSkill?.tags).toContain("membership");
  });

  it("appends web-content skill when webContentRoot is present", () => {
    const card = toA2AAgentCard(
      { ...BASE_ENVOY_CARD, webContentRoot: "https://atlas.example.com/content" },
      "https://relay.example.com",
    );
    const webSkill = card.skills.find((s) => s.id === "web-content");
    expect(webSkill).toBeDefined();
    expect(webSkill?.tags).toContain("web");
  });

  it("does not append web-content skill when webContentRoot is absent", () => {
    const card = toA2AAgentCard(BASE_ENVOY_CARD, "https://relay.example.com");
    expect(card.skills.find((s) => s.id === "web-content")).toBeUndefined();
  });

  it("emits capabilities.streaming=true (48D.5 message/stream)", () => {
    const card = toA2AAgentCard(BASE_ENVOY_CARD, "https://relay.example.com");
    expect(card.capabilities.streaming).toBe(true);
    expect(card.capabilities.pushNotifications).toBe(false);
  });

  it("withA2AAgentCardSignature / verify round-trip (48D.5)", () => {
    const keys = generateEd25519KeyPair();
    const card = toA2AAgentCard(BASE_ENVOY_CARD, "https://relay.example.com");
    const signed = withA2AAgentCardSignature(card, {
      privateKeyPem: keys.privateKeyPem,
      publicKeyPem: keys.publicKeyPem,
      keyId: "test-key",
    });
    expect(signed.signatures?.[0]?.type).toBe("envoymesh-ed25519");
    expect(verifyA2AAgentCardSignature(signed, keys.publicKeyPem)).toBe(true);
    const other = generateEd25519KeyPair();
    expect(verifyA2AAgentCardSignature(signed, other.publicKeyPem)).toBe(false);
  });

  it("emits supportedInterfaces with the A2A JSON-RPC gateway path", () => {
    const card = toA2AAgentCard(BASE_ENVOY_CARD, "https://relay.example.com:15432");
    expect(card.supportedInterfaces).toEqual([
      {
        protocolVersion: "1.0",
        protocolBinding: "jsonrpc",
        url: "https://relay.example.com:15432/.well-known/a2a/jsonrpc",
      },
    ]);
  });

  it("emits Bearer security scheme (capitalized per RFC 9110)", () => {
    const card = toA2AAgentCard(BASE_ENVOY_CARD, "https://relay.example.com");
    expect(card.securitySchemes).toEqual({
      Bearer: { type: "http", scheme: "bearer" },
    });
    expect(card.security).toEqual([{ Bearer: [] }]);
  });

  it("includes x-envoymesh-* keys in metadata (no leaked plaintext ownerId)", () => {
    const card = toA2AAgentCard(BASE_ENVOY_CARD, "https://relay.example.com");
    expect(card.metadata?.["x-envoymesh-nodeProfile"]).toBe("home-desktop");
    expect(card.metadata?.["x-envoymesh-ownerId"]).toBe(BASE_ENVOY_CARD.ownerId);
    expect(card.description).not.toContain(BASE_ENVOY_CARD.ownerId);
    expect((card.metadata?.["x-envoymesh-agentNetworkProfile"] as Record<string, unknown> | undefined)?.skills)
      .toEqual([
        { id: "chat", kind: "domain", source: "owner" },
        { id: "rust", kind: "domain", source: "owner" },
      ]);
  });

  it("uses default version when no override given", () => {
    const card = toA2AAgentCard(BASE_ENVOY_CARD, "https://relay.example.com");
    expect(card.version).toBe("0.1.0");
  });

  it("respects options.nodeVersion override", () => {
    const card = toA2AAgentCard(BASE_ENVOY_CARD, "https://relay.example.com", {
      nodeVersion: "1.2.3",
    });
    expect(card.version).toBe("1.2.3");
  });

  it("respects options.description override", () => {
    const card = toA2AAgentCard(BASE_ENVOY_CARD, "https://relay.example.com", {
      description: "My custom description",
    });
    expect(card.description).toBe("My custom description");
  });

  it("falls back to default description (without ownerId leakage)", () => {
    const card = toA2AAgentCard(BASE_ENVOY_CARD, "https://relay.example.com");
    expect(card.description).toContain("EnvoyMesh agent node");
    expect(card.description).toContain("home-desktop");
    expect(card.description).not.toContain(BASE_ENVOY_CARD.ownerId);
  });

  it("handles agentNetworkProfile absent", () => {
    const card = toA2AAgentCard(
      { ...BASE_ENVOY_CARD, agentNetworkProfile: undefined },
      "https://relay.example.com",
    );
    // Mesh capabilities still become skills; none get the "skill" tag.
    const skill = card.skills.find((s) => s.id === "chat");
    expect(skill?.tags).toEqual(["chat", "membership"]);
    expect(card.skills.find((s) => s.id === "rust")).toBeUndefined();
    expect((card.metadata?.agentNetworkProfile as unknown)).toBeUndefined();
  });
});

describe("a2a-bridge: handleA2AAgentCardRequest", () => {
  function mockRes() {
    const headers: Record<string, string> = {};
    let body = "";
    return {
      writeHead: vi.fn((status: number, h?: Record<string, string>) => {
        headers.status = String(status);
        if (h) Object.assign(headers, h);
      }),
      end: vi.fn((data: string) => { body = data; }),
      get status() { return headers.status; },
      get headers() { return headers; },
      get body() { return body; },
    };
  }

  it("returns 200 + JSON card on GET with a card", async () => {
    const res = mockRes();
    await handleA2AAgentCardRequest(
      { method: "GET", url: "/.well-known/agent-card.json" },
      res,
      BASE_ENVOY_CARD,
      "https://relay.example.com",
    );
    expect(res.status).toBe("200");
    expect(res.headers["Content-Type"]).toBe("application/json");
    const parsed = JSON.parse(res.body);
    expect(parsed.name).toBe("Atlas");
    expect(parsed.supportedInterfaces[0].url).toBe("https://relay.example.com/.well-known/a2a/jsonrpc");
  });

  it("returns 405 on non-GET", async () => {
    const res = mockRes();
    await handleA2AAgentCardRequest(
      { method: "POST", url: "/.well-known/agent-card.json" },
      res,
      BASE_ENVOY_CARD,
      "https://relay.example.com",
    );
    expect(res.status).toBe("405");
    expect(res.headers["Allow"]).toBe("GET, OPTIONS");
    expect(JSON.parse(res.body).error).toMatch(/method/i);
  });

  it("returns 204 + CORS headers on OPTIONS preflight", async () => {
    const res = mockRes();
    await handleA2AAgentCardRequest(
      { method: "OPTIONS", url: "/.well-known/agent-card.json" },
      res,
      BASE_ENVOY_CARD,
      "https://relay.example.com",
    );
    expect(res.status).toBe("204");
    expect(res.headers["Access-Control-Allow-Origin"]).toBe("*");
    expect(res.headers["Access-Control-Allow-Methods"]).toBe("GET, OPTIONS");
  });

  it("returns 503 when envoyCard is null (node not initialized)", async () => {
    const res = mockRes();
    await handleA2AAgentCardRequest(
      { method: "GET", url: "/.well-known/agent-card.json" },
      res,
      null,
      "https://relay.example.com",
    );
    expect(res.status).toBe("503");
    expect(JSON.parse(res.body).error).toMatch(/not available/i);
  });

  it("sets CORS + cache headers on success", async () => {
    const res = mockRes();
    await handleA2AAgentCardRequest(
      { method: "GET", url: "/.well-known/agent-card.json" },
      res,
      BASE_ENVOY_CARD,
      "https://relay.example.com",
    );
    expect(res.headers["Access-Control-Allow-Origin"]).toBe("*");
    expect(res.headers["Cache-Control"]).toBe("public, max-age=300");
  });
});