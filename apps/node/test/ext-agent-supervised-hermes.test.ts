/**
 * Phase 55E — HermesSupervisedBackend tests.
 *
 * Strategy: mock the inner HTTP backend (`createHermesBackend()`)
 * AND the supervisor (the `supervisor` option in the constructor).
 * This exercises the integration between the two without needing
 * a real Hermes install or actually spawning processes.
 *
 * The supervisor mock is a tiny `EventEmitter` that records
 * `start()` / `stop()` calls and can be primed to succeed or
 * throw `InstallMissingError` (or any other error) on `start()`.
 * The inner mock records `ask()` calls and returns a canned
 * reply.
 */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { EventEmitter } from "node:events";
import {
  HermesSupervisedBackend,
  createHermesSupervisedBackend,
  _test,
} from "../src/ext-agent-adapter/supervised-hermes-backend.js";
import {
  InstallMissingError,
} from "../src/ext-agent-adapter/daemon-supervisor.js";
import type { ExtAgentBackend } from "../src/ext-agent-adapter/types.js";
import type { DaemonSupervisor } from "../src/ext-agent-adapter/daemon-supervisor.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

class FakeSupervisor extends EventEmitter {
  start = vi.fn();
  stop = vi.fn();
  isHealthy = vi.fn().mockReturnValue(true);
  isEverHealthy = false;
  /** If non-null, `start()` resolves with this value; if `Error`,
   *  it rejects. */
  nextStartResult: { ok: true } | { err: Error } = { ok: true };
  installMissing = false;
  constructor() {
    super();
    this.start.mockImplementation(async () => {
      if (this.nextStartResult.ok) {
        this.isEverHealthy = true;
        this.emit("healthy");
        return;
      }
      throw this.nextStartResult.err;
    });
    this.stop.mockResolvedValue(undefined);
  }
}

