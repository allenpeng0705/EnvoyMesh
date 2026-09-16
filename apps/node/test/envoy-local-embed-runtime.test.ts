import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { mkdirSync, writeFileSync } from "node:fs";
import { mkdir, mkdtemp, open, rm, writeFile } from "node:fs/promises";
import { hostname as osHostname, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  confirmEnvoyLocalEmbedInferenceReady,
  createEnvoyLocalEmbedRuntimeState,
  enableEnvoyLocalEmbedViaRuntime,
  getEnvoyLocalEmbedStatusViaRuntime,
  probeEnvoyLocalEmbedInference,
  probeEnvoyLocalEmbedModels,
  type EnvoyLocalEmbedRuntimeDeps,
} from "../src/envoy-local-embed-runtime.js";

vi.mock("node:child_process", async (importOriginal) => {
  const mod = await importOriginal<typeof import("node:child_process")>();
  return { ...mod, spawn: vi.fn() };
});

import { spawn } from "node:child_process";
import { ENVOY_LOCAL_LLAMA_CPP_TAG } from "../src/envoy-local-manifest.js";
import { engineRootFor } from "../src/engine-root.js";
import {
  ENVOY_LOCAL_MIN_MODEL_BYTES,
  currentProcessStartedAt,
  engineLockPath,
  processStartedAt,
  readEngineLock,
  releaseEngineLock,
} from "@envoymesh/node-core";

const mockedSpawn = vi.mocked(spawn);

/** A stand-in for the embed `llama-server` child: a pid, a `kill`, and an exit event. */
function makeFakeChild(pid: number): ChildProcess & { emitExit: (code: number | null) => void } {
  const ee = new EventEmitter();
  const stderr = new EventEmitter();
  const child = {
    pid,
    killed: false,
    exitCode: null as number | null,
    signalCode: null as NodeJS.Signals | null,
    stderr,
    kill: vi.fn(() => true),
    on: (event: string, listener: (...args: never[]) => void) => {
      ee.on(event, listener as never);
      return child;
    },
    once: (event: string, listener: (...args: never[]) => void) => {
      ee.once(event, listener as never);
      return child;
    },
    removeListener: (event: string, listener: (...args: never[]) => void) => {
      ee.removeListener(event, listener as never);
      return child;
    },
  } as unknown as ChildProcess & { emitExit: (code: number | null) => void };
  child.emitExit = (code) => ee.emit("exit", code, null);
  return child;
}

async function writeSparseFile(path: string, size: number): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const fh = await open(path, "w");
  await fh.truncate(size);
  await fh.close();
}

function minimalDeps(
  patch: Partial<EnvoyLocalEmbedRuntimeDeps> = {},
): EnvoyLocalEmbedRuntimeDeps {
  return {
    getProfileDir: () => "/tmp/envoy-embed-test",
    loadEnvoyLocalEmbedConfig: async () => ({
      enabled: true,
      activeModelId: "test-embed-model",
    }),
    saveEnvoyLocalEmbedConfig: async () => undefined,
    ...patch,
  };
}

describe("envoy-local-embed probes", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("probeEnvoyLocalEmbedModels returns true on HTTP 200", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ data: [] }), { status: 200 })),
    );
    await expect(
      probeEnvoyLocalEmbedModels("http://127.0.0.1:18791/v1"),
    ).resolves.toBe(true);
  });

  it("probeEnvoyLocalEmbedModels returns false on network error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );
    await expect(
      probeEnvoyLocalEmbedModels("http://127.0.0.1:18791/v1"),
    ).resolves.toBe(false);
  });

  it("probeEnvoyLocalEmbedInference requires a non-empty vector", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({ data: [{ embedding: [0.1, 0.2] }] }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      ),
    );
    await expect(
      probeEnvoyLocalEmbedInference("http://127.0.0.1:18791/v1", "qwen3-embedding-0.6b"),
    ).resolves.toBe(true);
  });

  it("probeEnvoyLocalEmbedInference returns false when embeddings hang (abort)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        const signal = init?.signal;
        return await new Promise<Response>((_resolve, reject) => {
          if (!signal) {
            reject(new Error("missing abort signal"));
            return;
          }
          signal.addEventListener("abort", () => {
            reject(new DOMException("The operation was aborted", "AbortError"));
          });
        });
      }),
    );
    await expect(
      probeEnvoyLocalEmbedInference("http://127.0.0.1:18791/v1", "m", 50),
    ).resolves.toBe(false);
  });

  it("probeEnvoyLocalEmbedInference returns false on empty embedding", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ data: [{ embedding: [] }] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    await expect(
      probeEnvoyLocalEmbedInference("http://127.0.0.1:18791/v1", "m"),
    ).resolves.toBe(false);
  });

  it("confirmEnvoyLocalEmbedInferenceReady requires models + embeddings", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).endsWith("/models")) {
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      }
      return new Response(
        JSON.stringify({ data: [{ embedding: [0.01] }] }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const state = createEnvoyLocalEmbedRuntimeState();
    await expect(
      confirmEnvoyLocalEmbedInferenceReady(state, minimalDeps()),
    ).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalled();
  });

  it("confirmEnvoyLocalEmbedInferenceReady is false when embeddings empty", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).endsWith("/models")) {
          return new Response(JSON.stringify({ data: [] }), { status: 200 });
        }
        return new Response(
          JSON.stringify({ data: [{ embedding: [] }] }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }),
    );
    const state = createEnvoyLocalEmbedRuntimeState();
    await expect(
      confirmEnvoyLocalEmbedInferenceReady(state, minimalDeps()),
    ).resolves.toBe(false);
  });

  it("createEnvoyLocalEmbedRuntimeState tracks watchdog tick in-flight", () => {
    const state = createEnvoyLocalEmbedRuntimeState();
    expect(state.watchdogTickInFlight).toBe(false);
  });
});

