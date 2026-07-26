import { access, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createAgentShareProposalStore,
  MAX_AGENT_SHARE_PROPOSAL_AGE_MS,
  pruneAgentShareProposals,
} from "../src/agent-share-proposal-store.js";

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
      createdAt: new Date().toISOString(),
      targetOwnerId: "envoy:owner:bob",
      vaultRelativePath: "notes/a.md",
      sensitivity: "friends",
    });
    const list = await store.list();
    expect(list).toHaveLength(1);
    expect(list[0]!.proposalId).toBe("p1");

    await store.remove("p1");
    expect(await store.list()).toHaveLength(0);

    // Empty queue deletes the file.
    await expect(access(join(profileDir, "agent-share-proposals.json"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("prune drops proposals older than TTL", () => {
    const now = Date.parse("2026-07-20T00:00:00.000Z");
    const staleAt = new Date(now - MAX_AGENT_SHARE_PROPOSAL_AGE_MS - 60_000).toISOString();
    const freshAt = new Date(now - 60_000).toISOString();
    const pruned = pruneAgentShareProposals(
      [
        {
          proposalId: "old",
          createdAt: staleAt,
          targetOwnerId: "envoy:owner:bob",
          vaultRelativePath: "a.md",
          sensitivity: "friends",
        },
        {
          proposalId: "new",
          createdAt: freshAt,
          targetOwnerId: "envoy:owner:bob",
          vaultRelativePath: "b.md",
          sensitivity: "friends",
        },
      ],
      now,
    );
    expect(pruned.map((p) => p.proposalId)).toEqual(["new"]);
  });
});
