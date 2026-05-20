import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAgentShareProposalStore } from "../src/agent-share-proposal-store.js";

describe("agent-share-proposal-store (FS-E)", () => {
  let profileDir: string;

  beforeEach(async () => {
    profileDir = await mkdtemp(join(tmpdir(), "envoy-agent-share-"));
    await mkdir(profileDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(profileDir, { recursive: true, force: true });
  });

  it("persists proposals across upsert + list + remove", async () => {
    const store = createAgentShareProposalStore(profileDir);
    await store.upsert({
      proposalId: "p1",
      createdAt: "2026-05-21T12:00:00.000Z",
      targetOwnerId: "envoy:owner:bob",
      vaultRelativePath: "notes/a.md",
      sensitivity: "friends",
    });
    const list = await store.list();
    expect(list).toHaveLength(1);
    expect(list[0].proposalId).toBe("p1");

    await store.remove("p1");
    expect(await store.list()).toHaveLength(0);

    const raw = await readFile(join(profileDir, "agent-share-proposals.json"), "utf8");
    expect(raw).toContain('"proposals": []');
  });
});
