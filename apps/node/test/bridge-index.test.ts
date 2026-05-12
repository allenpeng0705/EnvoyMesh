import { describe, expect, it, vi } from "vitest";
import { createServer } from "node:net";
import { createAgentCredential, generateAgentIdentity, generateOwnerIdentity } from "@envoymesh/identity";
import { createChatMessagePayload, EnvoyEnvelopeSchema } from "@envoymesh/protocol";
import { createBridge, type BridgeIdentity } from "../src/bridge/index.js";

describe("bridge runtime", () => {
  it("requires a shared secret when enabled", async () => {
    const port = await getFreePort();
    expect(() =>
      createBridge({
        config: { enabled: true, agentUrl: "http://localhost:8080/message", listenPort: port },
        identity: makeBridgeIdentity(),
        mesh: makeMesh(),
        getRecipientPeerId: async () => null,
      }),
    ).toThrow("Bridge requires a shared secret when enabled");
  });

  it("forwards addressed P2P chat to the agent and sends a valid agent reply", async () => {
    const port = await getFreePort();
    const identity = makeBridgeIdentity();
    const sendChat = vi.fn().mockResolvedValue(1);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ text: "agent reply" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const bridge = createBridge({
      config: {
        enabled: true,
        agentUrl: "http://localhost:8080/message",
        listenPort: port,
        secret: "test-secret-token",
      },
      identity,
      mesh: makeMesh({ sendChat }),
      getRecipientPeerId: async (id) => id,
    });

    try {
      await bridge._handleMessage(
        {
          intent: "chat.message",
          recipientPeerId: identity.agentPeerId,
          payload: createChatMessagePayload({
            senderOwnerId: "envoy:owner:sender",
            text: "hello agent",
          }),
        },
        "12D3Sender",
      );

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(sendChat).toHaveBeenCalledTimes(1);
      const [recipientPeerId, envelope] = sendChat.mock.calls[0];
      expect(recipientPeerId).toBe("12D3Sender");
      expect(EnvoyEnvelopeSchema.safeParse(envelope).success).toBe(true);
      expect(envelope.agentCredential).toEqual(identity.agentCredential);
    } finally {
      await bridge.stop();
      vi.unstubAllGlobals();
    }
  });
});

function makeBridgeIdentity(): BridgeIdentity {
  const owner = generateOwnerIdentity();
  const agent = generateAgentIdentity(owner.ownerId);
  return {
    agentPeerId: agent.agentPeerId,
    agentPublicKeyPem: agent.publicKeyPem,
    agentPrivateKeyPem: agent.privateKeyPem,
    ownerId: owner.ownerId,
    agentCredential: createAgentCredential({
      owner,
      agent,
      scope: ["chat.message"],
    }),
  };
}

function makeMesh(overrides: Record<string, unknown> = {}) {
  return {
    peerId: "12D3Self",
    sendChat: vi.fn().mockResolvedValue(1),
    ...overrides,
  } as any;
}

async function getFreePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  return port;
}
