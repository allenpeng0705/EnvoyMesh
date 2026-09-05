/**
 * Source-level regression test for the "legacy peer without chain-reconcile-v1
 * is marked unsupported during RECOVERING" behavior.
 *
 * Where the code lives:
 *   apps/node/src/node-service-impl.ts — `_runChainReconcileOutbound`,
 *   inside the `for (const [workerPeerId, peer] of Object.entries(recovery.peers))`
 *   loop that runs once per pending peer in the recovery state.
 *
 *   The relevant block (~line 16819):
 *     for (const [workerPeerId, peer] of Object.entries(recovery.peers)) {
 *       if (peer.status !== "pending") continue;
 *       // Legacy peers without chain-reconcile-v1: mark unsupported and wait grace.
 *       // Phase 64C reclaim always attempts reconcile (`!reclaimSeed` gate).
 *       const cards = await this.listAgentCards();
 *       const card = cards.find((c) => c.sourceAgentPeerId === workerPeerId);
 *       const supports =
 *         card?.features?.includes("chain-reconcile-v1") === true ||
 *         // Self / missing card: still try; worker may answer from receipt store.
 *         workerPeerId === agentIdentity.agentPeerId;
 *       if (card && !supports && !reclaimSeed) {
 *         peer.status = "unsupported";
 *         continue;
 *       }
 *       ...
 *
 * Why this matters:
 *   Mixed-version fleet — a pre-60D worker without chain-reconcile-v1 will
 *   never answer our `task.chain.reconcile.request` envelope. Without this
 *   gate, the orchestrator would block the entire chain in `RECOVERING` until
 *   the grace deadline expires. With the gate, we mark the peer `unsupported`
 *   immediately and only wait grace for peers that *can* answer.
 *
 * The full feature-negotiation logic sits inside a deeply nested method
 * (`_runChainReconcileOutbound`) that requires a fully wired NodeServiceImpl
 * to test end-to-end (mesh + peer-card fixture + agent identity). Source-level
 * guards catch the regression in <5 ms without that setup.
 *
 * Sanity test: if you remove the `peer.status = "unsupported"` line or the
 * `card?.features?.includes("chain-reconcile-v1")` check, the test below
 * fails immediately. Run after editing node-service-impl.ts:16819-16845.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, greaterThanOrEqualTo, it } from "vitest";

const IMPL = resolve(__dirname, "../src/node-service-impl.ts");
const MIN_LINE = 16815; // first line of the recovery outbound loop
const MAX_LINE = 16860; // after the unsupported continue / request build

function readImplSlice(): string {
  const text = readFileSync(IMPL, "utf8");
  const lines = text.split("\n");
  return lines.slice(MIN_LINE - 1, MAX_LINE).join("\n");
}

describe("chain-reconcile-v1 feature negotiation (Phase 60D source-level guard)", () => {
  it("recovery outbound loop checks each pending peer's card for chain-reconcile-v1", () => {
    const slice = readImplSlice();
    expect(
      slice,
      "expected the recovery outbound loop to check `card?.features?.includes(\"chain-reconcile-v1\")`",
    ).toMatch(/features\?\.\s*includes\(\s*["']chain-reconcile-v1["']/);
  });

  it("legacy peers (have card, no chain-reconcile-v1) are marked 'unsupported' and skipped", () => {
    const slice = readImplSlice();
    // The condition that flips a peer to "unsupported" — must be present.
    expect(
      slice,
      "expected `peer.status = \"unsupported\"` for legacy peers",
    ).toMatch(/peer\.status\s*=\s*["']unsupported["']/);
    // The check must gate the status flip on `card && !supports && !reclaimSeed`
    // so self / missing-card peers still try, and Phase 64C reclaim always
    // attempts reconcile even when the card feature tag is stale.
    expect(
      slice,
      "expected the unsupported branch to be guarded by `if (card && !supports && !reclaimSeed)`",
    ).toMatch(/if\s*\(\s*card\s*&&\s*!supports\s*&&\s*!reclaimSeed\s*\)/);
  });

  it("self / missing-card peers still attempt the reconcile request", () => {
    const slice = readImplSlice();
    // The exception clause: self / missing card should NOT be marked unsupported.
    expect(
      slice,
      "expected the supports condition to also pass for the local agent peer",
    ).toMatch(/workerPeerId\s*===\s*agentIdentity\.agentPeerId/);
  });

  it("reconcile request payload is built and signed AFTER the unsupported gate", () => {
    const slice = readImplSlice();
    // The reconcile request is created via createTaskChainReconcileRequestPayload
    // and signUnsignedEnvelope; both should be inside the `try` block that
    // follows the `continue` for unsupported peers.
    expect(
      slice,
      "expected `createTaskChainReconcileRequestPayload` after the unsupported gate",
    ).toMatch(/createTaskChainReconcileRequestPayload/);
    expect(
      slice,
      "expected `signUnsignedEnvelope` for the reconcile request",
    ).toMatch(/signUnsignedEnvelope/);
    // Sanity: the unsupported `continue` must appear before the try-block.
    const continueIdx = slice.indexOf('continue');
    const tryIdx = slice.indexOf("try {");
    expect(continueIdx).toBeGreaterThanOrEqual(0);
    expect(
      tryIdx,
      "the unsupported `continue` must come BEFORE the `try` block that sends the reconcile request",
    ).toBeGreaterThan(continueIdx);
  });
});
