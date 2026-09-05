import { describe, expect, it } from "vitest";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  DelegatedChainStore,
  bumpOwnershipEpochForRestart,
  createRemoteOwnership,
  enrichChainGetStateWithOwnership,
  evaluateAssignerStranded,
  markOwnershipActive,
  parseRemoteOwnership,
  resolveCancelDelegated,
  resolveReclaimAssigner,
  shouldMarkAssignerStranded,
  syntheticDelegatedChainGetState,
} from "../src/chain-remote-reclaim.js";

describe("chain-remote-reclaim (Phase 64A)", () => {
  it("creates ownership with epoch and bump changes status + epoch", () => {
    const ownership = createRemoteOwnership({
      chainId: "chain_1",
      creatorPeerId: "creator_peer",
      creatorOwnerId: "creator_owner",
      assignerPeerId: "assigner_peer",
      assignerOwnerId: "assigner_owner",
      goal: "ship it",
    });
    expect(ownership.status).toBe("delegated");
    expect(ownership.ownershipEpoch.startsWith("own_")).toBe(true);

    const bumped = bumpOwnershipEpochForRestart(ownership);
    expect(bumped.status).toBe("assigner_recovering");
    expect(bumped.ownershipEpoch).not.toBe(ownership.ownershipEpoch);

    const active = markOwnershipActive(bumped);
    expect(active.status).toBe("assigner_active");
  });

  it("parses ownership round-trip and evaluates stranded scaffold", () => {
    const ownership = createRemoteOwnership({
      chainId: "chain_2",
      creatorPeerId: "c",
      creatorOwnerId: "co",
      assignerPeerId: "a",
      assignerOwnerId: "ao",
    });
    const parsed = parseRemoteOwnership({ ...ownership });
    expect(parsed?.chainId).toBe("chain_2");
    expect(evaluateAssignerStranded({
      ownership,
      assignerUnreachable: true,
      graceElapsed: true,
    })).toEqual({ stranded: true, reason: "assigner_unreachable_past_grace" });
    expect(evaluateAssignerStranded({
      ownership,
      assignerUnreachable: true,
      graceElapsed: false,
    }).stranded).toBe(false);
  });

  it("persists creator delegated ledger to disk", async () => {
    const dir = await mkdtemp(join(tmpdir(), "envoy-delegated-"));
    const store = new DelegatedChainStore();
    await store.init(dir);
    const ownership = createRemoteOwnership({
      chainId: "chain_disk",
      creatorPeerId: "c",
      creatorOwnerId: "co",
      assignerPeerId: "a",
      assignerOwnerId: "ao",
      goal: "persist me",
      status: "delegated",
    });
    await store.upsert(ownership);
    const onDisk = JSON.parse(
      await readFile(join(dir, "team-jobs", "delegated", "chain_disk.json"), "utf8"),
    );
    expect(onDisk.chainId).toBe("chain_disk");

    const store2 = new DelegatedChainStore();
    await store2.init(dir);
    expect(store2.get("chain_disk")?.goal).toBe("persist me");
    expect(store2.listActive()).toHaveLength(1);
  });

  it("enriches chainGetState for creator from status mirror", () => {
    const ownership = createRemoteOwnership({
      chainId: "chain_ui",
      creatorPeerId: "creator_peer",
      creatorOwnerId: "co",
      assignerPeerId: "assigner_peer",
      assignerOwnerId: "ao",
      goal: "watch me",
      status: "assigner_stranded",
    });
    const synthetic = syntheticDelegatedChainGetState(ownership);
    expect(synthetic.goal).toBe("watch me");
    expect(synthetic.remoteOwnership?.localRole).toBe("creator");
    expect(synthetic.assignerStranded?.canReclaim).toBe(true);

    const enriched = enrichChainGetStateWithOwnership(
      {
        chainId: "chain_ui",
        chainMandateId: "m1",
        subtaskCount: 2,
        bidCount: 0,
        awardedCount: 1,
        partialCount: 0,
        cancelledCount: 0,
        chainCancelled: false,
        published: false,
        budgetSpentUsd: 0,
        budgetMaxUsd: 1,
        budgetReservedUsd: 0,
        budgetSynthesisUsd: 0,
      },
      ownership,
      "assigner_peer",
    );
    expect(enriched.remoteOwnership?.localRole).toBe("assigner");
    expect(enriched.assignerStranded?.canCancel).toBe(true);
  });

  it("64B reclaim/cancel gates and stranded scan", () => {
    const ownership = createRemoteOwnership({
      chainId: "chain_stub",
      creatorPeerId: "c",
      creatorOwnerId: "co",
      assignerPeerId: "a",
      assignerOwnerId: "ao",
      status: "assigner_stranded",
      goal: "do the thing",
    });
    expect(resolveReclaimAssigner({ chainId: "chain_stub", ownership }).ok).toBe(true);
    expect(resolveCancelDelegated({ chainId: "chain_stub", ownership }).ok).toBe(true);
    expect(resolveReclaimAssigner({ chainId: "missing" }).ok).toBe(false);
    expect(
      shouldMarkAssignerStranded({
        ownership: {
          ...ownership,
          status: "assigner_active",
          lastAssignerHeartbeatAt: new Date(Date.now() - 400_000).toISOString(),
        },
        assignerReachable: false,
      }).stranded,
    ).toBe(true);
  });

  it("applyOwnershipNotify accepts newer epochs and rejects stale clocks", async () => {
    const { applyOwnershipNotify } = await import("../src/chain-remote-reclaim.js");
    const current = createRemoteOwnership({
      chainId: "chain_n",
      creatorPeerId: "c",
      creatorOwnerId: "co",
      assignerPeerId: "a",
      assignerOwnerId: "ao",
      status: "delegated",
    });
    current.lastAssignerHeartbeatAt = "2026-09-05T01:00:00.000Z";
    const ok = applyOwnershipNotify({
      current,
      notify: {
        chainId: "chain_n",
        ownershipEpoch: "own_new",
        status: "assigner_recovering",
        assignerPeerId: "a",
        creatorPeerId: "c",
        createdAt: "2026-09-05T01:01:00.000Z",
      },
    });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.ownership.status).toBe("assigner_recovering");

    const stale = applyOwnershipNotify({
      current: ok.ok ? ok.ownership : current,
      notify: {
        chainId: "chain_n",
        ownershipEpoch: "own_old",
        status: "assigner_active",
        assignerPeerId: "a",
        creatorPeerId: "c",
        createdAt: "2026-09-05T00:50:00.000Z",
      },
    });
    expect(stale.ok).toBe(false);
  });
});

