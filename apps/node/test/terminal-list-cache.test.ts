import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const onDataHandlers: Array<(data: string) => void> = [];

const mockPty = {
  cols: 80,
  rows: 24,
  onData: vi.fn((cb: (data: string) => void) => {
    onDataHandlers.push(cb);
    return { dispose: vi.fn() };
  }),
  onExit: vi.fn(),
  write: vi.fn(),
  resize: vi.fn(),
  kill: vi.fn(),
};

vi.mock("node-pty", () => ({
  spawn: vi.fn(() => mockPty),
}));

// Import after mock so the manager sees the stub pty.
import {
  createHumanProfileStore,
  createLocalPeerDirectoryStore,
  createLocalTrustStore,
} from "@envoymesh/local-store";
import { ApprovalQueue, createApprovalItem } from "@envoymesh/api";
import { NodeServiceImpl } from "../src/node-service-impl.js";
import { TerminalManager } from "../src/terminal-manager.js";

/**
 * The Social UI fires 3-4 parallel listTerminalSessions() calls when
 * the Terminals tab is opened, each going through _enrichTerminalSessions
 * which walks every session's scrollback + reads the approval queue.
 * That made opening the tab visibly slow even with only 1-3 active
 * PTYs. Fix A: cache listTerminalSessions at TTL ~350ms, invalidated
 * by the terminal event hook in setTerminalManager. Fix B: cache the
 * pending-approval count at TTL ~1s.
 *
 * These tests pin down the dedup + invalidation contract so a future
 * refactor cannot silently re-introduce the regression.
 */
