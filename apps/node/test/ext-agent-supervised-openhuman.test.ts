/**
 * Phase 55E — OpenHumanSupervisedBackend tests.
 *
 * Same strategy as the HermesSupervisedBackend test: mock the inner
 * HTTP backend and the supervisor. The structural integration is
 * identical; only the binary name, default args, and healthcheck
 * endpoint differ.
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
  OpenHumanSupervisedBackend,
  createOpenHumanSupervisedBackend,
  _openHumanTest,
} from "@envoymesh/harness";
import {
  InstallMissingError,
} from "@envoymesh/harness";
import type { ExtAgentBackend } from "@envoymesh/harness";
import type { DaemonSupervisor } from "@envoymesh/harness";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

class FakeSupervisor extends EventEmitter {
  start = vi.fn();
  stop = vi.fn();
  isHealthy = vi.fn().mockReturnValue(true);
  isEverHealthy = false;
  nextStartResult: { ok: true } | { err: Error } = { ok: true };
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
    kind: "openhuman",
    label: "OpenHuman (inner)",
    ask: vi.fn(askImpl),
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

describe("OpenHumanSupervisedBackend (Phase 55E)", () => {
  it("kind=openhuman and label includes 'OpenHuman'", () => {
    const inner = makeInner();
    const sup = new FakeSupervisor();
    const backend = new OpenHumanSupervisedBackend({
      inner,
      supervisor: sup as unknown as DaemonSupervisor,
    });
    expect(backend.kind).toBe("openhuman");
    expect(backend.label).toContain("OpenHuman");
  });

  it("createOpenHumanSupervisedBackend factory returns an ExtAgentBackend with kind=openhuman", () => {
    const backend = createOpenHumanSupervisedBackend({
      inner: makeInner(),
      supervisor: new FakeSupervisor() as unknown as DaemonSupervisor,
    });
    expect(backend.kind).toBe("openhuman");
  });

  it("ask() calls supervisor.start() when probe is down, then delegates to inner.ask()", async () => {
    const innerAsk = vi.fn(async (text: string) => `openhuman-reply:${text}`);
    const inner = makeInner(innerAsk, false);
    const sup = new FakeSupervisor();
    const backend = new OpenHumanSupervisedBackend({
      inner,
      supervisor: sup as unknown as DaemonSupervisor,
    });

    const reply = await backend.ask("hi", "sess-1");
    expect(reply).toBe("openhuman-reply:hi");
    expect(sup.start).toHaveBeenCalledTimes(1);
    // `opts` is the interface's third parameter and this wrapper forwards it,
    // so the inner call carries an explicit `undefined` when the caller passes none.
    expect(innerAsk).toHaveBeenCalledWith("hi", "sess-1", undefined);
  });

  it("ask() skips supervisor.start() when inner.probe() is already healthy (probe-first)", async () => {
    const innerAsk = vi.fn(async (text: string) => `openhuman-reply:${text}`);
    const inner = makeInner(innerAsk, true);
    const sup = new FakeSupervisor();
    const backend = new OpenHumanSupervisedBackend({
      inner,
      supervisor: sup as unknown as DaemonSupervisor,
    });

    const reply = await backend.ask("hi", "sess-1");
    expect(reply).toBe("openhuman-reply:hi");
    expect(sup.start).toHaveBeenCalledTimes(0);
    expect(backend.isEverHealthy()).toBe(true);
    // `opts` is the interface's third parameter and this wrapper forwards it,
    // so the inner call carries an explicit `undefined` when the caller passes none.
    expect(innerAsk).toHaveBeenCalledWith("hi", "sess-1", undefined);
  });

  it("ask() clears a cached spawn error when the HTTP core becomes healthy", async () => {
    const innerAsk = vi.fn(async () => "ok");
    const inner = makeInner(innerAsk, false);
    const sup = new FakeSupervisor();
    sup.nextStartResult = {
      err: new InstallMissingError({
        command: "openhuman-core",
        reason: "spawn-enoent",
      }),
    };
    const backend = new OpenHumanSupervisedBackend({
      inner,
      supervisor: sup as unknown as DaemonSupervisor,
    });
    await expect(backend.ask("hi", "sess-1")).rejects.toBeInstanceOf(InstallMissingError);
    // OpenHuman.app comes up — probe flips to healthy.
    ;(inner.probe as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    const reply = await backend.ask("hi-again", "sess-1");
    expect(reply).toBe("ok");
    expect(backend.didLastStartFail()).toBe(false);
  });

  // Same property as the Hermes suite: `ask(text, sessionKey, opts?)` must
  // forward `opts` through the supervisor wrapper on both paths. The assertions
  // above expected a two-argument call, which had been failing since the third
  // parameter was added, and they passed no `opts` at all.
  it("forwards ask() opts to the inner backend", async () => {
    const seen: Array<[string, string, unknown]> = [];
    const innerAsk = vi.fn(async (text: string, sessionKey: string, opts?: unknown) => {
      seen.push([text, sessionKey, opts]);
      return `openhuman-reply:${text}`;
    });
    const sup = new FakeSupervisor();
    const backend = new OpenHumanSupervisedBackend({
      inner: makeInner(innerAsk, true),
      supervisor: sup as unknown as DaemonSupervisor,
    });

    const opts = { cwd: "/tmp/project", model: "sonnet" };
    await backend.ask("hi", "sess-1", opts);
    expect(seen).toEqual([["hi", "sess-1", opts]]);

    const bare = new OpenHumanSupervisedBackend({ inner: makeInner(innerAsk, true) });
    await bare.ask("again", "sess-2", opts);
    expect(seen[1]).toEqual(["again", "sess-2", opts]);
  });

  it("ask() does NOT re-call supervisor.start() when already healthy", async () => {
    const innerAsk = vi.fn(async (text: string) => `openhuman-reply:${text}`);
    const inner = makeInner(innerAsk, false);
    const sup = new FakeSupervisor();
    const backend = new OpenHumanSupervisedBackend({
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
    expect(sup.start).toHaveBeenCalledTimes(0);
    expect(innerAsk).toHaveBeenCalledTimes(2);
  });

  it("ask() propagates the supervisor's start error and caches it", async () => {
    const inner = makeInner();
    const sup = new FakeSupervisor();
    sup.nextStartResult = { err: new InstallMissingError({
      command: "openhuman-core",
      reason: "spawn-enoent",
    }) };
    const backend = new OpenHumanSupervisedBackend({
      inner,
      supervisor: sup as unknown as DaemonSupervisor,
    });

    await expect(backend.ask("hi", "sess-1")).rejects.toBeInstanceOf(
      InstallMissingError,
    );
    await expect(backend.ask("hi", "sess-1")).rejects.toBeInstanceOf(
      InstallMissingError,
    );
    expect(sup.start).toHaveBeenCalledTimes(1);
    expect(backend.didLastStartFail()).toBe(true);
    expect(backend.lastStartErrorMessage()).toContain("openhuman");
  });

  it("ask() clears the cached error when the supervisor recovers", async () => {
    const inner = makeInner();
    const sup = new FakeSupervisor();
    sup.nextStartResult = { err: new InstallMissingError({
      command: "openhuman-core",
      reason: "spawn-enoent",
    }) };
    const backend = new OpenHumanSupervisedBackend({
      inner,
      supervisor: sup as unknown as DaemonSupervisor,
    });
    await expect(backend.ask("first", "sess-1")).rejects.toBeInstanceOf(
      InstallMissingError,
    );
    expect(backend.didLastStartFail()).toBe(true);
    sup.nextStartResult = { ok: true };
    sup.emit("healthy");
    expect(backend.didLastStartFail()).toBe(false);
  });

  it("probe() warms via start() then delegates to the inner probe()", async () => {
    const probe = vi.fn().mockResolvedValue(true);
    const inner: ExtAgentBackend = { kind: "openhuman", label: "x", ask: vi.fn(), probe };
    const sup = new FakeSupervisor();
    const backend = new OpenHumanSupervisedBackend({
      inner,
      supervisor: sup as unknown as DaemonSupervisor,
    });
    expect(await backend.probe()).toBe(true);
    expect(probe.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(sup.start).toHaveBeenCalledTimes(0);
  });

  it("probe() spawns when the core is down (Codex-style soft warm)", async () => {
    let calls = 0;
    const probe = vi.fn(async () => {
      calls += 1;
      return calls >= 3;
    });
    const inner: ExtAgentBackend = { kind: "openhuman", label: "x", ask: vi.fn(), probe };
    const sup = new FakeSupervisor();
    const backend = new OpenHumanSupervisedBackend({
      inner,
      supervisor: sup as unknown as DaemonSupervisor,
    });
    expect(await backend.probe()).toBe(true);
    expect(sup.start).toHaveBeenCalledTimes(1);
  });

  it("probe() returns false when the inner probe returns false after warm", async () => {
    const probe = vi.fn().mockResolvedValue(false);
    const inner: ExtAgentBackend = { kind: "openhuman", label: "x", ask: vi.fn(), probe };
    const sup = new FakeSupervisor();
    const backend = new OpenHumanSupervisedBackend({
      inner,
      supervisor: sup as unknown as DaemonSupervisor,
    });
    expect(await backend.probe()).toBe(false);
    expect(sup.start).toHaveBeenCalledTimes(1);
  });

  it("start() skips spawn when probe is healthy; otherwise spawns once", async () => {
    const healthyInner = makeInner(undefined, true);
    const healthySup = new FakeSupervisor();
    const healthyBackend = new OpenHumanSupervisedBackend({
      inner: healthyInner,
      supervisor: healthySup as unknown as DaemonSupervisor,
    });
    await healthyBackend.start();
    await healthyBackend.start();
    expect(healthySup.start).toHaveBeenCalledTimes(0);

    const downInner = makeInner(undefined, false);
    const downSup = new FakeSupervisor();
    const downBackend = new OpenHumanSupervisedBackend({
      inner: downInner,
      supervisor: downSup as unknown as DaemonSupervisor,
    });
    await downBackend.start();
    await downBackend.start();
    await downBackend.stop();
    await downBackend.stop();
    expect(downSup.start).toHaveBeenCalledTimes(1);
    expect(downSup.stop).toHaveBeenCalledTimes(2);
  });

  it("isEverHealthy() is true after the supervisor emits 'healthy'", () => {
    const inner = makeInner();
    const sup = new FakeSupervisor();
    const backend = new OpenHumanSupervisedBackend({
      inner,
      supervisor: sup as unknown as DaemonSupervisor,
    });
    expect(backend.isEverHealthy()).toBe(false);
    sup.emit("healthy");
    expect(backend.isEverHealthy()).toBe(true);
  });
});

describe("OpenHumanSupervisedBackend (Phase 55E) — healthcheck probe", () => {
  it("_test.healthcheckOpenHuman returns true on 2xx", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 200 }));
    const ok = await _openHumanTest.healthcheckOpenHuman(new AbortController().signal);
    expect(ok).toBe(true);
    fetchSpy.mockRestore();
  });

  it("_test.healthcheckOpenHuman returns false on 5xx", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 500 }));
    const ok = await _openHumanTest.healthcheckOpenHuman(new AbortController().signal);
    expect(ok).toBe(false);
    fetchSpy.mockRestore();
  });

  it("_test.healthcheckOpenHuman returns false on fetch rejection", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("ECONNREFUSED"));
    const ok = await _openHumanTest.healthcheckOpenHuman(new AbortController().signal);
    expect(ok).toBe(false);
    fetchSpy.mockRestore();
  });
});
