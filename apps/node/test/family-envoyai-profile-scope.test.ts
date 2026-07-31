/**
 * Phase 51 — EnvoyAI history / identity must be profile-scoped.
 */
import { ENVOY_AI_THREAD_KEY, envoyAiThreadKeyForProfile } from "@envoymesh/api"
import { describe, expect, it, vi } from "vitest"
import { persistEnvoyAiChatExchangeViaRuntime } from "../src/node-service-openclaw-runtime.js"

describe("persistEnvoyAiChatExchangeViaRuntime family profile", () => {
  it("attributes human turns to the family profile id and display name", async () => {
    const persisted: Array<{ threadKey: string; msg: { sender: { ownerId: string; displayName: string } } }> =
      []
    const ctx = {
      getProfile: () =>
        ({
          owner: { ownerId: "envoy:owner:allen" },
        }) as any,
      getReachableMesh: () => ({ peerId: "peer-home" }) as any,
      getChatLogStore: () => ({}),
      getHumanProfileStore: () => ({
        loadHumanProfile: async () => ({ displayName: "Allen Peng" }),
      }),
      getBridgeStatus: () => undefined,
      persistChatMessage: (threadKey: string, msg: any) => {
        persisted.push({ threadKey, msg })
      },
      emitChatMessage: vi.fn(),
      getCallerFamilyProfileId: () => "dad",
      getCallerDisplayName: async () => "Dad",
      isCallerOwnerProfile: () => false,
    }

    const threadKey = envoyAiThreadKeyForProfile("dad")
    await persistEnvoyAiChatExchangeViaRuntime(
      ctx as any,
      "你好",
      {
        answer: "早上好，Dad。",
        domain: "knowledge",
        intent: "knowledge",
        toolsUsed: [],
        approvalItems: [],
        modelUsed: "openclaw",
      } as any,
      undefined,
      threadKey,
    )

    expect(persisted.map((p) => p.threadKey)).toEqual([threadKey, threadKey])
    const human = persisted[0]!.msg
    expect(human.sender.ownerId).toBe("dad")
    expect(human.sender.displayName).toBe("Dad")
    // Must not fall back to owner HumanProfile name.
    expect(human.sender.displayName).not.toBe("Allen Peng")
    expect(persisted[0]!.threadKey).not.toBe(ENVOY_AI_THREAD_KEY)
    expect(persisted[0]!.threadKey).not.toBe(`${ENVOY_AI_THREAD_KEY}:owner`)
  })
})