/**
 * The embed engine's spawn path — the same lock wiring as the chat engine, driven end to end.
 *
 * This is the coverage that was missing: the file above only exercised probes, so a lock
 * defect in the embed start path (the claim released before the spawn, or a borrower arming a
 * killing watchdog) had nothing that would notice. Seeding a fake `llama-server` and a sparse
 * model is what makes the real path runnable in a test.
 */
/**
 * Write a claim the way **another process** would have written it.
 *
 * `acquireEngineLock` always records the *calling* process's start time, so using it to fake a
 * foreign holder pairs a pid that is not ours with our start time — and the pid-reuse guard
 * reads that pair, sees a mismatch, and correctly treats the claim as stale. Seeding the file
 * directly is what a foreign process actually leaves behind: its own pid and its own start time.
 */
function writeForeignClaim(
  rootDir: string,
  claim: { pid: number; app: string; port: number; modelId?: string; role?: "chat" | "embed" },
): void {
  const role = claim.role ?? "embed";
  const file = engineLockPath(rootDir, role);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(
    file,
    `${JSON.stringify(
      {
        role,
        pid: claim.pid,
        host: osHostname(),
        pidStartedAt: processStartedAt(claim.pid) ?? currentProcessStartedAt(),
        app: claim.app,
        port: claim.port,
        ...(claim.modelId ? { modelId: claim.modelId } : {}),
        startedAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

describe("envoy-local-embed engine lock", () => {
  let profileDir: string;
  let state: ReturnType<typeof createEnvoyLocalEmbedRuntimeState>;
  let savedEmbedConfig: { activeModelId?: string; enabled?: boolean };

  async function seedEmbedRuntimeAndModel(): Promise<{ engineRoot: string; modelId: string }> {
    // Resolve the root exactly as the runtime does — including the recorded decision — so a
    // test can never seed assets somewhere the runtime will not look.
    const engineRoot = engineRootFor(profileDir).dir;
    const exeName = process.platform === "win32" ? "llama-server.exe" : "llama-server";
    const exePath = join(engineRoot, "runtime", ENVOY_LOCAL_LLAMA_CPP_TAG, exeName);
    await mkdir(dirname(exePath), { recursive: true });
    await writeFile(exePath, "#!/bin/sh\n", { mode: 0o755 });

    const modelId = "local:embed-test";
    const modelPath = join(engineRoot, "embed-models", "Embed-Test-Q8_0.gguf");
    await writeSparseFile(modelPath, ENVOY_LOCAL_MIN_MODEL_BYTES);
    await writeFile(
      join(engineRoot, "embed-models.json"),
      JSON.stringify({
        activeModelId: modelId,
        models: [{ id: modelId, fileName: "Embed-Test-Q8_0.gguf", path: modelPath }],
      }),
      "utf8",
    );
    savedEmbedConfig = { activeModelId: modelId, enabled: true };
    return { engineRoot, modelId };
  }

  function deps(): EnvoyLocalEmbedRuntimeDeps {
    return {
      getProfileDir: () => profileDir,
      loadEnvoyLocalEmbedConfig: async () => ({ ...savedEmbedConfig }),
      saveEnvoyLocalEmbedConfig: async (patch) => {
        savedEmbedConfig = { ...savedEmbedConfig, ...(patch as object) };
      },
      preferredEmbedModelId: async () => undefined,
    } as EnvoyLocalEmbedRuntimeDeps;
  }

  async function runEnable(): Promise<void> {
    await enableEnvoyLocalEmbedViaRuntime(state, deps(), { skipModelDownload: true });
    // `enableEnvoyLocalEmbed` returns before the work is done; drain it then read the state.
    const deadline = Date.now() + 5_000;
    while (state.enablePromise && Date.now() < deadline) {
      await state.enablePromise;
      break;
    }
    await getEnvoyLocalEmbedStatusViaRuntime(state, deps());
  }

  beforeAll(() => undefined);

  let killSpy: ReturnType<typeof vi.spyOn>;
  /** Pids the runtime tried to signal — the holder's engine must never be one of them. */
  let killedPids: number[];

  beforeEach(async () => {
    profileDir = await mkdtemp(join(tmpdir(), "envoy-embed-lock-"));
    killedPids = [];
    // The stop/reclaim paths kill whatever listens on the embed port. In a test that must never
    // reach a real process (a developer may well have an embed engine running), and the spy is
    // also how the gate below is asserted.
    // `process.kill(pid, 0)` is the *liveness probe* — mocking it unconditionally made every
    // dead pid look alive, which is how the takeover test started timing out instead. Signal 0
    // stays real; the signalling calls (SIGTERM/SIGKILL) are recorded and never delivered.
    const realKill = process.kill.bind(process);
    killSpy = vi.spyOn(process, "kill").mockImplementation(((pid: number, signal?: number | NodeJS.Signals) => {
      if (signal === 0) return realKill(pid, signal as number);
      killedPids.push(pid);
      return true;
    }) as typeof process.kill);
    state = createEnvoyLocalEmbedRuntimeState();
    mockedSpawn.mockReset();
    mockedSpawn.mockImplementation(() => makeFakeChild(9001) as never);
    // A realistic engine: `/v1/models` lists the model and `/v1/embeddings` returns a vector,
    // which is what the readiness probe checks. A bare `{ok:true}` stub makes every start time
    // out instead — the probes parse the bodies.
    // "The port is free, then our engine answers." The start path probes the port *before*
    // taking the lock (an orphan from a previous node is adopted there), so a stub that answers
    // immediately makes every start look like "somebody else is already serving" and the lock
    // code is never reached.
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (mockedSpawn.mock.calls.length === 0) {
          return new Response("", { status: 503 });
        }
        if (String(url).endsWith("/embeddings")) {
          return new Response(JSON.stringify({ data: [{ embedding: [0.1, 0.2] }] }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ data: [{ id: "local:embed-test" }] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }),
    );
  });

  afterEach(async () => {
    killSpy.mockRestore();
    vi.unstubAllGlobals();
    await rm(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  });

  it("holds the embed claim while its engine runs", async () => {
    const { engineRoot } = await seedEmbedRuntimeAndModel();
    await runEnable();
    const held = readEngineLock(engineRoot, "embed");
    expect(held, "the claim must survive a successful start").not.toBeNull();
    expect(held?.pid).toBe(process.pid);
    expect(held?.role).toBe("embed");
    await releaseEngineLock(engineRoot, process.pid, "embed");
  });

  it("does not spawn a second embed engine while another process holds the claim", async () => {
    const { engineRoot } = await seedEmbedRuntimeAndModel();
    // A different live process: `process.ppid`, because a claim naming this process is
    // re-acquired on purpose (that is what a restart in the same process looks like).
    writeForeignClaim(engineRoot, { role: "embed", pid: process.ppid, app: "EnvoyDev", port: 18791 });
    mockedSpawn.mockClear();

    await runEnable();

    expect(mockedSpawn, "no second embed engine may be spawned").not.toHaveBeenCalled();
    expect(state.lastError ?? "").toMatch(/embeddings engine lock/);
    expect(state.lastError ?? "").toMatch(/EnvoyDev/);
    expect(readEngineLock(engineRoot, "embed")?.app).toBe("EnvoyDev");
    // …and it must not have been killed: the reclaim path stops whatever listens on the port,
    // which for a live holder is *their* engine. Killing it would leave them restarting an
    // engine we then blame for not answering.
    expect(killedPids, "the holder's engine must not be killed").toEqual([]);
    await releaseEngineLock(engineRoot, process.ppid, "embed");
  });

  it("refuses to adopt an embed engine that holds a different model (one agreed model)", async () => {
    const { engineRoot } = await seedEmbedRuntimeAndModel();
    writeForeignClaim(engineRoot, {
      role: "embed",
      pid: process.ppid,
      app: "EnvoyDev",
      port: 18791,
      modelId: "local:some-other-embed-model",
    });
    mockedSpawn.mockClear();

    await runEnable();

    // One engine serves one model: adopting this one would compute embeddings with the wrong
    // model, so the start must fail with a message a user can act on.
    expect(mockedSpawn).not.toHaveBeenCalled();
    expect(state.lastError ?? "").toMatch(/already running the model/);
    expect(state.lastError ?? "").toMatch(/local:some-other-embed-model/);
    expect(state.lastError ?? "").toMatch(/Settings → AI/);
    await releaseEngineLock(engineRoot, process.ppid, "embed");
  });

  it("takes over a stale embed claim and starts the engine", async () => {
    const { engineRoot } = await seedEmbedRuntimeAndModel();
    writeForeignClaim(engineRoot, {
      role: "embed",
      pid: 2_147_483_646, // certainly dead
      app: "CrashedCoder",
      port: 18791,
    });
    mockedSpawn.mockClear();

    await runEnable();

    expect(mockedSpawn).toHaveBeenCalled();
    expect(readEngineLock(engineRoot, "embed")?.app).not.toBe("CrashedCoder");
    await releaseEngineLock(engineRoot, process.pid, "embed");
  });
});
