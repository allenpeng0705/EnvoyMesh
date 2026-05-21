import { createLocalTaskStore } from "@envoymesh/local-store";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { executeTool, type MeshToolContext } from "../src/tool-registry.js";
import { DEFAULT_DOCUMENT_AUTONOMY_POLICY } from "@envoymesh/api";

let profileDir: string;

beforeEach(async () => {
  profileDir = await mkdtemp(join(tmpdir(), "envoymesh-doc-autonomy-"));
  await mkdir(profileDir, { recursive: true });
});

afterEach(async () => {
  await rm(profileDir, { recursive: true, force: true });
});

function minimalContext(overrides: Partial<MeshToolContext>): MeshToolContext {
  const taskStore = createLocalTaskStore(profileDir);
  return {
    trustStore: {} as MeshToolContext["trustStore"],
    peerDirectoryStore: {} as MeshToolContext["peerDirectoryStore"],
    taskStore,
    agentIdentity: {
      agentId: "agent-1",
      agentPeerId: "envoy_agent_test",
      privateKeyPem: "pk",
      publicKeyPem: "pub",
    },
    ownerIdentity: { ownerId: "envoy:owner:self" },
    agentCredential: {} as MeshToolContext["agentCredential"],
    ...overrides,
  };
}

describe("document autonomy enforcement (ADB-F)", () => {
  it("mesh.share_propose creates Inbox proposal at tier 0", async () => {
    const submit = vi.fn(async () => ({ proposalId: "p1" }));
    const shareFile = vi.fn(async () => {});

    const result = await executeTool(
      "mesh.share_propose",
      {
        targetOwnerId: "envoy:owner:alex",
        vaultRelativePath: "docs/a.pdf",
        sensitivity: "friends",
      },
      minimalContext({
        documentAutonomy: DEFAULT_DOCUMENT_AUTONOMY_POLICY,
        submitAgentShareProposal: submit,
        shareFile,
        getBonds: async () => [{ peerOwnerId: "envoy:owner:alex", level: "direct", displayName: "Alex" }],
      }),
    );

    expect(result.ok).toBe(true);
    expect(submit).toHaveBeenCalledTimes(1);
    expect(shareFile).not.toHaveBeenCalled();
  });

  it("mesh.share_propose auto-shares at tier 2 for direct bonds", async () => {
    const submit = vi.fn(async () => ({ proposalId: "p1" }));
    const shareFile = vi.fn(async () => {});

    const result = await executeTool(
      "mesh.share_propose",
      {
        targetOwnerId: "envoy:owner:alex",
        vaultRelativePath: "docs/a.pdf",
        sensitivity: "friends",
      },
      minimalContext({
        documentAutonomy: { ...DEFAULT_DOCUMENT_AUTONOMY_POLICY, maxAutonomousShareTier: 2 },
        submitAgentShareProposal: submit,
        shareFile,
        getBonds: async () => [{ peerOwnerId: "envoy:owner:alex", level: "direct", displayName: "Alex" }],
      }),
    );

    expect(result.ok).toBe(true);
    expect(shareFile).toHaveBeenCalledWith({
      targetOwnerId: "envoy:owner:alex",
      vaultRelativePath: "docs/a.pdf",
      sensitivity: "friends",
    });
    expect(submit).not.toHaveBeenCalled();
    expect((result.result as { autoShared?: boolean }).autoShared).toBe(true);
  });
});
