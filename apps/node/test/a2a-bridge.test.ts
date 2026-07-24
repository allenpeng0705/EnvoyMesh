/**
 * Phase 48C — A2A Agent Card Bridge tests.
 *
 * Verifies field translation between EnvoyMesh Agent Cards and the
 * A2A v1.0 standard format, plus the HTTP handler's status-code
 * behavior (404 when no card, 200 with card, 405 on non-GET).
 */

import { describe, expect, it, vi } from "vitest";
import {
  handleA2AAgentCardRequest,
  toA2AAgentCard,
  type EnvoyAgentCard,
} from "../src/a2a-bridge.js";

const BASE_ENVOY_CARD: EnvoyAgentCard = {
  version: "0.1.0",
  ownerId: "envoy:owner:abc123def456abc123def456abc123def456abc123def456abc123de",
  displayName: "Atlas",
  nodeProfile: "home-desktop",
  capabilities: ["chat", "knowledge.query", "task.execute"],
  publicTopics: ["books", "rust"],
  trustPolicySummary: {
    acceptsDirectBondRequests: true,
    acceptsReferralRequests: false,
    requiresHumanApprovalForRawFiles: true,
  },
  supportedProtocolVersions: ["0.1"],
  agentNetworkProfile: {
    strengths: ["chat", "rust"],
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

  it("translates capabilities → skills with tags", () => {
    const card = toA2AAgentCard(BASE_ENVOY_CARD, "https://relay.example.com");
    const ids = card.skills.map((s) => s.id);
    expect(ids).toContain("chat");
    expect(ids).toContain("knowledge.query");
    expect(ids).toContain("task.execute");

    // "chat" and "rust" are strengths, so skills matching them get
    // a "strength" tag. The other capability does not.
    const chatSkill = card.skills.find((s) => s.id === "chat");
    expect(chatSkill?.tags).toContain("strength");
    const taskSkill = card.skills.find((s) => s.id === "task.execute");
    expect(taskSkill?.tags).not.toContain("strength");
    expect(taskSkill?.tags).toContain("task.execute");
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

  it("emits capabilities.streaming=true, pushNotifications=false", () => {
    const card = toA2AAgentCard(BASE_ENVOY_CARD, "https://relay.example.com");
    expect(card.capabilities.streaming).toBe(true);
    expect(card.capabilities.pushNotifications).toBe(false);
  });

  it("emits supportedInterfaces with the gateway URL", () => {
    const card = toA2AAgentCard(BASE_ENVOY_CARD, "https://relay.example.com:15432");
    expect(card.supportedInterfaces).toEqual([
      {
        protocolVersion: "1.0",
        protocolBinding: "jsonrpc",
        url: "https://relay.example.com:15432",
      },
    ]);
  });

  it("emits bearer security scheme", () => {
    const card = toA2AAgentCard(BASE_ENVOY_CARD, "https://relay.example.com");
    expect(card.securitySchemes).toEqual({
      bearer: { type: "http", scheme: "bearer" },
    });
    expect(card.security).toEqual([{ bearer: [] }]);
  });

  it("includes ownerId + nodeProfile + agentNetworkProfile in metadata", () => {
    const card = toA2AAgentCard(BASE_ENVOY_CARD, "https://relay.example.com");
    expect(card.metadata?.ownerId).toBe(BASE_ENVOY_CARD.ownerId);
    expect(card.metadata?.nodeProfile).toBe("home-desktop");
    expect((card.metadata?.agentNetworkProfile as Record<string, unknown> | undefined)?.strengths)
      .toEqual(["chat", "rust"]);
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

  it("falls back to default description with ownerId slice", () => {
    const card = toA2AAgentCard(BASE_ENVOY_CARD, "https://relay.example.com");
    expect(card.description).toContain("EnvoyMesh agent node");
    expect(card.description).toContain("home-desktop");
    expect(card.description).toContain(BASE_ENVOY_CARD.ownerId.slice(0, 20));
  });

  it("handles agentNetworkProfile absent", () => {
    const card = toA2AAgentCard(
      { ...BASE_ENVOY_CARD, agentNetworkProfile: undefined },
      "https://relay.example.com",
    );
    // Capabilities still become skills; none get the "strength" tag.
    const skill = card.skills.find((s) => s.id === "chat");
    expect(skill?.tags).toEqual(["chat"]);
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
    expect(parsed.supportedInterfaces[0].url).toBe("https://relay.example.com");
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
    expect(res.headers["Allow"]).toBe("GET");
    expect(JSON.parse(res.body).error).toMatch(/method/i);
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