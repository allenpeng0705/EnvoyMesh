/**
 * @vitest-environment node
 *
 * Phase 48D.5 — A2A Agent Card fetch smoke (what an A2A SDK / curl client does).
 *
 * Always runs against an in-process HTTP server publishing
 * `/.well-known/agent-card.json` with optional Ed25519 signature.
 *
 * Optional WAN probe: set `A2A_CARD_FETCH_URL` to a public relay card URL
 * (e.g. `https://relay.example:15432/.well-known/agent-card.json`).
 */
import { createServer } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generateEd25519KeyPair } from "@envoymesh/identity";
import {
  handleA2ARelayAgentCardRequest,
  verifyA2AAgentCardSignature,
  type A2AAgentCard,
  type RelayCardInfo,
} from "@envoymesh/api";

const INFO: RelayCardInfo = {
  peerId: "12D3KooWCardFetchLivePeer",
  multiaddrs: ["/ip4/127.0.0.1/tcp/4001"],
  rosterSize: 3,
};

describe("48D.5 A2A Agent Card fetch (local well-known)", () => {
  const keys = generateEd25519KeyPair();
  let baseUrl = "";
  let close: () => Promise<void> = async () => {};

  beforeAll(async () => {
    const server = createServer((req, res) => {
      const gatewayUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
      handleA2ARelayAgentCardRequest(
        req,
        res,
        INFO,
        gatewayUrl,
        {
          sign: {
            privateKeyPem: keys.privateKeyPem,
            publicKeyPem: keys.publicKeyPem,
            keyId: "live-test-key",
          },
        },
      );
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const addr = server.address();
    if (!addr || typeof addr === "string") throw new Error("no port");
    baseUrl = `http://127.0.0.1:${addr.port}`;
    close = () => new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  afterAll(async () => {
    await close();
  });

  it("GET /.well-known/agent-card.json returns signed streaming card", async () => {
    const resp = await fetch(`${baseUrl}/.well-known/agent-card.json`);
    expect(resp.status).toBe(200);
    expect(resp.headers.get("content-type")).toContain("application/json");
    const card = (await resp.json()) as A2AAgentCard;
    expect(card.name).toBe("EnvoyMesh Relay");
    expect(card.capabilities.streaming).toBe(true);
    expect(card.supportedInterfaces[0]?.protocolBinding).toBe("jsonrpc");
    expect(card.metadata?.["x-envoymesh-taskBridgeStatus"]).toBe("available");
    expect(card.signatures?.[0]?.type).toBe("envoymesh-ed25519");
    expect(verifyA2AAgentCardSignature(card, keys.publicKeyPem)).toBe(true);
  });

  it("rejects non-GET with 405", async () => {
    const resp = await fetch(`${baseUrl}/.well-known/agent-card.json`, { method: "POST" });
    expect(resp.status).toBe(405);
  });
});

const PUBLIC_CARD_URL = process.env.A2A_CARD_FETCH_URL?.trim();

describe.skipIf(!PUBLIC_CARD_URL)("48D.5 A2A Agent Card fetch (public relay)", () => {
  it(`fetches ${PUBLIC_CARD_URL}`, async () => {
    const resp = await fetch(PUBLIC_CARD_URL!, {
      signal: AbortSignal.timeout(15_000),
    });
    expect(resp.ok).toBe(true);
    const card = (await resp.json()) as A2AAgentCard;
    expect(typeof card.name).toBe("string");
    expect(card.supportedInterfaces?.length).toBeGreaterThan(0);
    expect(card.capabilities).toBeDefined();
  }, 20_000);
});
