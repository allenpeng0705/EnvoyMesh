/**
 * Lifecycle tests for Envoy Local runtime (Phase 54):
 * enable wiring, CUDA→CPU sidecar fallback, catalog mirror failover / abort.
 */
import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { open, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EnvoyLocalConfig } from "@envoymesh/api";
import { DEFAULT_ENVOY_LOCAL_MODEL } from "../src/envoy-local-platform.js";
import {
  ENVOY_LOCAL_LLAMA_CPP_TAG,
  ENVOY_LOCAL_MIN_MODEL_BYTES,
} from "../src/envoy-local-manifest.js";
import { downloadFile, verifyGgufFile } from "../src/envoy-local-download.js";
import { ENVOY_LOCAL_PORT, envoyLocalOpenAiBaseUrl } from "../src/service-ports.js";

vi.mock("node:child_process", async (importOriginal) => {
  const mod = await importOriginal<typeof import("node:child_process")>();
  return {
    ...mod,
    spawn: vi.fn(),
  };
});

vi.mock("../src/envoy-local-download.js", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../src/envoy-local-download.js")>();
  return {
    ...mod,
    downloadFile: vi.fn(),
    ensureMinFreeBytes: vi.fn().mockResolvedValue(undefined),
    // verifyGgufFile is exercised by its own unit tests; default mock is a
    // pass-through so lifecycle tests don't have to seed a real GGUF header.
    verifyGgufFile: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock("../src/envoy-local-platform.js", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../src/envoy-local-platform.js")>();
  return {
    ...mod,
    detectEnvoyLocalPlatform: vi.fn(() => ({
      os: "linux" as const,
      arch: "x64" as const,
      accel: "cpu" as const,
    })),
  };
});

import { spawn } from "node:child_process";
import { detectEnvoyLocalPlatform } from "../src/envoy-local-platform.js";
import {
  awaitEnvoyLocalOperation,
  cancelEnvoyLocalDownloadViaRuntime,
  createEnvoyLocalRuntimeState,
  declineEnvoyLocalAutoProvisionViaRuntime,
  disableEnvoyLocalViaRuntime,
  downloadEnvoyLocalModelViaRuntime,
  enableEnvoyLocalViaRuntime,
  getEnvoyLocalStatusViaRuntime,
  listEnvoyLocalInstalledModelsViaRuntime,
  maybeDisableEnvoyLocalForExternalProvider,
  maybeStartEnvoyLocalOnBootViaRuntime,
  restartEnvoyLocalViaRuntime,
  startEnvoyLocalViaRuntime,
  stopEnvoyLocalViaRuntime,
  haltEnvoyLocalChildViaRuntime,
  type EnvoyLocalRuntimeDeps,
  type EnvoyLocalRuntimeState,
} from "../src/envoy-local-runtime.js";

const mockedSpawn = vi.mocked(spawn);
const mockedDownloadFile = vi.mocked(downloadFile);
const mockedVerifyGgufFile = vi.mocked(verifyGgufFile);
const mockedDetectPlatform = vi.mocked(detectEnvoyLocalPlatform);

function makeFakeChild(pid: number): ChildProcess & {
  emitExit: (code: number | null) => void;
} {
  const ee = new EventEmitter();
  const stderr = new EventEmitter();
  const child = {
    pid,
    killed: false,
    exitCode: null as number | null,
    signalCode: null as NodeJS.Signals | null,
    stderr,
    kill: vi.fn((signal?: NodeJS.Signals) => {
      queueMicrotask(() => child.emitExit(signal === "SIGKILL" ? null : 0));
      return true;
    }) as unknown as ChildProcess["kill"],
    once: ee.once.bind(ee) as unknown as ChildProcess["once"],
    on: ee.on.bind(ee) as unknown as ChildProcess["on"],
    emit: ee.emit.bind(ee) as unknown as ChildProcess["emit"],
    emitExit: (code: number | null) => {
      child.exitCode = code;
      child.killed = true;
      ee.emit("exit", code, null);
    },
  };
  return child as ChildProcess & { emitExit: (code: number | null) => void };
}

async function writeSparseFile(path: string, size: number): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const fh = await open(path, "w");
  await fh.truncate(size);
  await fh.close();
}

