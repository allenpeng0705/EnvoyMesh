import { describe, expect, it } from "vitest";
import {
  generateMobileChatDraft,
  isMobileCloudModelMode,
  resolveMobileContactAiAccessLevel,
} from "../src/mobile-chat-draft.js";

describe("mobile-chat-draft", () => {
  it("isMobileCloudModelMode allows OpenAI and Anthropic, rejects local engines", () => {
    expect(isMobileCloudModelMode("openai-compatible")).toBe(true);
    expect(isMobileCloudModelMode("anthropic-compatible")).toBe(true);
    expect(isMobileCloudModelMode("mock")).toBe(true);
    expect(isMobileCloudModelMode("ollama")).toBe(false);
    expect(isMobileCloudModelMode("litellm")).toBe(false);
  });

  it("resolveMobileContactAiAccessLevel uses defaultModeForNewContacts", () => {
    expect(
      resolveMobileContactAiAccessLevel("envoy:owner:a", [], {
        status: { onlineAssistantEnabled: true, offlineAgentEnabled: false, statusMode: "automatic" },
        identity: { mode: "transparent" },
        defaultModeForNewContacts: "assistant",
        rules: [],
      }),
    ).toBe("assistant_only");
  });

  it("generateMobileChatDraft rejects Ollama on mobile", async () => {
    const result = await generateMobileChatDraft({
      senderOwnerId: "envoy:owner:peer",
      senderDisplayName: "Peer",
      chatText: "Hello",
      messageId: "msg-1",
      remotePeerId: "envoy_peer",
      bondLevel: "direct",
      modelProviders: { mode: "ollama", endpoint: "http://127.0.0.1:11434/v1", modelName: "llama3.1" },
      chatAssistEnabled: true,
      contactAiPreferences: [],
      randomId: () => "draft-1",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("Ollama");
    }
  });

  it("generateMobileChatDraft uses mock provider when configured", async () => {
    const result = await generateMobileChatDraft({
      senderOwnerId: "envoy:owner:peer",
      senderDisplayName: "Peer",
      chatText: "Hello there",
      messageId: "msg-1",
      remotePeerId: "envoy_peer",
      bondLevel: "direct",
      modelProviders: { mode: "mock" },
      chatAssistEnabled: true,
      aiSettings: {
        status: { onlineAssistantEnabled: true, offlineAgentEnabled: false, statusMode: "automatic" },
        identity: { mode: "transparent" },
        defaultModeForNewContacts: "assistant",
        rules: [],
      },
      contactAiPreferences: [],
      randomId: () => "draft-1",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.draft.text).toContain("Mock model response");
      expect(result.draft.threadPeerOwnerId).toBe("envoy:owner:peer");
    }
  });
});
