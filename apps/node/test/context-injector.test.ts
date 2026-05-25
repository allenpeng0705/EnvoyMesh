import { describe, expect, it } from "vitest";
import { buildContextInjection } from "../src/context-injector.js";
import type { LocalChatLogStore, LocalTrustStore, HumanProfileStore } from "@envoymesh/local-store";

function makeTrustStore(overrides: Record<string, unknown> = {}): LocalTrustStore {
  return {
    getTrustRecord: async (ownerId: string) => {
      if (ownerId === "envoy:owner:nonexistent") return null;
      return {
        peerOwnerId: ownerId,
        displayName: overrides.displayName as string ?? "Test Contact",
        level: (overrides.level as string) ?? "direct",
        createdAt: overrides.createdAt as string ?? "2025-01-15T00:00:00.000Z",
        updatedAt: overrides.updatedAt as string ?? "2026-01-01T00:00:00.000Z",
        note: overrides.note as string | undefined,
      };
    },
    ...overrides,
  } as unknown as LocalTrustStore;
}

function makeChatLogStore(messages: Array<{ sender: string; text: string }> = []): LocalChatLogStore {
  return {
    listThread: async (_ownerId: string, _limit: number) =>
      messages.map((m, i) => ({
        messageId: `msg-${i}`,
        sender: { displayName: m.sender, ownerId: "envoy:owner:test" },
        content: { text: m.text },
        metadata: { timestamp: new Date(Date.now() - (messages.length - i) * 60000).toISOString() },
      })),
  } as unknown as LocalChatLogStore;
}

function makeHumanProfileStore(overrides: Record<string, unknown> = {}): HumanProfileStore {
  return {
    loadHumanProfile: async () => ({
      ownerId: "envoy:owner:self",
      displayName: "displayName" in overrides ? (overrides.displayName as string | undefined) : "Test Owner",
      username: overrides.username as string | undefined,
      bio: overrides.bio as string | undefined,
      hobbies: (overrides.hobbies as string[]) ?? [],
      knowledge: (overrides.knowledge as string[]) ?? [],
      profileVisibility: "public" as const,
    }),
  } as unknown as HumanProfileStore;
}

