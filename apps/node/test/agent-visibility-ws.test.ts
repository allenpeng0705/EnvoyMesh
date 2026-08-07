/**
 * Integration: agentVisibility silent stores Activity but suppresses agent:activity WS push.
 */
import { createAgentCard } from "@envoymesh/protocol";
import type { AgentActivityRecord } from "@envoymesh/api";
import { afterEach, describe, expect, it } from "vitest";
import {
  cleanupPhase13Harness,
  createPhase13TestNode,
  waitForPhase13,
} from "./phase13-e2e-harness.js";

afterEach(async () => {
  await cleanupPhase13Harness();
});

describe("agentVisibility WS push (Phase 13E)", () => {
  it("silent mode retains rows in listAgentActivity but does not emit agent:activity", async () => {
    const alice = await createPhase13TestNode();
    await alice.service.updateNodeConfig({
      agentVisibility: { research: "silent" },
    });

    const pushed: AgentActivityRecord[] = [];
    alice.service.on("agent:activity", (record) => {
      pushed.push(record);
    });

    const peerOwnerId = "envoy:owner:peer-agent";
    await alice.service.recordAgentCardCached(
      peerOwnerId,
      createAgentCard({
        ownerId: peerOwnerId,
        displayName: "Peer Agent",
        nodeProfile: "primary",
        membership: ["task.execute"],
      }),
    );

    await waitForPhase13(async () => (await alice.service.listAgentActivity({ limit: 5 })).length > 0);

    const rows = await alice.service.listAgentActivity({ limit: 5 });
    expect(rows.some((row) => row.summary.includes("Peer Agent"))).toBe(true);
    expect(pushed).toHaveLength(0);
  });

  it("brief mode emits agent:activity only for milestone kinds", async () => {
    const alice = await createPhase13TestNode();
    await alice.service.updateNodeConfig({
      agentVisibility: { research: "brief" },
    });

    const pushed: AgentActivityRecord[] = [];
    alice.service.on("agent:activity", (record) => {
      pushed.push(record);
    });

    await alice.service.recordAgentCardCached(
      "envoy:owner:peer-brief",
      createAgentCard({
        ownerId: "envoy:owner:peer-brief",
        displayName: "Brief Peer",
        nodeProfile: "primary",
        membership: ["task.execute"],
      }),
    );

    await waitForPhase13(async () => (await alice.service.listAgentActivity({ limit: 5 })).length > 0);
    expect(pushed).toHaveLength(0);
  });
});
