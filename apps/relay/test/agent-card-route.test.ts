/**
 * Phase 48C — A2A Agent Card route tests.
 *
 * Verifies the relay's `/.well-known/agent-card.json` route behavior
 * independently from `apps/relay/src/index.ts` (which is a large
 * orchestrator module). The route delegates to
 * `handleA2ARelayAgentCardRequest` from `@envoymesh/api`.
 */

import { describe, expect, it } from "vitest";
import {
  handleA2ARelayAgentCardRequest,
  relayEnvoyAgentCard,
  type RelayCardInfo,
} from "@envoymesh/api";

function mockRes() {
  const headers: Record<string, string> = {};
  let body = "";
  let status = 0;
  return {
    writeHead: (s: number, h?: Record<string, string>) => {
      status = s;
      if (h) Object.assign(headers, h);
    },
    end: (data?: string) => { if (data) body = data; },
    get status() { return status; },
    get headers() { return headers; },
    get body() { return body; },
  };
}

const INFO: RelayCardInfo = {
  peerId: "12D3KooWExamplePeerId",
  multiaddrs: ["/ip4/1.2.3.4/tcp/4001"],
  rosterSize: 42,
};

describe("relayEnvoyAgentCard", () => {
  it("builds a connectivity-only card", () => {
    const card = relayEnvoyAgentCard(INFO, "https://relay.example.com");
    expect(card.name).toBe("EnvoyMesh Relay");
    expect(card.skills.map((s) => s.id)).toContain("circuit-relay");
    expect(card.capabilities.streaming).toBe(true);
    expect(card.capabilities.pushNotifications).toBe(false);
  });

  it("uses provider.organization not provider.name", () => {
    const card = relayEnvoyAgentCard(INFO, "https://relay.example.com");
    expect(card.provider.organization).toBe("EnvoyMesh");
    expect(card.provider.url).toBe("https://relay.example.com");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((card.provider as any).name).toBeUndefined();
  });

  it("emits Bearer (capitalized) security scheme", () => {
    const card = relayEnvoyAgentCard(INFO, "https://relay.example.com");
    expect(card.securitySchemes).toEqual({ Bearer: { type: "http", scheme: "bearer" } });
    expect(card.security).toEqual([{ Bearer: [] }]);
  });

  it("OMITS peerId/multiaddrs/rosterSize by default", () => {
    const card = relayEnvoyAgentCard(INFO, "https://relay.example.com");
    // Public card should not expose stable identity / topology markers.
    // taskBridgeStatus is always included (it's not identity-bearing).
    expect(card.metadata?.["x-envoymesh-peerId"]).toBeUndefined();
    expect(card.metadata?.["x-envoymesh-multiaddrs"]).toBeUndefined();
    expect(card.metadata?.["x-envoymesh-rosterSize"]).toBeUndefined();
    const flat = JSON.stringify(card);
    expect(flat).not.toContain(INFO.peerId);
    expect(flat).not.toContain("/ip4/1.2.3.4/tcp/4001");
    expect(flat).not.toContain("rosterSize");
    expect(flat).not.toContain("42");
  });

  it("includes peerId/multiaddrs/rosterSize when exposeOperational: true", () => {
    const card = relayEnvoyAgentCard(INFO, "https://relay.example.com", { exposeOperational: true });
    expect(card.metadata?.["x-envoymesh-peerId"]).toBe(INFO.peerId);
    expect(card.metadata?.["x-envoymesh-multiaddrs"]).toEqual(INFO.multiaddrs);
    expect(card.metadata?.["x-envoymesh-rosterSize"]).toBe(INFO.rosterSize);
  });

  it("advertises x-envoymesh-taskBridgeStatus = 'available' by default (48D.5)", () => {
    const card = relayEnvoyAgentCard(INFO, "https://relay.example.com");
    expect(card.metadata?.["x-envoymesh-taskBridgeStatus"]).toBe("available");
  });

  it("honors taskBridgeStatus override", () => {
    const card = relayEnvoyAgentCard(INFO, "https://relay.example.com", { taskBridgeStatus: "available" });
    expect(card.metadata?.["x-envoymesh-taskBridgeStatus"]).toBe("available");
  });
});

describe("handleA2ARelayAgentCardRequest", () => {
  it("returns 200 + Bearer security + circuit-relay skill on GET", () => {
    const res = mockRes();
    handleA2ARelayAgentCardRequest(
      { method: "GET", url: "/.well-known/agent-card.json" },
      res,
      INFO,
      "https://relay.example.com",
    );
    expect(res.status).toBe(200);
    expect(res.headers["Content-Type"]).toBe("application/json");
    expect(res.headers["Cache-Control"]).toBe("public, max-age=300");
    expect(res.headers["Access-Control-Allow-Origin"]).toBe("*");
    const parsed = JSON.parse(res.body);
    expect(parsed.skills[0].id).toBe("circuit-relay");
    expect(parsed.provider.organization).toBe("EnvoyMesh");
    expect(parsed.securitySchemes.Bearer).toBeDefined();
  });

  it("returns 405 on non-GET", () => {
    const res = mockRes();
    handleA2ARelayAgentCardRequest(
      { method: "POST", url: "/.well-known/agent-card.json" },
      res,
      INFO,
      "https://relay.example.com",
    );
    expect(res.status).toBe(405);
    expect(res.headers["Allow"]).toBe("GET, OPTIONS");
  });

  it("returns 204 + CORS headers on OPTIONS preflight", () => {
    const res = mockRes();
    handleA2ARelayAgentCardRequest(
      { method: "OPTIONS", url: "/.well-known/agent-card.json" },
      res,
      INFO,
      "https://relay.example.com",
    );
    expect(res.status).toBe(204);
    expect(res.headers["Access-Control-Allow-Origin"]).toBe("*");
    expect(res.headers["Access-Control-Allow-Methods"]).toBe("GET, OPTIONS");
  });

  it("returns 503 when relay info is null", () => {
    const res = mockRes();
    handleA2ARelayAgentCardRequest(
      { method: "GET", url: "/.well-known/agent-card.json" },
      res,
      null,
      "https://relay.example.com",
    );
    expect(res.status).toBe(503);
    expect(JSON.parse(res.body).error).toMatch(/not initialized/i);
  });

  it("does NOT leak peerId into the card body when exposeOperational is default", () => {
    const res = mockRes();
    handleA2ARelayAgentCardRequest(
      { method: "GET", url: "/.well-known/agent-card.json" },
      res,
      INFO,
      "https://relay.example.com",
    );
    expect(res.body).not.toContain(INFO.peerId);
    // Stub indicator is published
    const parsed = JSON.parse(res.body);
    expect(parsed.metadata["x-envoymesh-taskBridgeStatus"]).toBe("available");
  });

  it("honors a custom displayName", () => {
    const res = mockRes();
    handleA2ARelayAgentCardRequest(
      { method: "GET", url: "/.well-known/agent-card.json" },
      res,
      INFO,
      "https://relay.example.com",
      { displayName: "My Special Relay" },
    );
    const parsed = JSON.parse(res.body);
    expect(parsed.name).toBe("My Special Relay");
  });
});