describe("chain reclaim hydrate (Phase 64B)", () => {
  it("resumes from status mirror with awarded workers", async () => {
    const { hydrateReclaimedChainState, buildReclaimMandate } = await import(
      "../src/chain-reclaim-hydrate.js"
    );
    const ownership = createRemoteOwnership({
      chainId: "chain_resume",
      creatorPeerId: "creator_peer",
      creatorOwnerId: "creator_owner",
      assignerPeerId: "assigner_peer",
      assignerOwnerId: "assigner_owner",
      goal: "finish the brief",
      status: "assigner_stranded",
    });
    ownership.statusMirror = {
      phase: "running",
      awardMode: "direct",
      subtaskCount: 1,
      awardedCount: 1,
      partialCount: 0,
      updatedAt: "2026-09-05T02:00:00.000Z",
      steps: [
        {
          subtaskId: "step_a",
          objective: "draft",
          state: "running",
          workerPeerId: "worker_1",
        },
      ],
    };
    const unsigned = buildReclaimMandate({
      chainId: "chain_resume",
      issuerOwnerId: "creator_owner",
    });
    const mandate = { ...unsigned, signature: "stub" };
    const result = hydrateReclaimedChainState({
      ownership,
      mandate: mandate as import("@envoymesh/protocol").ChainMandate,
      now: new Date("2026-09-05T02:01:00.000Z"),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.mode).toBe("resume");
    if (result.mode !== "resume") return;
    expect(result.state.chainId).toBe("chain_resume");
    expect(result.workerPeerIds).toEqual(["worker_1"]);
    expect(result.ownership.assignerPeerId).toBe("creator_peer");
    expect(result.ownership.status).toBe("reclaimed");
  });

  it("falls back to restart when mirror has no awarded workers", async () => {
    const { hydrateReclaimedChainState, buildReclaimMandate } = await import(
      "../src/chain-reclaim-hydrate.js"
    );
    const ownership = createRemoteOwnership({
      chainId: "chain_restart",
      creatorPeerId: "c",
      creatorOwnerId: "co",
      assignerPeerId: "a",
      assignerOwnerId: "ao",
      goal: "start over",
      status: "assigner_stranded",
    });
    const unsigned = buildReclaimMandate({
      chainId: "chain_restart",
      issuerOwnerId: "co",
    });
    const result = hydrateReclaimedChainState({
      ownership,
      mandate: { ...unsigned, signature: "stub" } as import("@envoymesh/protocol").ChainMandate,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.mode).toBe("fallback_restart");
  });
});
