/**
 * Phase 23 tests — Proactive Social Graph.
 * Covers: circle-proposer, bond-steward, connection-suggester, chat-rag-service.
 */
import { describe, expect, it } from "vitest";
import { proposeCircles, circleFromProposal, type CircleProposerDeps } from "../src/circle-proposer.js";
import { findDormantBonds, type BondStewardDeps } from "../src/bond-steward.js";
import { matchPeerInterests } from "../src/connection-suggester.js";
import { searchChatHistory, formatChatRagResults, type ChatRagEntry } from "../src/chat-rag-service.js";

// =========================================================================
// Circle Proposer
// =========================================================================
describe("circle-proposer", () => {
  function makeDeps(topics: Record<string, string[]>, capabilities?: Record<string, string[]>): CircleProposerDeps {
    return {
      getBonds: async () =>
        Object.keys(topics).map((id) => ({
          peerOwnerId: id,
          displayName: id,
          level: "direct",
          createdAt: "2026-01-01T00:00:00.000Z",
        })),
      getContactTopics: async (ownerId) => topics[ownerId] ?? [],
      getContactCapabilities: async (ownerId) => capabilities?.[ownerId] ?? [],
    };
  }

  it("proposes no circles when fewer than minMembers contacts", async () => {
    const deps = makeDeps({ "envoy:owner:a": ["rust"] });
    const result = await proposeCircles(deps, { minMembers: 2 });
    expect(result).toHaveLength(0);
  });

  it("proposes topic-based circle when enough members share a topic", async () => {
    const deps = makeDeps({
      "envoy:owner:a": ["rust", "wasm"],
      "envoy:owner:b": ["rust", "python"],
      "envoy:owner:c": ["rust", "typescript"],
    });
    const result = await proposeCircles(deps, { minMembers: 2 });
    expect(result.length).toBeGreaterThan(0);
    const rustCircle = result.find((c) => c.topicTags.includes("rust"));
    expect(rustCircle).toBeDefined();
    expect(rustCircle!.memberOwnerIds.length).toBe(3);
    expect(rustCircle!.score).toBeGreaterThan(0);
  });

  it("deduplicates circles with same member sets", async () => {
    const deps = makeDeps({
      "envoy:owner:a": ["rust"],
      "envoy:owner:b": ["rust"],
      "envoy:owner:c": ["rust"],
    });
    const result = await proposeCircles(deps, { minMembers: 2 });
    // Same members via topic "rust" — should be one deduped circle
    const rustCircles = result.filter((c) => c.topicTags.includes("rust"));
    expect(rustCircles.length).toBeLessThanOrEqual(1);
  });

  it("proposes capability-based circles", async () => {
    const deps = makeDeps(
      { "envoy:owner:a": [], "envoy:owner:b": [], "envoy:owner:c": [] },
      {
        "envoy:owner:a": ["rust_reviewer"],
        "envoy:owner:b": ["rust_reviewer"],
        "envoy:owner:c": [],
      },
    );
    const result = await proposeCircles(deps, { minMembers: 2 });
    const capCircle = result.find((c) => c.topicTags.includes("rust_reviewer"));
    expect(capCircle).toBeDefined();
    expect(capCircle!.memberOwnerIds).toContain("envoy:owner:a");
    expect(capCircle!.memberOwnerIds).toContain("envoy:owner:b");
  });

  it("respects maxCircles limit", async () => {
    const topics: Record<string, string[]> = {};
    for (let i = 0; i < 10; i++) {
      topics[`envoy:owner:${i}`] = [`topic-${i % 4}`]; // 4 unique topics
    }
    const deps = makeDeps(topics);
    const result = await proposeCircles(deps, { minMembers: 2, maxCircles: 2 });
    expect(result.length).toBeLessThanOrEqual(2);
  });

  it("circleFromProposal creates valid AgentCircle", () => {
    const proposal = {
      label: "Rust Circle",
      memberOwnerIds: ["envoy:owner:a", "envoy:owner:b"],
      topicTags: ["rust"],
      score: 0.6,
      reason: "2 contacts share the topic rust",
      minMembers: 2,
    };
    const circle = circleFromProposal(proposal);
    expect(circle.circleId).toBeDefined();
    expect(circle.label).toBe("Rust Circle");
    expect(circle.status).toBe("proposed");
    expect(circle.memberOwnerIds).toEqual(["envoy:owner:a", "envoy:owner:b"]);
    expect(circle.topicTags).toEqual(["rust"]);
    expect(circle.agentNote).toBe("2 contacts share the topic rust");
  });
});

