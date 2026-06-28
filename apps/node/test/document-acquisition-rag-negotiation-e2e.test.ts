/**
 * E2E: document acquisition completes via RAG-style knowledge negotiation when
 * the published filename does not match the natural-language query.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  cleanupPhase13Node,
  createPhase13TestNode,
  registerBondedPeer,
  waitForPhase13,
  wireDiscoveryAndShareForAcquisition,
  wireDocumentAcquisitionKnowledgeReply,
} from "./phase13-e2e-harness.js";

const nodes: Awaited<ReturnType<typeof createPhase13TestNode>>[] = [];

afterEach(async () => {
  await Promise.all(nodes.splice(0).map((n) => cleanupPhase13Node(n)));
});

describe.sequential("E2E document acquisition RAG negotiation", () => {
  it("matches via knowledge.query when filename does not match query", async () => {
    const alice = await createPhase13TestNode();
    const bob = await createPhase13TestNode();
    nodes.push(alice, bob);
    await registerBondedPeer(alice, bob, "Bob");
    await registerBondedPeer(bob, alice, "Alice");
    wireDiscoveryAndShareForAcquisition(bob, alice);

    const relativePath = "shared/obscure-x7f9.dat";
    const content =
      "Ed25519 mesh security specification draft — autonomous agent signing conventions.\n";
    await mkdir(join(bob.vaultDir, "shared"), { recursive: true });
    await writeFile(join(bob.vaultDir, relativePath), content, { mode: 0o600 });

    const publishTurn = await bob.service.runDocumentAgentTurn(`publish "${relativePath}"`);
    expect(publishTurn.toolsUsed).toContain("mesh.library_publish");

    wireDocumentAcquisitionKnowledgeReply(
      bob,
      relativePath,
      "Ed25519 mesh security specification is in this published library item.",
    );

    await alice.service.updateNodeConfig({
      documentAcquisitionEnabled: true,
      modelProviders: { mode: "mock" },
    });

    await alice.mesh.dial(bob.mesh.multiaddrs[0]!);

    const started = await alice.service.startDocumentAcquisitionJob({
      query: "Ed25519 mesh security specification",
    });

    await waitForPhase13(async () => {
      const job = await alice.service.getDocumentAcquisitionJob(started.jobId);
      if (job?.stage === "completed") return true;
      if (
        job?.stage === "awaiting_share_accept" ||
        job?.stage === "transferring" ||
        job?.stage !== "completed"
      ) {
        await alice.service.runDocumentAcquisitionWorker();
      }
      return false;
    }, 30_000);

    const job = await alice.service.getDocumentAcquisitionJob(started.jobId);
    expect(job?.stage).toBe("completed");
    expect(job?.resultVaultPath).toMatch(/^inbox\/acq-/);
    expect(job?.negotiationRound).toBeGreaterThanOrEqual(1);

    const received = await readFile(join(alice.vaultDir, job!.resultVaultPath!), "utf8");
    expect(received).toBe(content);
  });
});
