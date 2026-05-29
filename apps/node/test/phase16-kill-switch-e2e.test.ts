/**
 * E2E: Phase 16 posture kill switches block autonomous job starts.
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  cleanupPhase13Node,
  createPhase13TestNode,
  registerBondedPeer,
} from "./phase13-e2e-harness.js";

const nodes: Awaited<ReturnType<typeof createPhase13TestNode>>[] = [];

afterEach(async () => {
  await Promise.all(nodes.splice(0).map((n) => cleanupPhase13Node(n)));
});

describe.sequential("E2E Phase 16 kill switch guards", () => {
  it("blocks capability provider and document acquisition when kill switch is on", async () => {
    const alice = await createPhase13TestNode();
    const bob = await createPhase13TestNode();
    nodes.push(alice, bob);
    await registerBondedPeer(alice, bob, "Bob");

    await alice.service.updateNodeConfig({
      documentAcquisitionEnabled: true,
      capabilityProviderEnabled: true,
      autonomousKillSwitch: true,
      modelProviders: { mode: "mock" },
    });

    await expect(
      alice.service.startDocumentAcquisitionJob({ query: "blocked" }),
    ).rejects.toThrow(/kill switch/i);

    await expect(
      alice.service.startCapabilityProviderJob({
        goal: "blocked capability route",
        targetOwnerId: bob.profile.owner.ownerId,
      }),
    ).rejects.toThrow(/kill switch/i);
  });

  it("document acquisition worker tick is a no-op under kill switch", async () => {
    const alice = await createPhase13TestNode();
    nodes.push(alice);

    await alice.service.updateNodeConfig({
      documentAcquisitionEnabled: true,
      autonomousKillSwitch: false,
      modelProviders: { mode: "mock" },
    });

    const started = await alice.service.startDocumentAcquisitionJob({
      query: "local miss only",
      fileTitleHint: "nonexistent-local-file",
    });

    await alice.service.updateNodeConfig({ autonomousKillSwitch: true });

    const advanced = await alice.service.runDocumentAcquisitionWorker();
    expect(advanced).toBe(0);

    const job = await alice.service.getDocumentAcquisitionJob(started.jobId);
    expect(job?.stage).not.toBe("completed");
  });
});
