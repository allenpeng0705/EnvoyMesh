/**
 * E2E: document acquisition worker — pull share from bonded published library → vault inbox.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  cleanupPhase13Node,
  connectPhase13Peers,
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

describe.sequential("E2E document acquisition vault inbox (pull share)", () => {
  it("discovers bonded library, pulls share, completes job in vault inbox", async () => {
    const alice = await createPhase13TestNode();
    const bob = await createPhase13TestNode();
    nodes.push(alice, bob);
    await registerBondedPeer(alice, bob, "Bob");
    await registerBondedPeer(bob, alice, "Alice");
    wireDiscoveryAndShareForAcquisition(bob, alice);

    const content = "document acquisition pull e2e payload\n";
    await mkdir(join(bob.vaultDir, "shared"), { recursive: true });
    await writeFile(join(bob.vaultDir, "shared/acq-catalog.txt"), content, { mode: 0o600 });

    const publishTurn = await bob.service.runDocumentAgentTurn('publish "shared/acq-catalog.txt"');
    expect(publishTurn.toolsUsed).toContain("mesh.library_publish");

    wireDocumentAcquisitionKnowledgeReply(
      bob,
      "shared/acq-catalog.txt",
      "The acq catalog document is shared/acq-catalog.txt",
    );

    await alice.service.updateNodeConfig({
      documentAcquisitionEnabled: true,
      modelProviders: { mode: "mock" },
    });

    await connectPhase13Peers(alice, bob);

    const started = await alice.service.startDocumentAcquisitionJob({
      query: "acq catalog",
      fileTitleHint: "acq-catalog",
    });

    await waitForPhase13(async () => {
      const job = await alice.service.getDocumentAcquisitionJob(started.jobId);
      if (job?.stage === "completed") return true;
      if (job?.stage === "awaiting_share_accept" || job?.stage === "transferring") {
        await alice.service.runDocumentAcquisitionWorker();
      } else if (job?.stage !== "completed") {
        await alice.service.runDocumentAcquisitionWorker();
      }
      return false;
    }, 30_000);

    const job = await alice.service.getDocumentAcquisitionJob(started.jobId);
    expect(job?.stage).toBe("completed");
    expect(job?.resultVaultPath).toMatch(/^inbox\/acq-/);

    const received = await readFile(join(alice.vaultDir, job!.resultVaultPath!), "utf8");
    expect(received).toBe(content);
  });
});