// =========================================================================
// Bond Steward
// =========================================================================
describe("bond-steward", () => {
  it("detects dormant bonds beyond threshold", async () => {
    const deps: BondStewardDeps = {
      getBonds: async () => [
        { peerOwnerId: "envoy:owner:a", displayName: "Alice", level: "direct", createdAt: "2025-01-01T00:00:00.000Z" },
        { peerOwnerId: "envoy:owner:b", displayName: "Bob", level: "direct", createdAt: "2026-04-01T00:00:00.000Z" },
        { peerOwnerId: "envoy:owner:c", displayName: "Charlie", level: "public", createdAt: "2025-01-01T00:00:00.000Z" },
      ],
      getLastInteractionAt: async (id) => {
        if (id === "envoy:owner:a") return "2025-02-01T00:00:00.000Z"; // ~487 days ago
        if (id === "envoy:owner:b") return new Date().toISOString(); // today
        return null;
      },
    };

    const result = await findDormantBonds(deps, 90);
    expect(result.dormantBonds.length).toBe(1);
    expect(result.dormantBonds[0].peerOwnerId).toBe("envoy:owner:a");
    expect(result.dormantBonds[0].dormantDays).toBeGreaterThan(90);
    expect(result.summary).toContain("1 dormant bond");
  });

  it("returns empty when all bonds are active", async () => {
    const deps: BondStewardDeps = {
      getBonds: async () => [
        { peerOwnerId: "envoy:owner:a", displayName: "Alice", level: "direct", createdAt: "2026-06-01T00:00:00.000Z" },
      ],
      getLastInteractionAt: async () => new Date().toISOString(),
    };

    const result = await findDormantBonds(deps, 90);
    expect(result.dormantBonds).toHaveLength(0);
    expect(result.summary).toContain("All bonds are active");
  });

  it("only checks direct bonds, ignores public/blocked", async () => {
    const deps: BondStewardDeps = {
      getBonds: async () => [
        { peerOwnerId: "envoy:owner:a", displayName: "Alice", level: "public", createdAt: "2025-01-01T00:00:00.000Z" },
        { peerOwnerId: "envoy:owner:b", displayName: "Bob", level: "blocked", createdAt: "2025-01-01T00:00:00.000Z" },
      ],
      getLastInteractionAt: async () => "2025-02-01T00:00:00.000Z",
    };

    const result = await findDormantBonds(deps, 90);
    expect(result.dormantBonds).toHaveLength(0);
  });

  it("uses bond creation date when no interaction recorded", async () => {
    const oldDate = "2025-01-01T00:00:00.000Z";
    const deps: BondStewardDeps = {
      getBonds: async () => [
        { peerOwnerId: "envoy:owner:a", displayName: "Alice", level: "direct", createdAt: oldDate },
      ],
      getLastInteractionAt: async () => null,
    };

    const result = await findDormantBonds(deps, 90);
    expect(result.dormantBonds.length).toBe(1);
    expect(result.dormantBonds[0].dormantDays).toBeGreaterThan(90);
    expect(result.dormantBonds[0].lastInteractionAt).toBeNull();
  });
});

// =========================================================================
// Connection Suggester
// =========================================================================
describe("connection-suggester", () => {
  it("matches owner topics against peer topics", () => {
    const result = matchPeerInterests(
      ["rust", "wasm"],
      ["rust programming", "async", "networking"],
      [],
    );
    expect(result.matchedTopics).toContain("rust");
    expect(result.matchedTopics).not.toContain("wasm");
    expect(result.score).toBe(0.5); // 1 out of 2
  });

  it("matches against capabilities too", () => {
    const result = matchPeerInterests(
      ["rust_reviewer"],
      [],
      ["rust_reviewer", "translation"],
    );
    expect(result.matchedTopics).toContain("rust_reviewer");
    expect(result.score).toBe(1.0);
  });

  it("returns zero when no matches", () => {
    const result = matchPeerInterests(
      ["python"],
      ["rust", "typescript"],
      ["go"],
    );
    expect(result.matchedTopics).toHaveLength(0);
    expect(result.score).toBe(0);
  });

  it("returns zero for empty owner topics", () => {
    const result = matchPeerInterests([], ["rust"], ["rust_reviewer"]);
    expect(result.score).toBe(0);
  });
});

// =========================================================================
// Chat RAG Service
// =========================================================================
describe("chat-rag-service", () => {
  const sampleMessages: ChatRagEntry[] = [
    {
      messageId: "m1",
      contactOwnerId: "envoy:owner:bob",
      contactDisplayName: "Bob",
      text: "Hey, have you looked into distributed consensus algorithms? Raft is really interesting.",
      timestamp: "2026-05-01T10:00:00.000Z",
    },
    {
      messageId: "m2",
      contactOwnerId: "envoy:owner:bob",
      contactDisplayName: "Bob",
      text: "I found a great paper on Paxos vs Raft tradeoffs.",
      timestamp: "2026-05-02T10:00:00.000Z",
    },
    {
      messageId: "m3",
      contactOwnerId: "envoy:owner:carol",
      contactDisplayName: "Carol",
      text: "Let's grab lunch tomorrow at noon.",
      timestamp: "2026-05-03T10:00:00.000Z",
    },
    {
      messageId: "m4",
      contactOwnerId: "envoy:owner:bob",
      contactDisplayName: "Bob",
      text: "Kubernetes operators are complex but powerful.",
      timestamp: "2026-06-01T10:00:00.000Z",
    },
  ];

  it("finds messages matching query", () => {
    const results = searchChatHistory(sampleMessages, "distributed consensus");
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.entry.text.includes("Raft"))).toBe(true);
  });

  it("ranks results by relevance", () => {
    const results = searchChatHistory(sampleMessages, "Raft Paxos consensus");
    expect(results.length).toBeGreaterThan(0);
    // First result should be the most relevant
    expect(results[0].score).toBeGreaterThanOrEqual(results[results.length - 1].score);
  });

  it("respects maxResults limit", () => {
    const results = searchChatHistory(sampleMessages, "raft", { maxResults: 1 });
    expect(results.length).toBeLessThanOrEqual(1);
  });

  it("returns empty for no matches", () => {
    const results = searchChatHistory(sampleMessages, "blockchain bitcoin");
    expect(results).toHaveLength(0);
  });

  it("returns empty for short query words", () => {
    const results = searchChatHistory(sampleMessages, "a");
    expect(results).toHaveLength(0);
  });

  it("formats results with contact names and dates", () => {
    const results = searchChatHistory(sampleMessages, "Raft");
    const formatted = formatChatRagResults(results);
    expect(formatted).toContain("Bob");
    expect(formatted).toContain("2026-05-");
  });

  it("formats empty results", () => {
    const formatted = formatChatRagResults([]);
    expect(formatted).toContain("No relevant past conversations");
  });
});
