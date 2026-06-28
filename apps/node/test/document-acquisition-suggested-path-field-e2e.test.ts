/**
 * E2E: document acquisition uses knowledge.response.suggestedRelativePath (wire field only).
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
  wireDocumentAcquisitionKnowledgeSuggestedPathOnly,
} from "./phase13-e2e-harness.js";

const nodes: Awaited<ReturnType<typeof createPhase13TestNode>>[] = [];

afterEach(async () => {
  await Promise.all(nodes.splice(0).map((n) => cleanupPhase13Node(n)));
});

describe.sequential("E2E document acquisition suggestedRelativePath field", () => {
  it("completes when path is only in suggestedRelativePath, not answer text", async () => {
    const alice = await createPhase13TestNode();
    const bob = await createPhase13TestNode();
    nodes.push(alice, bob);
    await registerBondedPeer(alice, bob, "Bob");
    await registerBondedPeer(bob, alice, "Alice");
    wireDiscoveryAndShareForAcquisition(bob, alice);

    const relativePath = "shared/wire-field-only.dat";
    const content = "EMP suggestedRelativePath interop payload for document acquisition.\n";
    await mkdir(join(bob.vaultDir, "shared"), { recursive: true });
    await writeFile(join(bob.vaultDir, relativePath), content, { mode: 0o600 });

    const publishTurn = await bob.service.runDocumentAgentTurn(`publish "${relativePath}"`);
    expect(publishTurn.toolsUsed).toContain("mesh.library_publish");

    wireDocumentAcquisitionKnowledgeSuggestedPathOnly(
      bob,
      relativePath,
      "The published library contains a matching item for your query about wire field interop.",
    );

    await alice.service.updateNodeConfig({
      documentAcquisitionEnabled: true,
      modelProviders: { mode: "mock" },
    });

    await alice.mesh.dial(bob.mesh.multiaddrs[0]!);

    const started = await alice.service.startDocumentAcquisitionJob({
      query: "wire field interop document acquisition",
    });

    await waitForPhase13(async () => {
      const job = await alice.service.getDocumentAcquisitionJob(started.jobId);
      if (job?.stage === "completed") return true;
      await alice.service.runDocumentAcquisitionWorker();
      return false;
    }, 30_000);

    const job = await alice.service.getDocumentAcquisitionJob(started.jobId);
    expect(job?.stage).toBe("completed");
    expect(job?.resultVaultPath).toMatch(/^inbox\/acq-/);

    const received = await readFile(join(alice.vaultDir, job!.resultVaultPath!), "utf8");
    expect(received).toBe(content);
  });
});
