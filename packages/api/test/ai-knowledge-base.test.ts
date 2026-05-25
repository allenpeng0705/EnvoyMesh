import { describe, expect, it } from "vitest";
import { resolveAiKnowledgeBaseSettings } from "../src/ai-knowledge-base.js";

describe("resolveAiKnowledgeBaseSettings", () => {
  it("defaults purgeChatRagOnDelete to false", () => {
    expect(resolveAiKnowledgeBaseSettings(undefined).purgeChatRagOnDelete).toBe(false);
    expect(resolveAiKnowledgeBaseSettings({}).purgeChatRagOnDelete).toBe(false);
    expect(resolveAiKnowledgeBaseSettings({ purgeChatRagOnDelete: true }).purgeChatRagOnDelete).toBe(true);
  });
});
