/**
 * Phase 60F — lightweight in-process lab nodes (no libp2p).
 *
 * Real three-home mesh remains in `chain-three-home-smoke` / phase13 harness.
 * These adapters drive deterministic orchestrator + journal scenarios.
 */

import { AgentNetworkLabClock } from "./lab-clock.js";
import { AgentNetworkLabTransport, type LabEnvelope } from "./lab-transport.js";
import { AgentNetworkLabBondStore, labTriangleBonds } from "./lab-bonds.js";
import type { ChainJournalEvent } from "../../../src/chain-active-journal.js";

export type LabNodeRole = "assigner" | "harness" | "openclaw";

export type LabNode = {
  role: LabNodeRole;
  peerId: string;
  ownerId: string;
  inbox: LabEnvelope[];
};

export type AgentNetworkLabRuntime = {
  clock: AgentNetworkLabClock;
  transport: AgentNetworkLabTransport;
  bonds: AgentNetworkLabBondStore;
  nodes: Record<LabNodeRole, LabNode>;
  journal: ChainJournalEvent[];
  appendJournal: (event: Omit<ChainJournalEvent, "seq" | "eventId"> & { eventId?: string }) => void;
  deliver: (envelope: LabEnvelope) => boolean;
  flush: () => void;
};

export function createAgentNetworkLabRuntime(opts?: {
  startMs?: number;
}): AgentNetworkLabRuntime {
  const clock = new AgentNetworkLabClock(opts?.startMs);
  const transport = new AgentNetworkLabTransport();
  const assignerOwner = "envoy:owner:assigner";
  const harnessOwner = "envoy:owner:harness";
  const openclawOwner = "envoy:owner:openclaw";
  const bonds = new AgentNetworkLabBondStore(
    labTriangleBonds(assignerOwner, harnessOwner, openclawOwner),
  );
  const nodes: Record<LabNodeRole, LabNode> = {
    assigner: {
      role: "assigner",
      peerId: "lab_assigner",
      ownerId: assignerOwner,
      inbox: [],
    },
    harness: {
      role: "harness",
      peerId: "lab_harness",
      ownerId: harnessOwner,
      inbox: [],
    },
    openclaw: {
      role: "openclaw",
      peerId: "lab_openclaw",
      ownerId: openclawOwner,
      inbox: [],
    },
  };
  const byPeer = new Map(Object.values(nodes).map((n) => [n.peerId, n]));
  const journal: ChainJournalEvent[] = [];
  let seq = 0;

  return {
    clock,
    transport,
    bonds,
    nodes,
    journal,
    appendJournal(event) {
      seq += 1;
      journal.push({
        version: 1,
        eventId: event.eventId ?? `lab_evt_${seq}`,
        chainId: event.chainId,
        seq,
        at: event.at ?? clock.now().toISOString(),
        type: event.type,
        data: event.data,
      });
    },
    deliver(envelope) {
      const ok = transport.send(envelope);
      if (!ok) return false;
      const target = byPeer.get(envelope.to);
      if (target) target.inbox.push(envelope);
      return true;
    },
    flush() {
      // In-process lab: delivery is synchronous; hook reserved for async adapters.
    },
  };
}
