/**
 * E2E: document acquisition failure paths — empty catalog and negotiation refusal.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  cleanupPhase13Node,
  createPhase13TestNode,
  registerBondedPeer,
  waitForPhase13,
  wireDiscoveryAndShareForAcquisition,
  wireDocumentAcquisitionKnowledgeRefusal,
} from "./phase13-e2e-harness.js";

const nodes: Awaited<ReturnType<typeof createPhase13TestNode>>[] = [];

afterEach(async () => {
  await Promise.all(nodes.splice(0).map((n) => cleanupPhase13Node(n)));
});

describe.sequential("E2E document acquisition failures", () => {
  it("fails when bonded peer has no published library", async () => {
    const alice = await createPhase13TestNode();
    const bob = await createPhase13TestNode();
    nodes.push(alice, bob);
    await registerBondedPeer(alice, bob, "Bob");
    await registerBondedPeer(bob, alice, "Alice");
    wireDiscoveryAndShareForAcquisition(bob, alice);

    await alice.service.updateNodeConfig({
      documentAcquisitionEnabled: true,
      modelProviders: { mode: "mock" },
    });

    await alice.mesh.dial(bob.mesh.multiaddrs[0]!);

    const started = await alice.service.startDocumentAcquisitionJob({
      query: "quarterly report that does not exist",
    });

    await waitForPhase13(async () => {
      const job = await alice.service.getDocumentAcquisitionJob(started.jobId);
      if (job?.stage === "failed" || job?.stage === "completed") return true;
      await alice.service.runDocumentAcquisitionWorker();
      return false;
    }, 15_000);

    const job = await alice.service.getDocumentAcquisitionJob(started.jobId);
    expect(job?.stage).toBe("failed");
    expect(job?.candidates ?? []).toHaveLength(0);
  });

  it("fails after negotiation when peer always returns no match", async () => {
    const alice = await createPhase13TestNode();
    const bob = await createPhase13TestNode();
    nodes.push(alice, bob);
    await registerBondedPeer(alice, bob, "Bob");
    await registerBondedPeer(bob, alice, "Alice");
    wireDiscoveryAndShareForAcquisition(bob, alice);

    const relativePath = "shared/obscure-refusal-x7f9.dat";
    await mkdir(join(bob.vaultDir, "shared"), { recursive: true });
    await writeFile(
      join(bob.vaultDir, relativePath),
      "Ed25519 mesh security specification draft for refusal-path testing.\n",
      { mode: 0o600 },
    );
    await bob.service.runDocumentAgentTurn(`publish "${relativePath}"`);
    wireDocumentAcquisitionKnowledgeRefusal(bob);

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
      if (job?.stage === "failed" || job?.stage === "completed") return true;
      await alice.service.runDocumentAcquisitionWorker();
      return false;
    }, 30_000);

    const job = await alice.service.getDocumentAcquisitionJob(started.jobId);
    expect(job?.stage).toBe("failed");
    expect(job?.negotiationRound).toBeGreaterThanOrEqual(1);
    expect(job?.candidates.length).toBeGreaterThan(0);
    expect(job?.resultVaultPath).toBeUndefined();
  });

  it("rejects new jobs when autonomous kill switch is on", async () => {
    const alice = await createPhase13TestNode();
    nodes.push(alice);

    await alice.service.updateNodeConfig({
      documentAcquisitionEnabled: true,
      autonomousKillSwitch: true,
      modelProviders: { mode: "mock" },
    });

    await expect(
      alice.service.startDocumentAcquisitionJob({ query: "blocked by kill switch" }),
    ).rejects.toThrow(/kill switch/i);
  });
});