function makeInner(
  askImpl: (text: string, sessionKey: string) => Promise<string> = async () => "from-inner",
  probeResult: boolean = false,
): ExtAgentBackend {
  return {
    kind: "hermes",
    label: "Hermes (inner)",
    ask: vi.fn(askImpl),
    // Default false so ask()/start() exercise the spawn path unless a
    // test opts into probe-first reuse.
    probe: vi.fn().mockResolvedValue(probeResult),
  };
}

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("HermesSupervisedBackend (Phase 55E)", () => {
  it("kind=hermes and label includes 'Hermes'", () => {
    const inner = makeInner();
    const sup = new FakeSupervisor();
    // Cast: FakeSupervisor is structurally compatible with DaemonSupervisor
    // for the methods we use (start/stop/isHealthy + EventEmitter).
    const backend = new HermesSupervisedBackend({
      inner,
      supervisor: sup as unknown as DaemonSupervisor,
    });
    expect(backend.kind).toBe("hermes");
    expect(backend.label).toContain("Hermes");
  });

  it("createHermesSupervisedBackend factory returns an ExtAgentBackend with kind=hermes", () => {
    const backend = createHermesSupervisedBackend({
      inner: makeInner(),
      supervisor: new FakeSupervisor() as unknown as DaemonSupervisor,
    });
    expect(backend.kind).toBe("hermes");
  });

  it("ask() calls supervisor.start() when probe is down, then delegates to inner.ask()", async () => {
    const innerAsk = vi.fn(async (text: string) => `reply:${text}`);
    const inner = makeInner(innerAsk, false);
    const sup = new FakeSupervisor();
    const backend = new HermesSupervisedBackend({
      inner,
      supervisor: sup as unknown as DaemonSupervisor,
    });

    const reply = await backend.ask("hello", "sess-1");
    expect(reply).toBe("reply:hello");
    expect(sup.start).toHaveBeenCalledTimes(1);
    expect(innerAsk).toHaveBeenCalledWith("hello", "sess-1");
  });

  it("ask() skips supervisor.start() when inner.probe() is already healthy (probe-first)", async () => {
    const innerAsk = vi.fn(async (text: string) => `reply:${text}`);
    const inner = makeInner(innerAsk, true);
    const sup = new FakeSupervisor();
    const backend = new HermesSupervisedBackend({
      inner,
      supervisor: sup as unknown as DaemonSupervisor,
    });

    const reply = await backend.ask("hello", "sess-1");
    expect(reply).toBe("reply:hello");
    expect(sup.start).toHaveBeenCalledTimes(0);
    expect(backend.isEverHealthy()).toBe(true);
    expect(innerAsk).toHaveBeenCalledWith("hello", "sess-1");
  });

  it("ask() does NOT re-call supervisor.start() when already healthy", async () => {
    const innerAsk = vi.fn(async (text: string) => `reply:${text}`);
    const inner = makeInner(innerAsk, false);
    const sup = new FakeSupervisor();
    const backend = new HermesSupervisedBackend({
      inner,
      supervisor: sup as unknown as DaemonSupervisor,
    });
    // Simulate the supervisor reaching a healthy state before any
    // ask() — the backend's `healthy` event listener flips
    // `wasEverHealthy`, which makes subsequent ask() calls skip
    // start() entirely.
    sup.emit("healthy");
    expect(backend.isEverHealthy()).toBe(true);
    await backend.ask("first", "sess-1");
    await backend.ask("second", "sess-1");
    expect(sup.start).toHaveBeenCalledTimes(0); // short-circuited
    expect(innerAsk).toHaveBeenCalledTimes(2);
  });

  it("ask() propagates the supervisor's start error and caches it", async () => {
    const inner = makeInner();
    const sup = new FakeSupervisor();
    sup.nextStartResult = { err: new InstallMissingError({
      command: "hermes",
      reason: "spawn-enoent",
    }) };
    const backend = new HermesSupervisedBackend({
      inner,
      supervisor: sup as unknown as DaemonSupervisor,
    });

    await expect(backend.ask("hello", "sess-1")).rejects.toBeInstanceOf(
      InstallMissingError,
    );
    // Subsequent ask() re-uses the cached error without retrying spawn.
    await expect(backend.ask("hello", "sess-1")).rejects.toBeInstanceOf(
      InstallMissingError,
    );
    expect(sup.start).toHaveBeenCalledTimes(1);
    expect(backend.didLastStartFail()).toBe(true);
    expect(backend.lastStartErrorMessage()).toContain("hermes");
  });

  it("ask() clears the cached error when the supervisor recovers", async () => {
    const inner = makeInner();
    const sup = new FakeSupervisor();
    sup.nextStartResult = { err: new InstallMissingError({
      command: "hermes",
      reason: "spawn-enoent",
    }) };
    const backend = new HermesSupervisedBackend({
      inner,
      supervisor: sup as unknown as DaemonSupervisor,
    });

    await expect(backend.ask("first", "sess-1")).rejects.toBeInstanceOf(
      InstallMissingError,
    );
    // Repair the supervisor — set the supervisor's isEverHealthy to true
    // and reset the next start to succeed.
    sup.nextStartResult = { ok: true };
    sup.isEverHealthy = true;

    // Manually emit a healthy event so the backend clears its cache.
    sup.emit("healthy");
    expect(backend.didLastStartFail()).toBe(false);
  });

  it("probe() delegates to the inner backend's probe()", async () => {
    const probe = vi.fn().mockResolvedValue(true);
    const inner: ExtAgentBackend = { kind: "hermes", label: "x", ask: vi.fn(), probe };
    const sup = new FakeSupervisor();
    const backend = new HermesSupervisedBackend({
      inner,
      supervisor: sup as unknown as DaemonSupervisor,
    });
    expect(await backend.probe()).toBe(true);
    expect(probe).toHaveBeenCalledTimes(1);
  });

  it("probe() returns false when the inner probe returns false", async () => {
    const probe = vi.fn().mockResolvedValue(false);
    const inner: ExtAgentBackend = { kind: "hermes", label: "x", ask: vi.fn(), probe };
    const sup = new FakeSupervisor();
    const backend = new HermesSupervisedBackend({
      inner,
      supervisor: sup as unknown as DaemonSupervisor,
    });
    expect(await backend.probe()).toBe(false);
  });

  it("start() skips spawn when probe is healthy; otherwise spawns once", async () => {
    const healthyInner = makeInner(undefined, true);
    const healthySup = new FakeSupervisor();
    const healthyBackend = new HermesSupervisedBackend({
      inner: healthyInner,
      supervisor: healthySup as unknown as DaemonSupervisor,
    });
    await healthyBackend.start();
    await healthyBackend.start();
    expect(healthySup.start).toHaveBeenCalledTimes(0);

    const downInner = makeInner(undefined, false);
    const downSup = new FakeSupervisor();
    const downBackend = new HermesSupervisedBackend({
      inner: downInner,
      supervisor: downSup as unknown as DaemonSupervisor,
    });
    await downBackend.start();
    await downBackend.start();
    expect(downSup.start).toHaveBeenCalledTimes(1);
  });

  it("stop() calls supervisor.stop() and is idempotent", async () => {
    const inner = makeInner();
    const sup = new FakeSupervisor();
    const backend = new HermesSupervisedBackend({
      inner,
      supervisor: sup as unknown as DaemonSupervisor,
    });
    await backend.stop();
    await backend.stop();
    expect(sup.stop).toHaveBeenCalledTimes(2);
  });

  it("isEverHealthy() is true after the supervisor emits 'healthy'", () => {
    const inner = makeInner();
    const sup = new FakeSupervisor();
    const backend = new HermesSupervisedBackend({
      inner,
      supervisor: sup as unknown as DaemonSupervisor,
    });
    expect(backend.isEverHealthy()).toBe(false);
    sup.emit("healthy");
    expect(backend.isEverHealthy()).toBe(true);
  });
});

describe("HermesSupervisedBackend (Phase 55E) — healthcheck probe", () => {
  it("_test.healthcheckHermes returns true on 2xx", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 200 }));
    const ok = await _test.healthcheckHermes(new AbortController().signal);
    expect(ok).toBe(true);
    fetchSpy.mockRestore();
  });

  it("_test.healthcheckHermes returns false on 5xx", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 503 }));
    const ok = await _test.healthcheckHermes(new AbortController().signal);
    expect(ok).toBe(false);
    fetchSpy.mockRestore();
  });

  it("_test.healthcheckHermes returns false on fetch rejection", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("ECONNREFUSED"));
    const ok = await _test.healthcheckHermes(new AbortController().signal);
    expect(ok).toBe(false);
    fetchSpy.mockRestore();
  });
});
