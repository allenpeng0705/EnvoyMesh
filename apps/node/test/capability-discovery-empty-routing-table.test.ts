/**
 * Phase 2 (B1) — capability discovery early-exit on empty DHT routing table.
 *
 * Guards the optimization in `runCapabilityDiscoveryCycle` that skips the
 * per-topic DHT provide loop when the KadDHT routing table is empty. Without
 * it, every `provideCapabilityTopic` times out independently (~30s × N topics)
 * for the same root cause — pure waste on a node whose routing table never
 * fills (e.g. CGNAT). The relay.checkin mirror carries the topics cross-NAT
 * regardless, so skipping the DHT provide loses nothing.
 *
 * See docs/connectivity-internals-and-design.md Solution B1.
 */
import { describe, expect, it, vi } from "vitest";
import { runCapabilityDiscoveryCycle } from "../src/capability-discovery.js";

function makeMockMesh(opts: { routingTableSize: number; provideResult: () => Promise<unknown> }) {
  return {
    getRoutingTableSize: () => opts.routingTableSize,
    provideCapabilityTopic: vi.fn(opts.provideResult),
    findCapabilityTopicProviders: vi.fn(async () => []),
  } as never;
}

function makeStores() {
  const auditEvents: unknown[] = [];
  return {
    taskStore: {
      appendAuditEvent: vi.fn(async (e: unknown) => {
        auditEvents.push(e);
      }),
    } as never,
    discoverySeedStore: { upsertMany: vi.fn(async () => undefined) } as never,
    auditEvents,
  };
}

describe("runCapabilityDiscoveryCycle — empty routing table early-exit (B1)", () => {
  it("skips the DHT provide loop when routing table is empty (0 peers)", async () => {
    const mesh = makeMockMesh({
      routingTableSize: 0,
      provideResult: async () => ({ timedOut: true }),
    });
    const { taskStore, discoverySeedStore, auditEvents } = makeStores();

    await runCapabilityDiscoveryCycle({
      mesh,
      profile: "wan-default",
      topics: ["interest:music", "coding-help", "interest:tech"],
      taskStore,
      discoverySeedStore,
      enableDht: true,
      options: { source: "periodic", runFind: false },
    });

    // The provide loop must NOT have run — no provideCapabilityTopic calls.
    expect((mesh.provideCapabilityTopic as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
    // An audit event records the skip so operators can see it wasn't a silent no-op.
    expect(auditEvents.length).toBe(1);
    const evt = auditEvents[0] as { summary: string; protocol: string };
    expect(evt.protocol).toBe("discovery.capability.provide.skipped-empty-routing-table");
    expect(evt.summary).toContain("3 topic(s)");
  });

  it("runs the DHT provide loop when routing table has peers", async () => {
    const mesh = makeMockMesh({
      routingTableSize: 12,
      provideResult: async () => ({ timedOut: false }),
    });
    const { taskStore, discoverySeedStore } = makeStores();

    await runCapabilityDiscoveryCycle({
      mesh,
      profile: "wan-default",
      topics: ["interest:music", "coding-help"],
      taskStore,
      discoverySeedStore,
      enableDht: true,
      options: { source: "periodic", runFind: false },
    });

    // Provide ran for each topic.
    expect((mesh.provideCapabilityTopic as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2);
  });

  it("runs the provide loop when routing table size is unknown (-1)", async () => {
    // -1 = DHT enabled but introspection failed. Don't skip — let the provide
    // attempt and its own timeout handle it. Skipping only on a definitive 0.
    const mesh = makeMockMesh({
      routingTableSize: -1,
      provideResult: async () => ({ timedOut: false }),
    });
    const { taskStore, discoverySeedStore } = makeStores();

    await runCapabilityDiscoveryCycle({
      mesh,
      profile: "wan-default",
      topics: ["interest:music"],
      taskStore,
      discoverySeedStore,
      enableDht: true,
      options: { source: "periodic", runFind: false },
    });

    expect((mesh.provideCapabilityTopic as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
  });

  it("still early-exits when DHT is disabled (existing guard, unchanged)", async () => {
    const mesh = makeMockMesh({
      routingTableSize: 0,
      provideResult: async () => ({ timedOut: false }),
    });
    const { taskStore, discoverySeedStore, auditEvents } = makeStores();

    await runCapabilityDiscoveryCycle({
      mesh,
      profile: "wan-default",
      topics: ["interest:music"],
      taskStore,
      discoverySeedStore,
      enableDht: false, // quietWan / aggressive
      options: { source: "periodic", runFind: false },
    });

    expect((mesh.provideCapabilityTopic as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
    // No skip audit either — the enableDht guard returns before the routing-table check.
    expect(auditEvents.length).toBe(0);
  });
});
