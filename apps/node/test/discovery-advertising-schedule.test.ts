/**
 * Tests for the discovery-topic advertising schedule:
 *
 * 1. `DISCOVERY_TOPIC_OP_TIMEOUT_MS` is now 60s (cold-start DHT bootstrap
 *    can take 30-60s when bootstrap.libp2p.io is slow / partially blocked).
 * 2. Periodic retry runs all topics in PARALLEL (not sequential `for`) so
 *    one retry cycle is bounded by the per-topic timeout, not the sum.
 * 3. Periodic retry is ADAPTIVE — failed attempts re-schedule quickly
 *    (DISCOVERY_ADVERTISE_RETRY_BACKOFF_MS = 60s) so a freshly-bootstrapped
 *    DHT is picked up without waiting the full healthy interval
 *    (DISCOVERY_ADVERTISE_RETRY_HEALTHY_MS = 5 min).
 * 4. Calling `_advertisePublicDiscoveryTopics` again cancels the in-flight
 *    retry loop and starts a fresh schedule (no leftover state blocking
 *    the new loop after a hung previous retry).
 *
 * The CLI-path +15s first-advertise delay lives in `apps/node/src/index.ts`
 * and is covered by a direct string-read assertion in this file rather than
 * re-running the full CLI bootstrap, which would require a live libp2p stack.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  DISCOVERY_TOPIC_OP_TIMEOUT_MS,
  DISCOVERY_ADVERTISE_RETRY_BACKOFF_MS,
  DISCOVERY_ADVERTISE_RETRY_HEALTHY_MS,
  _advertisePublicDiscoveryTopics,
} from "../src/node-service-identity.js";
import { NodeServiceImpl } from "../src/node-service-impl.js";
import type {
  LocalTrustStore,
  LocalPeerDirectoryStore,
  HumanProfileStore,
} from "@envoymesh/local-store";

const createMockTrustStore = (): LocalTrustStore => ({
  listTrustRecords: async () => [],
  setTrustRecord: async () => ({}),
  removeTrustRecord: async () => ({}),
  getTrustRecord: async () => undefined,
});

const createMockPeerDirectoryStore = (): LocalPeerDirectoryStore => ({
  listPeerRecords: async () => [],
  getPeerByOwnerId: async () => undefined,
  mergeListenAddrsForPeerId: async () => {},
  ensurePeerFromInboundChat: async () => {},
  upsertPeerFromSignal: async () => ({}),
});

const createMockHumanProfileStore = (): HumanProfileStore => ({
  loadHumanProfile: async () => undefined,
  saveHumanProfile: async () => {},
});

function createMockMesh(provideImpl: (topic: string) => Promise<unknown>) {
  return {
    peerId: "QmMockPeer123456",
    multiaddrs: ["/ip4/127.0.0.1/tcp/4001/p2p/QmMockPeer123456"],
    // Default: simulate at least 2 connected peers so the cycle-level
    // "DHT route table empty" gate doesn't fire in normal tests. Tests
    // that exercise the empty-route-table path can override this.
    getConnectedPeerIds: vi.fn().mockReturnValue([
      "12D3KooWRoutesTablePeerA",
      "12D3KooWRoutesTablePeerB",
    ]),
    // provideCapabilityTopic now returns { cid, signedRecord?, timedOut }
    // so callers can distinguish a landed put from a stalled one. Wrap
    // the inner impl so test fixtures don't need to repeat the boilerplate.
    provideCapabilityTopic: vi.fn(async (topic: string) => {
      const inner = await provideImpl(topic);
      return { timedOut: false, ...(inner as object) };
    }),
    cancelCapabilityTopicReprovide: vi.fn().mockResolvedValue(undefined),
    findCapabilityTopicProviders: vi.fn().mockResolvedValue([]),
    send: vi.fn().mockResolvedValue(1),
    sendExpectReply: vi.fn().mockResolvedValue({ payload: { matches: [] } }),
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    dial: vi.fn().mockResolvedValue(undefined),
    onMessage: vi.fn(),
    onPeerDiscovered: vi.fn(),
  };
}

function setConfigStore(nodeService: any, configStore: any) {
  Object.defineProperty(nodeService, "_configStore", {
    value: configStore,
    writable: true,
    configurable: true,
  });
}

function setExternalMesh(nodeService: any, mesh: any) {
  Object.defineProperty(nodeService, "_externalMesh", {
    value: mesh,
    writable: true,
    configurable: true,
  });
  Object.defineProperty(nodeService, "_mesh", {
    value: undefined,
    writable: true,
    configurable: true,
  });
}

const createNullConfigStore = () => ({
  load: async () => null,
  save: async () => {},
  exists: async () => true,
});

/**
 * Flush microtasks + any timers scheduled for `t ≤ current`. Used after a
 * `vi.advanceTimersByTimeAsync` to drain the async work started by a fired
 * timer callback (the retry's `void (async () => { ... })()` IIFE needs the
 * microtask queue to drain before its assertions can observe the calls).
 */
