/**
 * E2E: document acquisition completes from local vault RAG hit (no peer network).
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  cleanupPhase13Node,
  createPhase13TestNode,
  primeLocalVaultRagIndex,
  waitForPhase13,
} from "./phase13-e2e-harness.js";

const nodes: Awaited<ReturnType<typeof createPhase13TestNode>>[] = [];

afterEach(async () => {
  await Promise.all(nodes.splice(0).map((n) => cleanupPhase13Node(n)));
});

describe.sequential("E2E document acquisition local RAG hit", () => {
  it("completes from semantic vault match without network peers", async () => {
    const alice = await createPhase13TestNode();
    nodes.push(alice);

    const relativePath = "knowledge/public/ed25519-spec.md";
    const content =
      "Ed25519 mesh security specification draft for autonomous agent signing conventions.\n";
    await mkdir(join(alice.vaultDir, "knowledge/public"), { recursive: true });
    await writeFile(join(alice.vaultDir, relativePath), content, { mode: 0o600 });

    await alice.service.updateNodeConfig({
      documentAcquisitionEnabled: true,
      modelProviders: { mode: "mock" },
      aiSettings: {
        knowledgeBase: {
          enabled: true,
          ragMode: "vector",
          embedding: { mode: "mock" },
          publicVaultPaths: ["knowledge/public/"],
        },
      },
    });

    await primeLocalVaultRagIndex(alice);

    const started = await alice.service.startDocumentAcquisitionJob({
      query: "Ed25519 mesh security specification",
    });

    await waitForPhase13(async () => {
      const job = await alice.service.getDocumentAcquisitionJob(started.jobId);
      if (job?.stage === "completed") return true;
      await alice.service.runDocumentAcquisitionWorker();
      return false;
    }, 30_000);

    const job = await alice.service.getDocumentAcquisitionJob(started.jobId);
    expect(job?.stage).toBe("completed");
    expect(job?.resultVaultPath).toBe(relativePath);
    expect(job?.candidates ?? []).toHaveLength(0);

    const onDisk = await readFile(join(alice.vaultDir, relativePath), "utf8");
    expect(onDisk).toBe(content);
  });
});
