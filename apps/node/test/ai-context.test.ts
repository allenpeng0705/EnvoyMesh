import { mkdir, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildVaultIndex } from "@envoymesh/vault";
import {
  searchChatHistoryRag,
  searchVaultKnowledgeBase,
  selectRecentThreadMessages,
  type ThreadMessageView,
} from "../src/ai-context.js";

let workspaceDir: string;
let vaultDir: string;

beforeEach(async () => {
  workspaceDir = join(tmpdir(), `envoymesh-ai-context-${randomUUID()}`);
  vaultDir = join(workspaceDir, "shared");
  await mkdir(join(vaultDir, "knowledge"), { recursive: true });
});

afterEach(async () => {
  await rm(workspaceDir, { recursive: true, force: true });
});

function makeMessages(count: number, topic = "weather"): ThreadMessageView[] {
  return Array.from({ length: count }, (_, i) => ({
    messageId: `msg-${i}`,
    sender: i % 2 === 0 ? "Alice" : "Me",
    text: i < count - 5 ? `${topic} filler ${i}` : `Latest message ${i}`,
    timestamp: new Date(Date.now() - (count - i) * 60_000).toISOString(),
  }));
}

describe("selectRecentThreadMessages", () => {
  it("returns all messages when under the limit", () => {
    const messages = makeMessages(5);
    expect(selectRecentThreadMessages(messages, 20)).toHaveLength(5);
  });

  it("returns only the latest N messages", () => {
    const messages = makeMessages(25);
    const recent = selectRecentThreadMessages(messages, 20);
    expect(recent).toHaveLength(20);
    expect(recent[0]?.messageId).toBe("msg-5");
    expect(recent[19]?.messageId).toBe("msg-24");
  });
});

describe("searchChatHistoryRag", () => {
  it("retrieves older messages matching the query outside the recent window", () => {
    const messages: ThreadMessageView[] = [
      {
        messageId: "old-project",
        sender: "Alice",
        text: "Remember the EnvoyMesh relay deployment plan?",
        timestamp: "2025-01-01T00:00:00.000Z",
      },
      ...makeMessages(22),
    ];
    const hits = searchChatHistoryRag(messages, "EnvoyMesh relay deployment", {
      recentLimit: 20,
      ragLimit: 5,
    });
    expect(hits.some((m) => m.messageId === "old-project")).toBe(true);
    expect(hits.every((m) => !selectRecentThreadMessages(messages, 20).some((r) => r.messageId === m.messageId))).toBe(
      true,
    );
  });

  it("returns empty when query has no token overlap", () => {
    const messages = makeMessages(30);
    expect(
      searchChatHistoryRag(messages, "zzzzqqqq", { recentLimit: 20, ragLimit: 5 }),
    ).toEqual([]);
  });
});

describe("searchVaultKnowledgeBase", () => {
  it("public scope searches only publicVaultPaths", async () => {
    await mkdir(join(vaultDir, "knowledge", "public"), { recursive: true });
    await mkdir(join(vaultDir, "knowledge", "private"), { recursive: true });
    await writeFile(
      join(vaultDir, "knowledge", "public", "faq.md"),
      "EnvoyMesh is a decentralized P2P mesh for autonomous AI agents.",
    );
    await writeFile(
      join(vaultDir, "knowledge", "private", "diary.md"),
      "My private diary about health and family.",
    );
    const index = await buildVaultIndex({ rootDir: vaultDir });

    const publicHits = searchVaultKnowledgeBase({
      vaultIndex: index,
      query: "EnvoyMesh decentralized",
      knowledgeAccess: "public",
      knowledgeScope: "public",
      knowledgeBase: { enabled: true, publicVaultPaths: ["knowledge/public/"] },
    });
    expect(publicHits.length).toBeGreaterThan(0);
    expect(publicHits.every((r) => r.document.relativePath.includes("public"))).toBe(true);

    const publicScopeMissesPrivate = searchVaultKnowledgeBase({
      vaultIndex: index,
      query: "private diary health family",
      knowledgeAccess: "personal",
      knowledgeScope: "public",
      knowledgeBase: {
        enabled: true,
        publicVaultPaths: ["knowledge/public/"],
        privateVaultPaths: ["knowledge/private/"],
      },
    });
    expect(publicScopeMissesPrivate).toEqual([]);

    const ownerHits = searchVaultKnowledgeBase({
      vaultIndex: index,
      query: "private diary health",
      knowledgeAccess: "personal",
      knowledgeScope: "owner",
      knowledgeBase: {
        enabled: true,
        publicVaultPaths: ["knowledge/public/"],
        privateVaultPaths: ["knowledge/private/"],
      },
    });
    expect(ownerHits.length).toBeGreaterThan(0);
    expect(ownerHits.some((r) => r.document.relativePath.includes("private"))).toBe(true);
  });

  it("respects knowledgeAccess sensitivity ceiling", async () => {
    await mkdir(join(vaultDir, "personal"), { recursive: true });
    await writeFile(join(vaultDir, "personal", "diary.md"), "My personal diary entry about health.");
    const index = await buildVaultIndex({ rootDir: vaultDir });

    const publicOnly = searchVaultKnowledgeBase({
      vaultIndex: index,
      query: "personal diary health",
      knowledgeAccess: "public",
      knowledgeScope: "owner",
      knowledgeBase: { enabled: true, privateVaultPaths: ["personal/"] },
    });
    expect(publicOnly).toEqual([]);
  });
});
