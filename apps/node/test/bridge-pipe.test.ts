import { describe, it, expect, vi } from "vitest";
import { generateEd25519KeyPair } from "@envoymesh/identity";
import { receiveFromAgent, type BridgeDeps } from "../src/bridge/pipe.js";
import type { BridgeConfig } from "../src/bridge/config.js";

const agentKey = generateEd25519KeyPair();

function makeDeps(overrides?: Partial<BridgeDeps>): BridgeDeps {
  return {
    config: { enabled: true, agentUrl: "http://localhost:8080/message", listenPort: 3031 },
    identity: {
      agentPeerId: "envoy_agent_test123",
      agentPublicKeyPem: agentKey.publicKeyPem,
      agentPrivateKeyPem: agentKey.privateKeyPem,
      ownerId: "envoy:owner:abc123",
    },
    sendChat: vi.fn(),
    getRecipientPeerId: vi.fn().mockResolvedValue("12D3PeerId"),
    ...overrides,
  };
}

// re-exported for testing
export { makeDeps };

describe("receiveFromAgent", () => {
  it("resolves recipient peer ID and sends a signed chat.message envelope", async () => {
    const sendChat = vi.fn();
    const deps = makeDeps({ sendChat });

    const result = await receiveFromAgent(deps, {
      to: "envoy:owner:friend1",
      text: "Hello from bridge!",
    });

    expect(deps.getRecipientPeerId).toHaveBeenCalledWith("envoy:owner:friend1");
    expect(sendChat).toHaveBeenCalledTimes(1);

    const [peerId, envelope] = sendChat.mock.calls[0];
    expect(peerId).toBe("12D3PeerId");
    expect(envelope.intent).toBe("chat.message");
    expect(envelope.senderRole).toBe("agent");
    expect(envelope.recipientRole).toBe("human");
    expect(envelope.senderPeerId).toBe("envoy_agent_test123");
    expect(typeof envelope.signature).toBe("string");
    expect(envelope.signature.length).toBeGreaterThan(0);

    expect(result.messageId).toMatch(/^bridge-\d+-/);
    expect(result.recipientPeerId).toBe("12D3PeerId");
  });

  it("throws when recipient peer ID cannot be resolved", async () => {
    const deps = makeDeps({
      getRecipientPeerId: vi.fn().mockResolvedValue(null),
    });

    await expect(
      receiveFromAgent(deps, { to: "unknown", text: "hi" }),
    ).rejects.toThrow("Cannot resolve peer ID for: unknown");
  });
});

describe("forwardToAgent", () => {
  it("POSTs to the agent URL with the message payload", async () => {
    const { forwardToAgent } = await import("../src/bridge/pipe.js");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ text: "Hello back!" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const config: BridgeConfig = {
      enabled: true,
      agentUrl: "http://localhost:8080/message",
      listenPort: 3031,
    };

    const result = await forwardToAgent(config, {
      senderPeerId: "12D3Sender",
      senderOwnerId: "envoy:owner:sender1",
      senderDisplayName: "Alice",
      text: "Hi agent!",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:8080/message");
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/json");

    const body = JSON.parse(init.body);
    expect(body.from).toBe("12D3Sender");
    expect(body.fromOwnerId).toBe("envoy:owner:sender1");
    expect(body.fromName).toBe("Alice");
    expect(body.text).toBe("Hi agent!");

    expect(result).toBe("Hello back!");

    vi.unstubAllGlobals();
  });

  it("uses ownerId as fallback display name", async () => {
    const { forwardToAgent } = await import("../src/bridge/pipe.js");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });
    vi.stubGlobal("fetch", fetchMock);

    const config: BridgeConfig = {
      enabled: true,
      agentUrl: "http://localhost:8080/message",
      listenPort: 3031,
    };

    await forwardToAgent(config, {
      senderPeerId: "12D3Sender",
      senderOwnerId: "envoy:owner:sender1",
      text: "Hi agent!",
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.fromName).toBe("envoy:owner:sender1");

    vi.unstubAllGlobals();
  });

  it("includes Bearer auth when config.secret is set", async () => {
    const { forwardToAgent } = await import("../src/bridge/pipe.js");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });
    vi.stubGlobal("fetch", fetchMock);

    const config: BridgeConfig = {
      enabled: true,
      agentUrl: "http://localhost:8080/message",
      listenPort: 3031,
      secret: "my-secret-token",
    };

    await forwardToAgent(config, {
      senderPeerId: "12D3Sender",
      senderOwnerId: "envoy:owner:sender1",
      text: "Hi agent!",
    });

    expect(fetchMock.mock.calls[0][1].headers["Authorization"]).toBe("Bearer my-secret-token");

    vi.unstubAllGlobals();
  });

  it("throws when agent returns non-OK status", async () => {
    const { forwardToAgent } = await import("../src/bridge/pipe.js");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      text: () => Promise.resolve("Bad Gateway"),
    });
    vi.stubGlobal("fetch", fetchMock);

    const config: BridgeConfig = {
      enabled: true,
      agentUrl: "http://localhost:8080/message",
      listenPort: 3031,
    };

    await expect(
      forwardToAgent(config, {
        senderPeerId: "12D3Sender",
        senderOwnerId: "envoy:owner:sender1",
        text: "Hi agent!",
      }),
    ).rejects.toThrow("Agent returned 502");

    vi.unstubAllGlobals();
  });

  it("returns null when agent response has no text field", async () => {
    const { forwardToAgent } = await import("../src/bridge/pipe.js");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status: "ok" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const config: BridgeConfig = {
      enabled: true,
      agentUrl: "http://localhost:8080/message",
      listenPort: 3031,
    };

    const result = await forwardToAgent(config, {
      senderPeerId: "12D3Sender",
      senderOwnerId: "envoy:owner:sender1",
      text: "Hi agent!",
    });

    expect(result).toBeNull();

    vi.unstubAllGlobals();
  });

  it("handles JSON parse failure gracefully", async () => {
    const { forwardToAgent } = await import("../src/bridge/pipe.js");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.reject(new Error("Invalid JSON")),
    });
    vi.stubGlobal("fetch", fetchMock);

    const config: BridgeConfig = {
      enabled: true,
      agentUrl: "http://localhost:8080/message",
      listenPort: 3031,
    };

    const result = await forwardToAgent(config, {
      senderPeerId: "12D3Sender",
      senderOwnerId: "envoy:owner:sender1",
      text: "Hi agent!",
    });

    expect(result).toBeNull();

    vi.unstubAllGlobals();
  });
});
