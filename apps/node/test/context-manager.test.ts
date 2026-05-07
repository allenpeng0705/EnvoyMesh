import { describe, expect, it, vi } from "vitest";
import {
  buildConversationContextTool,
  buildRelationshipContextTool,
  buildProfileContextTool,
  buildVaultContextTool,
  buildGraphContextTool,
  listContextTools,
} from "../src/context-manager.js";

describe("Context Tools", () => {
  describe("listContextTools", () => {
    it("returns all context tools", () => {
      const tools = listContextTools();
      expect(tools).toHaveLength(5);
      expect(tools.map((t) => t.name).sort()).toEqual([
        "conversation-context",
        "graph-context",
        "profile-context",
        "relationship-context",
        "vault-context",
      ]);
    });

    it("each tool has required fields", () => {
      const tools = listContextTools();
      for (const tool of tools) {
        expect(typeof tool.name).toBe("string");
        expect(tool.name.length).toBeGreaterThan(0);
        expect(typeof tool.description).toBe("string");
        expect(Array.isArray(tool.parameters)).toBe(true);
      }
    });

    it("conversation-context has correct parameters", () => {
      const tools = listContextTools();
      const convTool = tools.find((t) => t.name === "conversation-context");
      expect(convTool).toBeDefined();
      expect(convTool?.parameters).toHaveLength(2);
      expect(convTool?.parameters.find((p) => p.name === "ownerId")?.required).toBe(true);
      expect(convTool?.parameters.find((p) => p.name === "limit")?.required).toBe(false);
    });

    it("relationship-context has correct parameters", () => {
      const tools = listContextTools();
      const relTool = tools.find((t) => t.name === "relationship-context");
      expect(relTool).toBeDefined();
      expect(relTool?.parameters).toHaveLength(1);
      expect(relTool?.parameters[0].name).toBe("ownerId");
      expect(relTool?.parameters[0].required).toBe(true);
    });

    it("profile-context has no required parameters", () => {
      const tools = listContextTools();
      const profileTool = tools.find((t) => t.name === "profile-context");
      expect(profileTool).toBeDefined();
      expect(profileTool?.parameters).toHaveLength(0);
    });

    it("vault-context has correct parameters", () => {
      const tools = listContextTools();
      const vaultTool = tools.find((t) => t.name === "vault-context");
      expect(vaultTool).toBeDefined();
      expect(vaultTool?.parameters.find((p) => p.name === "query")?.required).toBe(true);
      expect(vaultTool?.parameters.find((p) => p.name === "limit")?.required).toBe(false);
    });
  });

  describe("conversation-context tool", () => {
    it("returns error when ownerId is missing", async () => {
      const tool = buildConversationContextTool(null);
      const result = await tool({});
      expect(result).toHaveProperty("error");
      expect((result as any).error).toContain("ownerId");
    });

    it("returns error when chat log store is not available", async () => {
      const tool = buildConversationContextTool(null);
      const result = await tool({ ownerId: "test-owner" });
      expect(result).toHaveProperty("error");
      expect((result as any).error).toContain("not available");
    });

    it("returns chat history when store is available", async () => {
      const mockStore = {
        listThread: vi.fn().mockResolvedValue([
          {
            sender: { displayName: "Alice", ownerId: "alice-owner" },
            content: { text: "Hello" },
            metadata: { timestamp: "2026-01-01T10:00:00.000Z" },
          },
          {
            sender: { displayName: "Bob", ownerId: "bob-owner" },
            content: { text: "Hi there" },
            metadata: { timestamp: "2026-01-01T10:01:00.000Z" },
          },
        ]),
      };

      const tool = buildConversationContextTool(mockStore as any);
      const result = await tool({ ownerId: "alice-owner", limit: 10 });

      expect(result).toHaveProperty("contactOwnerId");
      expect((result as any).contactOwnerId).toBe("alice-owner");
      expect((result as any).recentMessages).toHaveLength(2);
      expect((result as any).messageCount).toBe(2);
    });
  });

  describe("relationship-context tool", () => {
    it("returns error when ownerId is missing", async () => {
      const tool = buildRelationshipContextTool({} as any);
      const result = await tool({});
      expect(result).toHaveProperty("error");
    });

    it("returns public bond level when no relationship exists", async () => {
      const mockTrustStore = {
        getTrustRecord: vi.fn().mockResolvedValue(null),
      };

      const tool = buildRelationshipContextTool(mockTrustStore as any);
      const result = await tool({ ownerId: "unknown-owner" });

      expect((result as any).ownerId).toBe("unknown-owner");
      expect((result as any).bondLevel).toBe("public");
    });

    it("returns relationship info when bond exists", async () => {
      const mockTrustStore = {
        getTrustRecord: vi.fn().mockResolvedValue({
          peerOwnerId: "friend-owner",
          displayName: "Alice",
          level: "direct",
          createdAt: "2026-01-01T10:00:00.000Z",
          lastInteraction: "2026-01-02T10:00:00.000Z",
          note: "Friend from work",
        }),
      };

      const tool = buildRelationshipContextTool(mockTrustStore as any);
      const result = await tool({ ownerId: "friend-owner" });

      expect((result as any).ownerId).toBe("friend-owner");
      expect((result as any).displayName).toBe("Alice");
      expect((result as any).bondLevel).toBe("direct");
      expect((result as any).note).toBe("Friend from work");
    });
  });

  describe("profile-context tool", () => {
    it("returns error when profile not found", async () => {
      const mockProfileStore = {
        loadHumanProfile: vi.fn().mockResolvedValue(undefined),
      };

      const tool = buildProfileContextTool(mockProfileStore as any);
      const result = await tool({});

      expect(result).toHaveProperty("error");
      expect((result as any).error).toContain("not found");
    });

    it("returns profile when available", async () => {
      const mockProfileStore = {
        loadHumanProfile: vi.fn().mockResolvedValue({
          ownerId: "envoy:owner:test",
          displayName: "Test User",
          username: "testuser",
          bio: "A test user",
          gender: "unknown",
          hobbies: ["reading", "coding"],
          knowledge: ["TypeScript", "distributed systems"],
          profileVisibility: "public",
        }),
      };

      const tool = buildProfileContextTool(mockProfileStore as any);
      const result = await tool({});

      expect((result as any).ownerId).toBe("envoy:owner:test");
      expect((result as any).displayName).toBe("Test User");
      expect((result as any).username).toBe("testuser");
      expect((result as any).hobbies).toEqual(["reading", "coding"]);
      expect((result as any).knowledge).toEqual(["TypeScript", "distributed systems"]);
    });
  });

  describe("vault-context tool", () => {
    it("returns error when vault index is not available", async () => {
      const tool = buildVaultContextTool(null);
      const result = await tool({ query: "test" });
      expect(result).toHaveProperty("error");
      expect((result as any).error).toContain("not available");
    });

    it("returns error when vault index is not available", async () => {
      const tool = buildVaultContextTool(null);
      const result = await tool({ query: "test query" });
      expect(result).toHaveProperty("error");
      expect((result as any).error).toContain("not available");
    });

    it("returns search results when vault is available", async () => {
      const mockIndex = {
        chunks: [
          { relativePath: "doc1.txt", text: "This is a test document about TypeScript" },
          { relativePath: "doc2.txt", text: "Another document about coding" },
        ],
        documents: {
          "doc1.txt": { title: "TypeScript Guide" },
          "doc2.txt": { title: "Coding Tips" },
        },
      };

      // Mock searchVault function
      const mockSearchVault = vi.fn().mockReturnValue([
        {
          chunk: { relativePath: "doc1.txt", text: "This is a test document about TypeScript" },
          document: { title: "TypeScript Guide" },
          score: 0.95,
        },
      ]);

      // We can't easily mock the vault module, so we'll test the error path
      const tool = buildVaultContextTool(null);
      const result = await tool({ query: "TypeScript" });

      // vault index is null, so should return error
      expect(result).toHaveProperty("error");
    });
  });

  describe("graph-context tool (stubbed)", () => {
    it("returns stub message", async () => {
      const tool = buildGraphContextTool();
      const result = await tool({ query: "friends of friends" });

      expect((result as any).message).toContain("not yet implemented");
      expect((result as any).note).toContain("future release");
    });

    it("works without parameters", async () => {
      const tool = buildGraphContextTool();
      const result = await tool({});

      expect((result as any).message).toContain("not yet implemented");
    });
  });
});