async function flushAsync(maxIterations = 200): Promise<void> {
  for (let i = 0; i < maxIterations; i++) {
    await Promise.resolve();
  }
}

describe("discovery topic advertising — timeout + adaptive retry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe("per-topic deadline and adaptive intervals", () => {
    it("per-topic deadline is set to 60s (cold DHT bootstrap can take that long)", () => {
      expect(DISCOVERY_TOPIC_OP_TIMEOUT_MS).toBe(60_000);
    });

    it("retry backoff is 60s and healthy interval is 5 minutes", () => {
      expect(DISCOVERY_ADVERTISE_RETRY_BACKOFF_MS).toBe(60_000);
      expect(DISCOVERY_ADVERTISE_RETRY_HEALTHY_MS).toBe(5 * 60_000);
    });
  });

  describe("initial fan-out", () => {
    it("advertises all topics in parallel", async () => {
      // Tracks max concurrency: if the loop ran sequentially, only one
      // provide would be in-flight at a time.
      let inFlight = 0;
      let maxInFlight = 0;
      const mesh = createMockMesh(async () => {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((r) => setTimeout(r, 10));
        inFlight--;
        return { cid: {} as never };
      });

      const nodeService = new NodeServiceImpl(
        mesh as any,
        createMockTrustStore(),
        createMockPeerDirectoryStore(),
        createMockHumanProfileStore(),
        "/tmp/test",
      );
      setConfigStore(nodeService, createNullConfigStore());
      setExternalMesh(nodeService, mesh);

      const advertisePromise = _advertisePublicDiscoveryTopics(
        (nodeService as any)._identityContext(),
        {
          interests: ["music", "tech", "science"],
          username: "alice",
          displayName: "",
          locationTopics: ["geo:country:US"],
          capabilityTopics: ["coding-help"],
        },
      );

      // Drain the 10ms-per-topic timers + initial microtasks only.
      await vi.advanceTimersByTimeAsync(20);
      await flushAsync();
      await advertisePromise;

      // 6 topics (3 interests + username + 1 geo + 1 capability).
      expect(mesh.provideCapabilityTopic).toHaveBeenCalledTimes(6);
      // Max in-flight should be > 1 (parallel). With 6 topics, even a tiny
      // parallelism would beat sequential.
      expect(maxInFlight).toBeGreaterThan(1);
    });
  });

  describe("adaptive retry interval", () => {
    it("schedules a healthy-interval retry after all topics succeed", async () => {
      const mesh = createMockMesh(async () => ({ cid: {} as never }));
      const nodeService = new NodeServiceImpl(
        mesh as any,
        createMockTrustStore(),
        createMockPeerDirectoryStore(),
        createMockHumanProfileStore(),
        "/tmp/test",
      );
      setConfigStore(nodeService, createNullConfigStore());
      setExternalMesh(nodeService, mesh);

      const promise = _advertisePublicDiscoveryTopics(
        (nodeService as any)._identityContext(),
        {
          interests: ["music"],
          username: "alice",
          displayName: "",
          locationTopics: [],
        },
      );

      // Drain initial fan-out (no setTimeout involved — pure microtasks).
      await flushAsync();
      await promise;

      // After all-success, first retry is scheduled at HEALTHY (5 min).
      // Advance just before HEALTHY — no retry should fire.
      mesh.provideCapabilityTopic.mockClear();
      await vi.advanceTimersByTimeAsync(DISCOVERY_ADVERTISE_RETRY_HEALTHY_MS - 1000);
      await flushAsync();
      expect(mesh.provideCapabilityTopic).not.toHaveBeenCalled();

      // Advance the remaining 1s — retry fires.
      await vi.advanceTimersByTimeAsync(2000);
      await flushAsync();
      expect(mesh.provideCapabilityTopic).toHaveBeenCalledWith("music");
    });

    it("schedules a backoff retry after any topic fails", async () => {
      // One topic fails on the first attempt, then succeeds on the retry —
      // simulates DHT coming up late. After the failure, the first retry
      // should fire at BACKOFF (60s), not HEALTHY (5 min).
      //
      // Note: `_advertisePublicDiscoveryTopics` passes raw interest strings
      // (e.g. "music") to provideCapabilityTopic — it does NOT normalize to
      // `interest:music`. The mock matches on those raw strings.
      let scienceCount = 0;
      const mesh = createMockMesh(async (topic: string) => {
        if (topic === "science") {
          scienceCount++;
          if (scienceCount === 1) {
            // First attempt fails — DHT not ready. Retry will succeed.
            throw new Error("simulated DHT timeout");
          }
        }
        return { cid: {} as never };
      });

      const nodeService = new NodeServiceImpl(
        mesh as any,
        createMockTrustStore(),
        createMockPeerDirectoryStore(),
        createMockHumanProfileStore(),
        "/tmp/test",
      );
      setConfigStore(nodeService, createNullConfigStore());
      setExternalMesh(nodeService, mesh);

      const ctx = (nodeService as any)._identityContext();
      const promise = _advertisePublicDiscoveryTopics(ctx, {
        interests: ["music", "science"],
        username: "alice",
        displayName: "",
        locationTopics: [],
      });
      await flushAsync();
      await promise;

      // First call: science threw, so allSuccess=false → firstRetryDelay = BACKOFF (60s).
      expect(scienceCount).toBe(1);

      mesh.provideCapabilityTopic.mockClear();
      scienceCount = 0;

      // Just before BACKOFF — no retry yet.
      await vi.advanceTimersByTimeAsync(DISCOVERY_ADVERTISE_RETRY_BACKOFF_MS - 1000);
      await flushAsync();
      expect(mesh.provideCapabilityTopic).not.toHaveBeenCalled();

      // Past BACKOFF — retry fires, science succeeds this time.
      await vi.advanceTimersByTimeAsync(2000);
      await flushAsync();
      expect(mesh.provideCapabilityTopic).toHaveBeenCalled();
      expect(scienceCount).toBe(1); // retry succeeded (scienceCount was 0 → 1, no throw)
    });
  });

  describe("re-entrancy / new call cancels in-flight retry", () => {
    it("a second call cancels the previous schedule", async () => {
      const mesh = createMockMesh(async () => ({ cid: {} as never }));
      const nodeService = new NodeServiceImpl(
        mesh as any,
        createMockTrustStore(),
        createMockPeerDirectoryStore(),
        createMockHumanProfileStore(),
        "/tmp/test",
      );
      setConfigStore(nodeService, createNullConfigStore());
      setExternalMesh(nodeService, mesh);

      // First call: 1 topic
      const p1 = _advertisePublicDiscoveryTopics(
        (nodeService as any)._identityContext(),
        { interests: ["music"], username: "alice", displayName: "", locationTopics: [] },
      );
      await flushAsync();
      await p1;

      // Second call: 2 topics (different set, superset of first)
      const p2 = _advertisePublicDiscoveryTopics(
        (nodeService as any)._identityContext(),
        { interests: ["music", "books"], username: "alice", displayName: "", locationTopics: [] },
      );
      await flushAsync();
      await p2;

      // Capture the call count from the second-call fan-out.
      mesh.provideCapabilityTopic.mockClear();

      // Advance past healthy window — only the SECOND call's timer should
      // be live, scheduling exactly one retry with the second call's topic
      // set (3 topics), not the first call's (2 topics).
      await vi.advanceTimersByTimeAsync(DISCOVERY_ADVERTISE_RETRY_HEALTHY_MS + 1000);
      await flushAsync();

      const calls = mesh.provideCapabilityTopic.mock.calls.map((c) => c[0]);
      // Second-call topic set: music, books, username:alice → 3 calls.
      expect(calls.length).toBe(3);
      expect(calls).toContain("music");
      expect(calls).toContain("books");
      expect(calls).toContain("username:alice");
    });
  });

  describe("CLI first-advertise delay", () => {
    it("apps/node/src/index.ts uses 15_000ms (15s) for first advertise, not 5_000ms", async () => {
      // Direct read of the source file: avoids the cost of bootstrapping the
      // full CLI runtime (libp2p stack, audit stores, social WS, etc.) just
      // to check one constant.
      const fs = await import("node:fs/promises");
      const path = await import("node:path");
      const indexTsPath = path.resolve(
        import.meta.dirname,
        "../src/index.ts",
      );
      const src = await fs.readFile(indexTsPath, "utf8");

      // Match a `setTimeout(<arrow-with-_advertiseInterestsIfPublic>, <delay>)`
      // pattern by anchoring on the unique `_advertiseInterestsIfPublic`
      // identifier and looking back for the enclosing setTimeout(.
      // Other setTimeouts in the file (provideSelf at +30/+60/+90s) don't
      // contain this identifier, so we won't match them.
      const idx = src.indexOf("_advertiseInterestsIfPublic");
      expect(idx, "_advertiseInterestsIfPublic not found in index.ts").toBeGreaterThanOrEqual(0);

      // Walk back from `idx` to find the nearest `setTimeout(` opening.
      const before = src.slice(0, idx);
      const openParen = before.lastIndexOf("setTimeout(");
      expect(openParen, "no setTimeout before _advertiseInterestsIfPublic").toBeGreaterThanOrEqual(0);

      // Capture the `setTimeout(<args>)` call's delay — the 2nd arg, which
      // is a numeric literal (with optional underscores) optionally followed
      // by a closing `)`. Tolerant of whitespace.
      const callSite = src.slice(openParen);
      const delayMatch = callSite.match(
        /^setTimeout\([\s\S]+?,\s*(\d[\d_]*)\s*\)/,
      );
      expect(
        delayMatch,
        "could not extract setTimeout delay at first-advertise call site",
      ).not.toBeNull();

      const delayMs = Number(delayMatch![1].replace(/_/g, ""));
      expect(delayMs).toBe(15_000);

      // Sanity: the periodic setInterval still uses 5 * 60 * 1000 (unchanged).
      expect(src).toMatch(/setInterval\([\s\S]*?5\s*\*\s*60\s*\*\s*1000/);
    });
  });

  describe("DHT-route-table-empty gate (2026-07-10)", () => {
    it("skips per-topic provides when fewer than 2 peers are connected, emits a single summary per cycle", async () => {
      // User symptom: 16 topics × 30 s timeout per cycle, every 60 s, forever.
      // Root cause: only the relay is connected — the community relay doesn't
      // serve modern DHT routing — so every `contentRouting.provide()` call
      // hangs without ever resolving. The gate at `_advertisePublicDiscoveryTopics`
      // checks `mesh.getConnectedPeerIds()` and skips the fan-out entirely if
      // fewer than 2 peers are connected, emitting one WARN instead.

      const mesh = createMockMesh(async () => ({ cid: {} as never }));
      // Override the default 2-peer mock to simulate the symptom.
      (mesh.getConnectedPeerIds as ReturnType<typeof vi.fn>).mockReturnValue([
        // One peer — almost certainly the configured community relay.
        "12D3KooWCommunityRelay",
      ]);

      const nodeService = new NodeServiceImpl(
        mesh as any,
        createMockTrustStore(),
        createMockPeerDirectoryStore(),
        createMockHumanProfileStore(),
        "/tmp/test",
      );
      setConfigStore(nodeService, createNullConfigStore());
      setExternalMesh(nodeService, mesh);

      // Spy on console.warn so we can assert the gate's summary line is
      // emitted exactly ONCE per cycle (not 16 times — that was the bug).
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const advertisePromise = _advertisePublicDiscoveryTopics(
        (nodeService as any)._identityContext(),
        {
          interests: ["music", "tech", "science"],
          username: "alice",
          displayName: "",
          locationTopics: ["geo:country:CN"],
          capabilityTopics: ["coding-help", "lang:en"],
        },
      );
      await flushAsync();
      await advertisePromise;

      // Critical assertion: provideCapabilityTopic must NOT have been called
      // for any of the 7 topics — the gate skipped the fan-out entirely.
      expect(mesh.provideCapabilityTopic).not.toHaveBeenCalled();

      // Exactly one WARN line per cycle summarizing the gate's reasoning.
      // Filter to the gate's specific message; the schedule also emits other
      // non-cycle warns we don't want to count.
      const gateWarnings = warnSpy.mock.calls.filter((args) => {
        const msg = args[0];
        return (
          typeof msg === "string" &&
          msg.includes("Discovery advertise cycle") &&
          msg.includes("skipping")
        );
      });
      expect(gateWarnings).toHaveLength(1);

      const message = gateWarnings[0]![0] as string;
      // Must mention the connected-peer count (so operators see the actual
      // diagnostic at-a-glance), and the topics it would have published
      // (so they can confirm they're not silently dropped forever).
      expect(message).toMatch(/only 1 peer\(s\) connected/);
      expect(message).toMatch(/skipping \d+ topic publishes this cycle/);

      warnSpy.mockRestore();
    });
  });
});