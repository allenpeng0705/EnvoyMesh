import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ResolvedEnvoymeshAccount } from "./types.js";

const accountDefaults: ResolvedEnvoymeshAccount = {
  accountId: "default",
  enabled: true,
  bridgeUrl: "http://127.0.0.1:3031/bridge/send",
  bridgeSecret: "",
  inboundSecret: "",
  webhookPath: "/webhook/envoymesh",
  webhookPathSource: "default",
  dmPolicy: "allowlist",
  allowedOwnerIds: ["envoy:owner:test"],
};

function makeAccount(overrides: Partial<ResolvedEnvoymeshAccount> = {}): ResolvedEnvoymeshAccount {
  return { ...accountDefaults, ...overrides };
}

const bridgeClientModule = await import("./bridge-client.js");
const gatewayRuntimeModule = await import("./gateway-runtime.js");
const mockSendBridgeMessage = vi.spyOn(bridgeClientModule, "sendBridgeMessage").mockResolvedValue(true);
const registerEnvoymeshWebhookRouteMock = vi
  .spyOn(gatewayRuntimeModule, "registerEnvoymeshWebhookRoute")
  .mockImplementation(() => vi.fn());

vi.mock("./webhook-handler.js", () => ({
  createEnvoymeshWebhookHandler: vi.fn(() => vi.fn()),
}));

const { createEnvoymeshPlugin } = await import("./channel.js");

describe("createEnvoymeshPlugin", () => {
  beforeEach(() => {
    mockSendBridgeMessage.mockClear();
    registerEnvoymeshWebhookRouteMock.mockClear();
    mockSendBridgeMessage.mockResolvedValue(true);
    registerEnvoymeshWebhookRouteMock.mockImplementation(() => vi.fn());
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("has correct meta", () => {
    const plugin = createEnvoymeshPlugin();
    expect(plugin.meta.id).toBe("envoymesh");
    expect(plugin.meta.label).toBe("EnvoyMesh");
    expect(plugin.meta.docsPath).toBe("/channels/envoymesh");
  });

  it("lists default account when bridgeUrl configured", () => {
    const plugin = createEnvoymeshPlugin();
    const ids = plugin.config.listAccountIds({
      channels: {
        envoymesh: {
          bridgeUrl: "http://127.0.0.1:3031/bridge/send",
        },
      },
    });
    expect(ids).toContain("default");
  });

  it("sendText posts to bridge with peer id", async () => {
    const plugin = createEnvoymeshPlugin();
    const account = makeAccount();
    const result = await plugin.outbound.sendText({
      cfg: {
        channels: {
          envoymesh: {
            bridgeUrl: account.bridgeUrl,
            allowedOwnerIds: account.allowedOwnerIds,
          },
        },
      },
      to: "envoy_peer123",
      text: "hi",
      accountId: "default",
    });
    expect(mockSendBridgeMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "envoy_peer123",
        text: "hi",
      }),
    );
    expect(result.channel).toBe("envoymesh");
  });
});
