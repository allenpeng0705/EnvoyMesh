import { describe, expect, it } from "vitest";
import { resolveAiKnowledgeBaseSettings } from "../src/ai-knowledge-base.js";

describe("resolveAiKnowledgeBaseSettings", () => {
  it("defaults purgeChatRagOnDelete to false", () => {
    expect(resolveAiKnowledgeBaseSettings(undefined).purgeChatRagOnDelete).toBe(false);
    expect(resolveAiKnowledgeBaseSettings({}).purgeChatRagOnDelete).toBe(false);
    expect(resolveAiKnowledgeBaseSettings({ purgeChatRagOnDelete: true }).purgeChatRagOnDelete).toBe(true);
  });

  it("always includes notes/ in publicVaultPaths for the Markdown corpus", () => {
    expect(resolveAiKnowledgeBaseSettings(undefined).publicVaultPaths).toEqual(
      expect.arrayContaining(["notes/"]),
    );
    expect(
      resolveAiKnowledgeBaseSettings({
        publicVaultPaths: ["knowledge/public/"],
      }).publicVaultPaths,
    ).toEqual(["knowledge/public/", "notes/"]);
    expect(
      resolveAiKnowledgeBaseSettings({
        publicVaultPaths: ["notes/", "knowledge/public/"],
      }).publicVaultPaths,
    ).toEqual(["notes/", "knowledge/public/"]);
  });
});
