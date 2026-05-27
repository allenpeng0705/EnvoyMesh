import { mkdir, writeFile } from "node:fs/promises";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  REPUTATION_ANCHOR_BUNDLE_FILE,
  createReputationAnchorStore,
} from "../src/reputation-anchor-store.js";

describe("reputation-anchor-store", () => {
  let profileDir: string;

  afterEach(async () => {
    if (profileDir) {
      await rm(profileDir, { recursive: true, force: true });
    }
  });

  it("filters attestations by subject and expiry", async () => {
    profileDir = await mkdtemp(join(tmpdir(), "envoy-reputation-anchors-"));
    await mkdir(profileDir, { recursive: true });
    await writeFile(
      join(profileDir, REPUTATION_ANCHOR_BUNDLE_FILE),
      JSON.stringify({
        version: "0.1",
        updatedAt: new Date().toISOString(),
        attestations: [
          {
            attestationId: "a1",
            anchorId: "anchor-1",
            anchorName: "Test Anchor",
            subjectOwnerId: "envoy:owner:alice",
            claim: "verified contributor",
            issuedAt: "2026-01-01T00:00:00.000Z",
          },
          {
            attestationId: "a2",
            anchorId: "anchor-1",
            anchorName: "Test Anchor",
            subjectOwnerId: "envoy:owner:bob",
            claim: "expired",
            issuedAt: "2026-01-01T00:00:00.000Z",
            expiresAt: "2026-01-02T00:00:00.000Z",
          },
        ],
      }),
      "utf8",
    );

    const store = createReputationAnchorStore(profileDir);
    const alice = await store.listAttestations("envoy:owner:alice");
    const bob = await store.listAttestations("envoy:owner:bob");

    expect(alice).toHaveLength(1);
    expect(alice[0]?.attestationId).toBe("a1");
    expect(bob).toHaveLength(0);
  });
});