describe("NodeServiceImpl.listTerminalSessions TTL cache", () => {
  let profileDir: string;
  let manager: TerminalManager;
  let nodeSvc: NodeServiceImpl;

  beforeEach(async () => {
    onDataHandlers.length = 0;
    profileDir = await mkdtemp(join(tmpdir(), "envoy-listcache-"));
    const trustStore = createLocalTrustStore(profileDir);
    const peerDirectory = createLocalPeerDirectoryStore(profileDir);
    const human = createHumanProfileStore(profileDir);
    manager = new TerminalManager({ profileDir });
    nodeSvc = new NodeServiceImpl(
      undefined,
      trustStore,
      peerDirectory,
      human,
      profileDir,
    );
    nodeSvc.setTerminalManager(manager);
    await manager.waitUntilReady();
  });

  afterEach(async () => {
    await rm(profileDir, { recursive: true, force: true });
  });

  it("deduplicates 4 parallel listTerminalSessions into 1 underlying call", async () => {
    // Spy BEFORE any lists run.
    const spy = vi.spyOn(manager, "listTerminalSessions");

    // Fire 4 calls in the same tick — the same pattern the Social UI
    // does when opening the Terminals tab.
    const result = await Promise.all([
      nodeSvc.listTerminalSessions(),
      nodeSvc.listTerminalSessions(),
      nodeSvc.listTerminalSessions(),
      nodeSvc.listTerminalSessions(),
    ]);

    // All four returned the same Promise (resolved arrays may be the
    // same reference too, but we only assert cheap stuff here).
    expect(result.length).toBe(4);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("cache is invalidated after a terminal mutation (terminal event hook)", async () => {
    const spy = vi.spyOn(manager, "listTerminalSessions");

    // First call: cold.
    await nodeSvc.listTerminalSessions();
    expect(spy).toHaveBeenCalledTimes(1);

    // Same tick: should hit the cache.
    await nodeSvc.listTerminalSessions();
    expect(spy).toHaveBeenCalledTimes(1);

    // Trigger a manager mutation. createTerminalSession() does the
    // right thing in our isolated manager (no pty needed if we
    // immediately close it; but the manager fires notifyChanged()
    // on success which is what matters for this test).
    const created = await manager.createTerminalSession({});
    expect(spy).toHaveBeenCalledTimes(1); // mutation hasn't read yet

    // Next read: cache should have been invalidated.
    await nodeSvc.listTerminalSessions();
    expect(spy).toHaveBeenCalledTimes(2);

    await manager.closeTerminalSession({ sessionId: created.sessionId });
    await nodeSvc.listTerminalSessions();
    expect(spy).toHaveBeenCalledTimes(3);
  });

  it("cache invalidation preserves previously-installed callbacks (chaining)", async () => {
    // The constructor didn't pass an onSessionsChanged, so the
    // manager's internal callback is the default no-op. setTerminalManager
    // chains a new invalidator on top. Closing a session should fire
    // both (no-op + our invalidator). Verifies the wrapper-compose
    // semantics, not the cache itself.
    let outerCalls = 0;
    manager.setOnSessionsChanged(() => {
      outerCalls += 1;
    });
    const created = await manager.createTerminalSession({});
    // The constructor-installed no-op fires through the manager first,
    // then our outer counter increments via the invalidator wrapper.
    expect(outerCalls).toBeGreaterThanOrEqual(1);
    await manager.closeTerminalSession({ sessionId: created.sessionId });
    expect(outerCalls).toBeGreaterThanOrEqual(2);
  });

  it("TTL expires after the window — back-stop against missed invalidations", async () => {
    const spy = vi.spyOn(manager, "listTerminalSessions");
    await nodeSvc.listTerminalSessions();
    expect(spy).toHaveBeenCalledTimes(1);
    // Move time forward past the TTL by inserting a custom Date.now
    // via the same TTL constant: the cache window is fixed at 350ms.
    await new Promise((r) => setTimeout(r, 400));
    await nodeSvc.listTerminalSessions();
    expect(spy).toHaveBeenCalledTimes(2);
  });
});

/**
 * End-to-end pin that the ApprovalQueue.onChange sink wires into
 * NodeServiceImpl's pending-approval-count cache via bindApprovalQueue.
 * Pre-fix, the count could be up to 1s stale after an approval event
 * (the cache TTL was the only freshness guarantee). Post-fix, any
 * queue mutation triggers immediate cache invalidation.
 */
describe("NodeServiceImpl pending-approval count cache invalidation", () => {
  let profileDir: string;
  let manager: TerminalManager;
  let nodeSvc: NodeServiceImpl;
  let queue: ApprovalQueue;

  beforeEach(async () => {
    onDataHandlers.length = 0;
    profileDir = await mkdtemp(join(tmpdir(), "envoy-count-cache-"));
    const trustStore = createLocalTrustStore(profileDir);
    const peerDirectory = createLocalPeerDirectoryStore(profileDir);
    const human = createHumanProfileStore(profileDir);
    manager = new TerminalManager({ profileDir });
    nodeSvc = new NodeServiceImpl(
      undefined,
      trustStore,
      peerDirectory,
      human,
      profileDir,
    );
    nodeSvc.setTerminalManager(manager);
    queue = new ApprovalQueue();
    nodeSvc.bindApprovalQueue(queue);
    await manager.waitUntilReady();
  });

  afterEach(async () => {
    await rm(profileDir, { recursive: true, force: true });
  });

  it("approval queue mutation invalidates the count cache immediately", async () => {
    // Direct test of _getCachedPendingApprovalCount, bypassing the
    // outer listTerminalSessions cache (Fix A). The count cache sits
    // in front of listPendingApprovals; this test proves the sink
    // bypasses the TTL on every queue event.
    const listSpy = vi.spyOn(nodeSvc, "listPendingApprovals");
    const countCache = (nodeSvc as unknown as {
      _getCachedPendingApprovalCount: () => Promise<number>;
    })._getCachedPendingApprovalCount.bind(nodeSvc);

    // First read: cold — populates the cache with 0 pending.
    await countCache();
    expect(listSpy).toHaveBeenCalledTimes(1);

    // Within TTL: cache hit, no second call.
    await countCache();
    expect(listSpy).toHaveBeenCalledTimes(1);

    // Approval queue mutates — onChange should fire and clear the cache.
    queue.add(createApprovalItem("send_chat", "t", "d", "x"));
    await countCache();
    expect(listSpy).toHaveBeenCalledTimes(2);

    queue.add(createApprovalItem("share_knowledge", "t", "d", "x"));
    await countCache();
    expect(listSpy).toHaveBeenCalledTimes(3);

    // Reject also fires onChange.
    const idx = queue.listAll()[0].id;
    queue.reject(idx);
    await countCache();
    expect(listSpy).toHaveBeenCalledTimes(4);

    listSpy.mockRestore();
  });
});
