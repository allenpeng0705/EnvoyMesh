import { describe, expect, it, vi } from "vitest";
import { buildEnvoyMeshRetrievedContext } from "../src/openclaw-turn-context.js";

describe("buildEnvoyMeshRetrievedContext Context Memory", () => {
  const base = {
    message: "what theme do I prefer?",
    ownerId: "envoy:owner:test",
    bonds: [],
    chatLogStore: null,
    trustStore: {
      getTrust: async () => null,
      listTrust: async () => [],
    } as any,
    humanProfileStore: null,
    agentIdentityStore: null,
    vaultDir: "/tmp/no-vault-cm-test",
    ragService: {
      getExternalKnowledgeContext: vi.fn(async () => "## External knowledge base\nmemex hit"),
      searchVaultKnowledgeBase: vi.fn(async () => []),
      searchChatHistoryRag: vi.fn(async () => []),
    } as any,
    knowledgeScope: "owner" as const,
  };

  it("when CM not ready, still calls Memex/external inject", async () => {
    const ctx = await buildEnvoyMeshRetrievedContext({
      ...base,
      contextMemory: {
        status: () => "off",
        recallForTurn: async () => "### Context memory\n- should not appear",
      },
    });
    expect(base.ragService.getExternalKnowledgeContext).toHaveBeenCalled();
    expect(ctx).toContain("External knowledge");
    expect(ctx).not.toContain("should not appear");
  });

  it("when CM ready with recall, injects and skips Memex auto-inject", async () => {
    (base.ragService.getExternalKnowledgeContext as ReturnType<typeof vi.fn>).mockClear();
    const ctx = await buildEnvoyMeshRetrievedContext({
      ...base,
      contextMemory: {
        status: () => "ready",
        recallForTurn: async () => "### Context memory\n- I prefer dark mode",
      },
    });
    expect(base.ragService.getExternalKnowledgeContext).not.toHaveBeenCalled();
    expect(ctx).toContain("prefer dark mode");
    expect(ctx).not.toContain("External knowledge");
  });

  it("when CM ready but empty recall, keeps Memex inject", async () => {
    (base.ragService.getExternalKnowledgeContext as ReturnType<typeof vi.fn>).mockClear();
    const ctx = await buildEnvoyMeshRetrievedContext({
      ...base,
      contextMemory: {
        status: () => "ready",
        recallForTurn: async () => "",
      },
    });
    expect(base.ragService.getExternalKnowledgeContext).toHaveBeenCalled();
    expect(ctx).toContain("External knowledge");
  });

  it("when CM ready but whitespace-only recall, keeps Memex inject", async () => {
    (base.ragService.getExternalKnowledgeContext as ReturnType<typeof vi.fn>).mockClear();
    const ctx = await buildEnvoyMeshRetrievedContext({
      ...base,
      contextMemory: {
        status: () => "ready",
        recallForTurn: async () => "   \n  ",
      },
    });
    expect(base.ragService.getExternalKnowledgeContext).toHaveBeenCalled();
    expect(ctx).toContain("External knowledge");
  });

  it("when CM error status, does not inject CM section", async () => {
    (base.ragService.getExternalKnowledgeContext as ReturnType<typeof vi.fn>).mockClear();
    const ctx = await buildEnvoyMeshRetrievedContext({
      ...base,
      contextMemory: {
        status: () => "error",
        recallForTurn: async () => "### Context memory\n- should not appear",
      },
    });
    expect(ctx).not.toContain("should not appear");
    expect(base.ragService.getExternalKnowledgeContext).toHaveBeenCalled();
  });
});