describe("envoy-local-runtime lifecycle", () => {
  let profileDir: string;
  let state: EnvoyLocalRuntimeState;
  let cfg: EnvoyLocalConfig;
  let deps: EnvoyLocalRuntimeDeps;
  let wireModelProviders: ReturnType<typeof vi.fn>;
  let reloadOpenClaw: ReturnType<typeof vi.fn>;
  let clearEnvoyLocalModelProviders: ReturnType<typeof vi.fn>;
  let restoreFallbackModelProviders: ReturnType<typeof vi.fn>;
  let modelProviders: import("@envoymesh/api").ModelProviderConfig | undefined;
  const regionPrev = process.env.ENVOYMESH_ENVOY_LOCAL_MODEL_REGION;
  const downloadRegionPrev = process.env.ENVOYMESH_ENVOY_LOCAL_DOWNLOAD_REGION;

  beforeEach(async () => {
    profileDir = await mkdtemp(join(tmpdir(), "envoy-local-rt-"));
    state = createEnvoyLocalRuntimeState();
    cfg = {};
    modelProviders = { mode: "disabled" };
    wireModelProviders = vi.fn().mockResolvedValue(undefined);
    reloadOpenClaw = vi.fn().mockResolvedValue(undefined);
    clearEnvoyLocalModelProviders = vi.fn().mockResolvedValue(undefined);
    restoreFallbackModelProviders = vi.fn().mockResolvedValue(undefined);
    deps = {
      getProfileDir: () => profileDir,
      loadEnvoyLocalConfig: async () => cfg,
      saveEnvoyLocalConfig: async (patch) => {
        cfg = { ...cfg, ...patch };
      },
      wireModelProviders: wireModelProviders as EnvoyLocalRuntimeDeps["wireModelProviders"],
      reloadOpenClaw: reloadOpenClaw as EnvoyLocalRuntimeDeps["reloadOpenClaw"],
      loadModelProviders: async () => modelProviders,
      clearEnvoyLocalModelProviders: clearEnvoyLocalModelProviders as EnvoyLocalRuntimeDeps["clearEnvoyLocalModelProviders"],
      restoreFallbackModelProviders:
        restoreFallbackModelProviders as EnvoyLocalRuntimeDeps["restoreFallbackModelProviders"],
    };
    mockedSpawn.mockReset();
    mockedDownloadFile.mockReset();
    mockedDetectPlatform.mockReset();
    mockedDetectPlatform.mockReturnValue({
      os: "linux",
      arch: "x64",
      accel: "cpu",
    });
    delete process.env.ENVOYMESH_ENVOY_LOCAL_MODEL_REGION;
    delete process.env.ENVOYMESH_ENVOY_LOCAL_DOWNLOAD_REGION;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true })),
    );
  });

  afterEach(async () => {
    await haltEnvoyLocalChildViaRuntime(state);
    vi.unstubAllGlobals();
    if (regionPrev === undefined) delete process.env.ENVOYMESH_ENVOY_LOCAL_MODEL_REGION;
    else process.env.ENVOYMESH_ENVOY_LOCAL_MODEL_REGION = regionPrev;
    if (downloadRegionPrev === undefined) {
      delete process.env.ENVOYMESH_ENVOY_LOCAL_DOWNLOAD_REGION;
    } else {
      process.env.ENVOYMESH_ENVOY_LOCAL_DOWNLOAD_REGION = downloadRegionPrev;
    }
    await rm(profileDir, { recursive: true, force: true });
  });

  async function seedRuntimeAndModel(): Promise<{ modelPath: string; exePath: string }> {
    const exeName = process.platform === "win32" ? "llama-server.exe" : "llama-server";
    const exePath = join(
      profileDir,
      "envoy-local",
      "runtime",
      ENVOY_LOCAL_LLAMA_CPP_TAG,
      exeName,
    );
    await mkdir(dirname(exePath), { recursive: true });
    await writeFile(exePath, "#!/bin/sh\n", { mode: 0o755 });

    const modelPath = join(
      profileDir,
      "envoy-local",
      "models",
      DEFAULT_ENVOY_LOCAL_MODEL.fileName,
    );
    await writeSparseFile(modelPath, ENVOY_LOCAL_MIN_MODEL_BYTES);
    await writeFile(
      join(profileDir, "envoy-local", "models.json"),
      JSON.stringify(
        {
          activeModelId: DEFAULT_ENVOY_LOCAL_MODEL.id,
          models: [
            {
              id: DEFAULT_ENVOY_LOCAL_MODEL.id,
              fileName: DEFAULT_ENVOY_LOCAL_MODEL.fileName,
              path: modelPath,
              sizeBytes: ENVOY_LOCAL_MIN_MODEL_BYTES,
            },
          ],
        },
        null,
        2,
      ),
      "utf8",
    );
    cfg = {
      enabled: true,
      activeModelId: DEFAULT_ENVOY_LOCAL_MODEL.id,
      runtimeVersion: ENVOY_LOCAL_LLAMA_CPP_TAG,
    };
    return { modelPath, exePath };
  }

  it("enableEnvoyLocal wires modelProviders and reloads OpenClaw when ready", async () => {
    await seedRuntimeAndModel();
    mockedSpawn.mockImplementation(() => makeFakeChild(4242));

    const kicked = await enableEnvoyLocalViaRuntime(state, deps, {
      skipModelDownload: true,
    });
    // Detached: RPC snapshot is in-progress, or already finished on a fast path.
    expect(kicked.operationInProgress || kicked.phase === "ready").toBe(true);

    const status =
      (await awaitEnvoyLocalOperation(state)) ??
      (await getEnvoyLocalStatusViaRuntime(state, deps));
    expect(status.phase).toBe("ready");
    expect(status.enabled).toBe(true);
    expect(cfg.enabled).toBe(true);
    expect(cfg.activeModelId).toBe(DEFAULT_ENVOY_LOCAL_MODEL.id);
    expect(wireModelProviders).toHaveBeenCalledWith(
      envoyLocalOpenAiBaseUrl(ENVOY_LOCAL_PORT),
      DEFAULT_ENVOY_LOCAL_MODEL.id,
    );
    expect(reloadOpenClaw).toHaveBeenCalledTimes(1);
    expect(mockedSpawn).toHaveBeenCalled();
    const args = mockedSpawn.mock.calls[0]?.[1] as string[];
    expect(args).toContain("-ngl");
    expect(mockedDownloadFile).not.toHaveBeenCalled();
  });

  it("startSidecar CUDA failure falls back to -ngl 0 and sets accelFallbackNote", async () => {
    await seedRuntimeAndModel();
    state.platform = { os: "linux", arch: "x64", accel: "cuda" };
    mockedDetectPlatform.mockReturnValue({
      os: "linux",
      arch: "x64",
      accel: "cuda",
    });

    let healthOk = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: healthOk })),
    );

    mockedSpawn
      .mockImplementationOnce(() => {
        const child = makeFakeChild(1001);
        queueMicrotask(() => child.emitExit(1));
        return child;
      })
      .mockImplementationOnce(() => {
        healthOk = true;
        return makeFakeChild(1002);
      });

    const status = await restartEnvoyLocalViaRuntime(state, deps);

    expect(status.phase).toBe("ready");
    expect(status.accelFallbackNote).toMatch(/CUDA start failed/);
    expect(status.accelFallbackNote).toMatch(/-ngl 0/);
    expect(mockedSpawn).toHaveBeenCalledTimes(2);

    const firstArgs = mockedSpawn.mock.calls[0]?.[1] as string[];
    const secondArgs = mockedSpawn.mock.calls[1]?.[1] as string[];
    const nglAt = (args: string[]) => args[args.indexOf("-ngl") + 1];
    expect(nglAt(firstArgs)).toBe("-1"); // auto on CUDA
    expect(nglAt(secondArgs)).toBe("0");
  });

  it("downloadCatalogModel uses hf-mirror in China for curated models without ModelScope", async () => {
    process.env.ENVOYMESH_ENVOY_LOCAL_MODEL_REGION = "cn";
    const urls: string[] = [];
    mockedDownloadFile.mockImplementation(async ({ url, destPath }) => {
      urls.push(url);
      await writeSparseFile(destPath, ENVOY_LOCAL_MIN_MODEL_BYTES);
    });

    await downloadEnvoyLocalModelViaRuntime(state, deps, {
      modelId: DEFAULT_ENVOY_LOCAL_MODEL.id,
    });
    await awaitEnvoyLocalOperation(state);

    expect(urls.length).toBe(1);
    expect(urls[0]).toContain("hf-mirror.com");
    expect(urls[0]).not.toContain("huggingface.co");
    const installed = await listEnvoyLocalInstalledModelsViaRuntime(deps);
    expect(installed.some((m) => m.id === DEFAULT_ENVOY_LOCAL_MODEL.id)).toBe(true);
  });

  it("downloadCatalogModel accepts hf: Hub ids", async () => {
    process.env.ENVOYMESH_ENVOY_LOCAL_MODEL_REGION = "global";
    mockedDownloadFile.mockImplementation(async ({ destPath }) => {
      await writeSparseFile(destPath, ENVOY_LOCAL_MIN_MODEL_BYTES);
    });
    const modelId =
      "hf:unsloth/Qwen3.5-0.8B-GGUF/Qwen3.5-0.8B-Q4_K_M.gguf";
    await downloadEnvoyLocalModelViaRuntime(state, deps, {
      modelId,
    });
    await awaitEnvoyLocalOperation(state);
    const installed = await listEnvoyLocalInstalledModelsViaRuntime(deps);
    expect(installed.some((m) => m.id === modelId)).toBe(true);
    expect(mockedDownloadFile).toHaveBeenCalled();
    const url = mockedDownloadFile.mock.calls[0]?.[0]?.url as string;
    expect(url).toContain("huggingface.co/unsloth/Qwen3.5-0.8B-GGUF/");
  });

  it("getEnvoyLocalStatus keeps downloading phase while sidecar is still running", async () => {
    await seedRuntimeAndModel();
    mockedSpawn.mockImplementation(() => makeFakeChild(9191));
    await restartEnvoyLocalViaRuntime(state, deps);

    let releaseDownload!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseDownload = resolve;
    });
    mockedDownloadFile.mockImplementation(async ({ destPath, onProgress }) => {
      onProgress?.({ bytesReceived: 50_000_000, bytesTotal: 100_000_000 });
      await gate;
      await writeSparseFile(destPath, ENVOY_LOCAL_MIN_MODEL_BYTES);
    });

    // Pick a curated model that is not already installed.
    await downloadEnvoyLocalModelViaRuntime(state, deps, {
      modelId: "gemma-4-e4b-it-q4_k_m",
    });

    const mid = await getEnvoyLocalStatusViaRuntime(state, deps);
    expect(mid.running).toBe(true);
    expect(mid.operationInProgress).toBe(true);
    expect(mid.phase).toBe("downloading-model");
    expect(mid.download?.label).toMatch(/Downloading/i);
    expect(mid.download?.fraction).toBeGreaterThan(0);

    releaseDownload();
    await awaitEnvoyLocalOperation(state);
    const done = await getEnvoyLocalStatusViaRuntime(state, deps);
    expect(done.operationInProgress).toBe(false);
    expect(done.phase).toBe("ready");
  });

  it("clears sticky in-flight phase when no operation is running", async () => {
    state.phase = "downloading-runtime";
    state.download = { phase: "downloading-runtime", label: "stuck" };
    const st = await getEnvoyLocalStatusViaRuntime(state, deps);
    expect(st.operationInProgress).toBe(false);
    expect(st.phase).toBe("disabled");
    expect(state.phase).toBe("disabled");
  });

  it("suggests auto-provision when no cloud provider and assets missing", async () => {
    const st = await getEnvoyLocalStatusViaRuntime(state, deps);
    expect(st.suggestAutoProvision).toBe(true);
    expect(st.recommendedModelLabel).toBeTruthy();
  });

  it("does not suggest auto-provision when cloud is configured", async () => {
    modelProviders = {
      mode: "openai-compatible",
      presetId: "openai",
      modelName: "gpt-4o-mini",
      apiKey: "k",
    };
    const st = await getEnvoyLocalStatusViaRuntime(state, deps);
    expect(st.suggestAutoProvision).toBe(false);
  });

  it("declineEnvoyLocalAutoProvision clears the offer", async () => {
    const st = await declineEnvoyLocalAutoProvisionViaRuntime(state, deps);
    expect(cfg.autoProvisionDeclined).toBe(true);
    expect(st.suggestAutoProvision).toBe(false);
  });

  it("boot does not download when assets are missing", async () => {
    cfg = { enabled: true };
    await maybeStartEnvoyLocalOnBootViaRuntime(state, deps);
    expect(mockedDownloadFile).not.toHaveBeenCalled();
    expect(mockedSpawn).not.toHaveBeenCalled();
  });

  it("listEnvoyLocalInstalledModels annotates successors when supersedes exist", async () => {
    await seedRuntimeAndModel();
    const installed = await listEnvoyLocalInstalledModelsViaRuntime(deps);
    expect(installed.some((m) => m.id === DEFAULT_ENVOY_LOCAL_MODEL.id)).toBe(true);
    // Shipped catalog has no supersedes yet — fields omitted.
    expect(installed[0]?.newerCuratedModelId).toBeUndefined();
  });

  it("boot respects enabled=false after Settings disable", async () => {
    await seedRuntimeAndModel();
    cfg = { ...cfg, enabled: false };
    mockedSpawn.mockImplementation(() => makeFakeChild(5001));
    await maybeStartEnvoyLocalOnBootViaRuntime(state, deps);
    expect(mockedSpawn).not.toHaveBeenCalled();
    expect(state.phase).toBe("disabled");
  });

  it("boot starts sidecar even when cloud provider is configured (they coexist)", async () => {
    await seedRuntimeAndModel();
    cfg = { ...cfg, enabled: true };
    modelProviders = {
      mode: "openai-compatible",
      presetId: "openai",
      modelName: "gpt-4o-mini",
      apiKey: "k",
    };
    mockedSpawn.mockImplementation(() => makeFakeChild(5002));
    await maybeStartEnvoyLocalOnBootViaRuntime(state, deps);
    expect(mockedSpawn).toHaveBeenCalled();
    expect(cfg.enabled).toBe(true);
    // Migration helper may run for leftover envoy-local presets; cloud stays.
    expect(clearEnvoyLocalModelProviders).toHaveBeenCalled();
  });

  it("disableEnvoyLocal does not clear cloud modelProviders", async () => {
    cfg = { enabled: true };
    await disableEnvoyLocalViaRuntime(state, deps);
    expect(cfg.enabled).toBe(false);
    expect(clearEnvoyLocalModelProviders).not.toHaveBeenCalled();
    expect(reloadOpenClaw).toHaveBeenCalled();
  });

  it("startEnvoyLocal starts without downloading when assets exist", async () => {
    await seedRuntimeAndModel();
    cfg = {
      enabled: false,
      activeModelId: DEFAULT_ENVOY_LOCAL_MODEL.id,
      runtimeVersion: ENVOY_LOCAL_LLAMA_CPP_TAG,
    };
    mockedSpawn.mockImplementation(() => makeFakeChild(5151));

    const kicked = await startEnvoyLocalViaRuntime(state, deps);
    expect(kicked.operationInProgress || kicked.phase === "ready").toBe(true);

    const status =
      (await awaitEnvoyLocalOperation(state)) ??
      (await getEnvoyLocalStatusViaRuntime(state, deps));
    expect(status.phase).toBe("ready");
    expect(status.enabled).toBe(true);
    expect(cfg.enabled).toBe(true);
    expect(wireModelProviders).toHaveBeenCalled();
    expect(mockedDownloadFile).not.toHaveBeenCalled();
  });

  it("stopEnvoyLocal always stops without requiring cloud fallback", async () => {
    await seedRuntimeAndModel();
    cfg = {
      enabled: true,
      activeModelId: DEFAULT_ENVOY_LOCAL_MODEL.id,
      runtimeVersion: ENVOY_LOCAL_LLAMA_CPP_TAG,
    };
    mockedSpawn.mockImplementation(() => makeFakeChild(6161));
    await restartEnvoyLocalViaRuntime(state, deps);
    expect(state.child?.pid).toBe(6161);

    const status = await stopEnvoyLocalViaRuntime(state, deps);
    expect(status.enabled).toBe(false);
    expect(status.running).toBe(false);
    expect(cfg.enabled).toBe(false);
    expect(restoreFallbackModelProviders).not.toHaveBeenCalled();
  });

  it("stopEnvoyLocal does not restore fallback into modelProviders", async () => {
    await seedRuntimeAndModel();
    cfg = {
      enabled: true,
      activeModelId: DEFAULT_ENVOY_LOCAL_MODEL.id,
      runtimeVersion: ENVOY_LOCAL_LLAMA_CPP_TAG,
      fallbackModelProviders: {
        mode: "openai-compatible",
        presetId: "minimax-cn",
        endpoint: "https://api.minimaxi.com/v1",
        modelName: "MiniMax-M2.5",
        apiKey: "sk-test",
      },
    };
    mockedSpawn.mockImplementation(() => makeFakeChild(7171));
    await restartEnvoyLocalViaRuntime(state, deps);

    const status = await stopEnvoyLocalViaRuntime(state, deps);
    expect(status.enabled).toBe(false);
    expect(status.running).toBe(false);
    expect(cfg.enabled).toBe(false);
    expect(restoreFallbackModelProviders).not.toHaveBeenCalled();
    expect(reloadOpenClaw).toHaveBeenCalled();
  });

  it("getEnvoyLocalStatus reports canStop when running", async () => {
    await seedRuntimeAndModel();
    mockedSpawn.mockImplementation(() => makeFakeChild(8181));
    await restartEnvoyLocalViaRuntime(state, deps);
    const running = await getEnvoyLocalStatusViaRuntime(state, deps);
    expect(running.canStop).toBe(true);

    await stopEnvoyLocalViaRuntime(state, deps);
    const stopped = await getEnvoyLocalStatusViaRuntime(state, deps);
    expect(stopped.canStop).toBe(false);
  });

  it("maybeDisableEnvoyLocalForExternalProvider is a no-op (cloud and Local coexist)", async () => {
    cfg = { enabled: true };
    const disabled = await maybeDisableEnvoyLocalForExternalProvider(state, deps, {
      mode: "openai-compatible",
      presetId: "openai",
      modelName: "gpt-4o-mini",
      apiKey: "k",
    });
    expect(disabled).toBe(false);
    expect(cfg.enabled).toBe(true);
  });

  it("maybeDisableEnvoyLocalForExternalProvider ignores disabled AI too", async () => {
    cfg = { enabled: true };
    const disabled = await maybeDisableEnvoyLocalForExternalProvider(state, deps, {
      mode: "disabled",
      presetId: "disabled",
    });
    expect(disabled).toBe(false);
    expect(cfg.enabled).toBe(true);
  });

  it("maybeDisableEnvoyLocalForExternalProvider ignores envoy-local provider", async () => {
    cfg = { enabled: true };
    const disabled = await maybeDisableEnvoyLocalForExternalProvider(state, deps, {
      mode: "openai-compatible",
      presetId: "envoy-local",
      modelName: "qwen3.5-0.8b-q4_k_m",
      endpoint: "http://127.0.0.1:18790/v1",
    });
    expect(disabled).toBe(false);
    expect(cfg.enabled).toBe(true);
  });

  it("catalog failover stops on abort without trying further mirrors", async () => {
    process.env.ENVOYMESH_ENVOY_LOCAL_MODEL_REGION = "cn";
    const urls: string[] = [];
    mockedDownloadFile.mockImplementation(async ({ url, signal }) => {
      urls.push(url);
      await new Promise<never>((_, reject) => {
        const onAbort = () => {
          const err = new Error("aborted");
          err.name = "AbortError";
          reject(err);
        };
        if (signal?.aborted) {
          onAbort();
          return;
        }
        signal?.addEventListener("abort", onAbort, { once: true });
      });
    });

    await downloadEnvoyLocalModelViaRuntime(state, deps, {
      modelId: DEFAULT_ENVOY_LOCAL_MODEL.id,
    });
    const op = state.enablePromise;
    expect(op).toBeTruthy();

    await vi.waitFor(() => {
      expect(urls.length).toBe(1);
      expect(state.abort).not.toBeNull();
    });

    await cancelEnvoyLocalDownloadViaRuntime(state, deps);
    const st = await op!;
    expect(urls.length).toBe(1);
    expect(st.lastError ?? state.lastError).toBe("Download cancelled");
  });

  it("downloadEnvoyLocalModel rejects non-GGUF downloads and cleans the file", async () => {
    process.env.ENVOYMESH_ENVOY_LOCAL_MODEL_REGION = "global";
    let downloadedPath: string | undefined;
    mockedDownloadFile.mockImplementation(async ({ destPath }) => {
      downloadedPath = destPath;
      await writeSparseFile(destPath, ENVOY_LOCAL_MIN_MODEL_BYTES);
    });
    mockedVerifyGgufFile.mockRejectedValueOnce(
      new Error('Bad GGUF magic: expected 0x46554747 ("GGUF"), got 0x00000000'),
    );

    await downloadEnvoyLocalModelViaRuntime(state, deps, {
      modelId: DEFAULT_ENVOY_LOCAL_MODEL.id,
    });
    const st =
      (await awaitEnvoyLocalOperation(state)) ??
      (await getEnvoyLocalStatusViaRuntime(state, deps));
    expect(st.lastError ?? state.lastError).toMatch(/GGUF magic/);

    // File must be removed so the next attempt re-downloads from scratch
    // (matches the sha256-mismatch cleanup pattern at runtime.ts:589).
    expect(downloadedPath).toBeTruthy();
    const { existsSync } = await import("node:fs");
    expect(existsSync(downloadedPath!)).toBe(false);
  });

  it("downloadEnvoyLocalModel preserves pre-existing .part so downloadFile can resume", async () => {
    process.env.ENVOYMESH_ENVOY_LOCAL_MODEL_REGION = "global";
    const partPath = join(
      profileDir,
      "envoy-local",
      "models",
      `${DEFAULT_ENVOY_LOCAL_MODEL.fileName}.part`,
    );
    // Pre-seed a .part file as if a previous attempt got partway through
    // and died (network blip, app restart). The runtime must not wipe it
    // before calling downloadFile — that's what enables HTTP Range resume.
    const partialSize = 318_000_000; // ~60% of qwen3.5-0.8b
    await mkdir(dirname(partPath), { recursive: true });
    await writeSparseFile(partPath, partialSize);

    // The mock mirrors what the real downloadFile would do on entry: stat
    // the .part to learn the resume offset. We record that size and the
    // request URL so we can assert the runtime didn't rm the .part first.
    let observedPartSize = 0;
    let downloadCalled = false;
    mockedDownloadFile.mockImplementation(async ({ destPath }) => {
      downloadCalled = true;
      const { stat: statFn } = await import("node:fs/promises");
      try {
        observedPartSize = (await statFn(partPath)).size;
      } catch {
        observedPartSize = 0;
      }
      await writeSparseFile(destPath, ENVOY_LOCAL_MIN_MODEL_BYTES);
    });

    await downloadEnvoyLocalModelViaRuntime(state, deps, {
      modelId: DEFAULT_ENVOY_LOCAL_MODEL.id,
    });
    await awaitEnvoyLocalOperation(state);

    expect(downloadCalled).toBe(true);
    // The .part is still there at the pre-seeded size when downloadFile
    // runs. (Real Range-header behavior is covered in
    // envoy-local-download.test.ts; this test just guards the
    // runtime-level contract: don't wipe the user's partial work.)
    expect(observedPartSize).toBe(partialSize);
  });

  it("startSidecar fails with model-size-aware timeout (not the old 60s hardcode)", async () => {
    // Set up a 9B-sized model (5.5 GB) so the default startup timeout is
    // 240s. Probe returns false immediately, child stays alive, so the
    // probe loop hits the deadline and throws the timeout error.
    await seedRuntimeAndModel();
    const modelPath = join(
      profileDir,
      "envoy-local",
      "models",
      DEFAULT_ENVOY_LOCAL_MODEL.fileName,
    );
    // 5.5 GB sparse file → resolveStartupTimeoutMs returns 480_000
    await writeSparseFile(modelPath, 5_500_000_000);

    // Child stays alive (no emitExit). /v1/models returns 503 immediately
    // so the probe loop iterates and quickly hits the deadline.
    mockedSpawn.mockImplementation(() => makeFakeChild(9999));
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 503 })),
    );

    // Override to 100 ms so the test doesn't wait 240 s. The 240s default
    // is verified separately in envoy-local-manifest.test.ts.
    cfg = { ...cfg, serverParams: { startupTimeoutMs: 100 } };

    // restartEnvoyLocalViaRuntime catches the startSidecar error and
    // stores it on state.lastError. Inspect that.
    const status = await restartEnvoyLocalViaRuntime(state, deps);
    expect(status.lastError).toMatch(/did not become ready within/);
    expect(status.phase).toBe("error");
  });

  it("user override of startupTimeoutMs is reflected in the error message", async () => {
    await seedRuntimeAndModel();
    // The seed file is 50 MB → size-based default is 30 s. With the
    // 100 ms override the error message should mention the override, not
    // the size default.
    cfg = { ...cfg, serverParams: { startupTimeoutMs: 100 } };

    mockedSpawn.mockImplementation(() => makeFakeChild(9998));
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 503 })),
    );

    const status = await restartEnvoyLocalViaRuntime(state, deps);
    // 100 ms rounds to "0s" in the error message. The point is that
    // the error IS the timeout (not "llama-server exited" from a crashed
    // child) and that startupTimeoutMs is what determined it.
    expect(status.lastError).toMatch(/did not become ready within 0s/);
    expect(status.lastError).toMatch(/Startup timeout|startupTimeoutMs/);
    expect(status.phase).toBe("error");
  });

  it("scans a dropped GGUF and auto-activates when it is the only model", async () => {
    const modelsPath = join(profileDir, "envoy-local", "models");
    await mkdir(modelsPath, { recursive: true });
    const fileName = "MyCustom-7B-Q4_K_M.gguf";
    await writeSparseFile(join(modelsPath, fileName), ENVOY_LOCAL_MIN_MODEL_BYTES);

    const installed = await listEnvoyLocalInstalledModelsViaRuntime(deps);
    expect(installed).toHaveLength(1);
    expect(installed[0]?.id).toBe("local:mycustom-7b-q4_k_m");
    expect(installed[0]?.active).toBe(true);
    expect(cfg.activeModelId).toBe("local:mycustom-7b-q4_k_m");

    const status = await getEnvoyLocalStatusViaRuntime(state, deps);
    expect(status.modelsDir).toBe(modelsPath);
    expect(status.activeModelId).toBe("local:mycustom-7b-q4_k_m");
  });

  it("enableEnvoyLocal uses a scanned curated filename without downloading", async () => {
    const exeName = process.platform === "win32" ? "llama-server.exe" : "llama-server";
    const exePath = join(
      profileDir,
      "envoy-local",
      "runtime",
      ENVOY_LOCAL_LLAMA_CPP_TAG,
      exeName,
    );
    await mkdir(dirname(exePath), { recursive: true });
    await writeFile(exePath, "#!/bin/sh\n", { mode: 0o755 });
    const modelsPath = join(profileDir, "envoy-local", "models");
    await mkdir(modelsPath, { recursive: true });
    await writeSparseFile(
      join(modelsPath, "Qwen3.5-4B-Q4_K_M.gguf"),
      ENVOY_LOCAL_MIN_MODEL_BYTES,
    );

    mockedSpawn.mockImplementation(() => makeFakeChild(4243));
    await enableEnvoyLocalViaRuntime(state, deps, { skipModelDownload: true });
    const status =
      (await awaitEnvoyLocalOperation(state)) ??
      (await getEnvoyLocalStatusViaRuntime(state, deps));

    expect(status.phase).toBe("ready");
    expect(status.activeModelId).toBe("qwen3.5-4b-q4_k_m");
    expect(mockedDownloadFile).not.toHaveBeenCalled();
  });

  it("enableEnvoyLocal passes an absolute model path to llama-server", async () => {
    // Relative profileDir (matches apps/node `data/default` in production).
    const relProfile = join("data", "envoy-local-rel-profile");
    const absProfile = join(profileDir, relProfile);
    await mkdir(absProfile, { recursive: true });
    // Point deps at the relative path while files live under abs via cwd.
    const prevCwd = process.cwd();
    process.chdir(profileDir);
    try {
      const exeName = process.platform === "win32" ? "llama-server.exe" : "llama-server";
      const exePath = join(
        relProfile,
        "envoy-local",
        "runtime",
        ENVOY_LOCAL_LLAMA_CPP_TAG,
        exeName,
      );
      await mkdir(dirname(exePath), { recursive: true });
      await writeFile(exePath, "#!/bin/sh\n", { mode: 0o755 });
      const modelFile = DEFAULT_ENVOY_LOCAL_MODEL.fileName;
      const modelRel = join(relProfile, "envoy-local", "models", modelFile);
      await mkdir(dirname(modelRel), { recursive: true });
      await writeSparseFile(modelRel, ENVOY_LOCAL_MIN_MODEL_BYTES);
      await writeFile(
        join(relProfile, "envoy-local", "models.json"),
        JSON.stringify({
          activeModelId: DEFAULT_ENVOY_LOCAL_MODEL.id,
          models: [
            {
              id: DEFAULT_ENVOY_LOCAL_MODEL.id,
              fileName: modelFile,
              path: modelRel,
              sizeBytes: ENVOY_LOCAL_MIN_MODEL_BYTES,
            },
          ],
        }),
        "utf8",
      );
      cfg = {
        enabled: true,
        activeModelId: DEFAULT_ENVOY_LOCAL_MODEL.id,
        runtimeVersion: ENVOY_LOCAL_LLAMA_CPP_TAG,
      };
      const relDeps: EnvoyLocalRuntimeDeps = {
        ...deps,
        getProfileDir: () => relProfile,
      };
      mockedSpawn.mockImplementation(() => makeFakeChild(7777));
      await enableEnvoyLocalViaRuntime(state, relDeps, { skipModelDownload: true });
      await awaitEnvoyLocalOperation(state);
      const args = mockedSpawn.mock.calls[0]?.[1] as string[];
      const mIdx = args.indexOf("-m");
      expect(mIdx).toBeGreaterThanOrEqual(0);
      expect(args[mIdx + 1]).toMatch(/^\//);
      expect(args[mIdx + 1]).toContain(modelFile);
    } finally {
      process.chdir(prevCwd);
    }
  });
});