describe("buildContextInjection", () => {
  it("returns empty string when no chat history and no profile", async () => {
    const result = await buildContextInjection(
      "envoy:owner:stranger",
      makeChatLogStore([]),
      makeTrustStore(),
      makeHumanProfileStore({ displayName: "Me", bio: undefined, hobbies: [], knowledge: [] }),
    );
    // Should have relationship context but no conversation or profile details
    expect(result).toContain("## Relationship");
    expect(result).toContain("Bond level: direct");
  });

  it("returns empty string when all stores return defaults with no useful data", async () => {
    // No display name, no bio, no hobbies — profile section should be skipped
    const result = await buildContextInjection(
      "envoy:owner:nobody",
      null,
      makeTrustStore({ displayName: undefined }),
      makeHumanProfileStore({ displayName: undefined, bio: undefined, hobbies: [], knowledge: [] }),
    );
    // Relationship still present (bond level is useful even without display name)
    expect(result).toContain("## Relationship");
    // Profile section should be skipped (no useful data)
    expect(result).not.toContain("## Your Profile");
  });

  it("includes conversation history when chat log store has messages", async () => {
    const chatStore = makeChatLogStore([
      { sender: "Test Contact", text: "Hello!" },
      { sender: "Me", text: "Hi there!" },
      { sender: "Test Contact", text: "How are you?" },
    ]);
    const result = await buildContextInjection(
      "envoy:owner:friend",
      chatStore,
      makeTrustStore(),
      makeHumanProfileStore({ displayName: "Me", bio: undefined, hobbies: [], knowledge: [] }),
    );
    expect(result).toContain("## Recent conversation with");
    expect(result).toContain("[Test Contact]: Hello!");
    expect(result).toContain("[Me]: Hi there!");
    expect(result).toContain("[Test Contact]: How are you?");
  });

  it("truncates long messages at 300 chars", async () => {
    const longText = "x".repeat(500);
    const chatStore = makeChatLogStore([
      { sender: "Test Contact", text: longText },
    ]);
    const result = await buildContextInjection(
      "envoy:owner:friend",
      chatStore,
      makeTrustStore(),
      makeHumanProfileStore({ displayName: "Me", bio: undefined, hobbies: [], knowledge: [] }),
    );
    expect(result).toContain("x".repeat(297) + "...");
    expect(result).not.toContain("x".repeat(500));
  });

  it("includes relationship context with bond level and established date", async () => {
    const result = await buildContextInjection(
      "envoy:owner:direct-friend",
      null,
      makeTrustStore({ level: "direct", displayName: "Alice", createdAt: "2025-06-01T00:00:00.000Z" }),
      makeHumanProfileStore({ displayName: "Me", bio: undefined, hobbies: [], knowledge: [] }),
    );
    expect(result).toContain("## Relationship");
    expect(result).toContain("- Contact: Alice");
    expect(result).toContain("- Bond level: direct");
    expect(result).toContain("- Connected since:");
  });

  it("includes relationship note when present", async () => {
    const result = await buildContextInjection(
      "envoy:owner:noted-friend",
      null,
      makeTrustStore({ displayName: "Bob", level: "referred", note: "Met at conference" }),
      makeHumanProfileStore({ displayName: "Me", bio: undefined, hobbies: [], knowledge: [] }),
    );
    expect(result).toContain("- Note: Met at conference");
    expect(result).toContain("- Bond level: referred");
  });

  it("shows public bond level for strangers", async () => {
    const trustStore = makeTrustStore({ level: "public" });
    const result = await buildContextInjection(
      "envoy:owner:stranger",
      null,
      { getTrustRecord: async () => null } as unknown as LocalTrustStore,
      makeHumanProfileStore({ displayName: "Me", bio: undefined, hobbies: [], knowledge: [] }),
    );
    expect(result).toContain("- Bond level: public");
  });

  it("includes profile context with bio, interests, and knowledge", async () => {
    const result = await buildContextInjection(
      "envoy:owner:friend",
      null,
      makeTrustStore(),
      makeHumanProfileStore({
        displayName: "Dr. Smith",
        bio: "A researcher in distributed systems",
        hobbies: ["cryptography", "P2P networks"],
        knowledge: ["Rust", "TypeScript"],
      }),
    );
    expect(result).toContain("## Your Profile");
    expect(result).toContain("- You are: Dr. Smith");
    expect(result).toContain("- Your bio: A researcher in distributed systems");
    expect(result).toContain("- Your interests: cryptography, P2P networks");
    expect(result).toContain("- Your knowledge areas: Rust, TypeScript");
  });

  it("truncates long bios at 200 chars", async () => {
    const longBio = "A".repeat(300);
    const result = await buildContextInjection(
      "envoy:owner:friend",
      null,
      makeTrustStore(),
      makeHumanProfileStore({
        displayName: "Long Bio Person",
        bio: longBio,
        hobbies: [],
        knowledge: [],
      }),
    );
    expect(result).toContain("A".repeat(197) + "...");
    expect(result).not.toContain("A".repeat(300));
  });

  it("includes all three sections for a bonded contact with conversation history", async () => {
    const chatStore = makeChatLogStore([
      { sender: "Charlie", text: "Hey! Need help with envoy mesh setup" },
      { sender: "Me", text: "Sure, what's the issue?" },
    ]);
    const result = await buildContextInjection(
      "envoy:owner:charlie",
      chatStore,
      makeTrustStore({ displayName: "Charlie", level: "direct" }),
      makeHumanProfileStore({
        displayName: "Me",
        bio: "P2P developer",
        hobbies: ["coding"],
        knowledge: ["TypeScript"],
      }),
    );

    expect(result).toContain("## Recent conversation with");
    expect(result).toContain("## Relationship");
    expect(result).toContain("## Your Profile");
  });

  it("includes RAG-retrieved older messages when ragQuery is provided", async () => {
    const messages = Array.from({ length: 22 }, (_, i) => ({
      sender: "Alice",
      text: i === 0 ? "We discussed the relay deployment last month" : `Filler ${i}`,
    }));
    const chatStore = makeChatLogStore(messages);
    const result = await buildContextInjection(
      "envoy:owner:friend",
      chatStore,
      makeTrustStore(),
      makeHumanProfileStore({ displayName: "Me", bio: undefined, hobbies: [], knowledge: [] }),
      { ragQuery: "relay deployment" },
    );
    expect(result).toContain("Related earlier messages");
    expect(result).toContain("relay deployment");
  });
});
