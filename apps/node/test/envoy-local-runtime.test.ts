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
import { downloadFile } from "../src/envoy-local-download.js";
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
  stopEnvoyLocalViaRuntime,
  type EnvoyLocalRuntimeDeps,
  type EnvoyLocalRuntimeState,
} from "../src/envoy-local-runtime.js";

const mockedSpawn = vi.mocked(spawn);
const mockedDownloadFile = vi.mocked(downloadFile);
const mockedDetectPlatform = vi.mocked(detectEnvoyLocalPlatform);

function makeFakeChild(pid: number): ChildProcess & {
  emitExit: (code: number | null) => void;
} {
  const ee = new EventEmitter();
  const child = {
    pid,
    killed: false,
    exitCode: null as number | null,
    signalCode: null as NodeJS.Signals | null,
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
    await stopEnvoyLocalViaRuntime(state);
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

    const status = await enableEnvoyLocalViaRuntime(state, deps, {
      skipModelDownload: true,
    });

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

    const installed = await downloadEnvoyLocalModelViaRuntime(state, deps, {
      modelId: DEFAULT_ENVOY_LOCAL_MODEL.id,
    });

    expect(urls.length).toBe(1);
    expect(urls[0]).toContain("hf-mirror.com");
    expect(urls[0]).not.toContain("huggingface.co");
    expect(installed.some((m) => m.id === DEFAULT_ENVOY_LOCAL_MODEL.id)).toBe(true);
  });

  it("downloadCatalogModel accepts hf: Hub ids", async () => {
    process.env.ENVOYMESH_ENVOY_LOCAL_MODEL_REGION = "global";
    mockedDownloadFile.mockImplementation(async ({ destPath }) => {
      await writeSparseFile(destPath, ENVOY_LOCAL_MIN_MODEL_BYTES);
    });
    const modelId =
      "hf:unsloth/Qwen3.5-0.8B-GGUF/Qwen3.5-0.8B-Q4_K_M.gguf";
    const installed = await downloadEnvoyLocalModelViaRuntime(state, deps, {
      modelId,
    });
    expect(installed.some((m) => m.id === modelId)).toBe(true);
    expect(mockedDownloadFile).toHaveBeenCalled();
    const url = mockedDownloadFile.mock.calls[0]?.[0]?.url as string;
    expect(url).toContain("huggingface.co/unsloth/Qwen3.5-0.8B-GGUF/");
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

  it("boot does not start sidecar when cloud provider is active", async () => {
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
    expect(mockedSpawn).not.toHaveBeenCalled();
    expect(cfg.enabled).toBe(false);
  });

  it("disableEnvoyLocal clears stale envoy-local modelProviders", async () => {
    cfg = { enabled: true };
    await disableEnvoyLocalViaRuntime(state, deps);
    expect(cfg.enabled).toBe(false);
    expect(clearEnvoyLocalModelProviders).toHaveBeenCalled();
  });

  it("maybeDisableEnvoyLocalForExternalProvider turns off when cloud is saved", async () => {
    cfg = { enabled: true };
    const disabled = await maybeDisableEnvoyLocalForExternalProvider(state, deps, {
      mode: "openai-compatible",
      presetId: "openai",
      modelName: "gpt-4o-mini",
      apiKey: "k",
    });
    expect(disabled).toBe(true);
    expect(cfg.enabled).toBe(false);
  });

  it("maybeDisableEnvoyLocalForExternalProvider turns off when AI is disabled", async () => {
    cfg = { enabled: true };
    const disabled = await maybeDisableEnvoyLocalForExternalProvider(state, deps, {
      mode: "disabled",
      presetId: "disabled",
    });
    expect(disabled).toBe(true);
    expect(cfg.enabled).toBe(false);
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

    const pending = downloadEnvoyLocalModelViaRuntime(state, deps, {
      modelId: DEFAULT_ENVOY_LOCAL_MODEL.id,
    });

    await vi.waitFor(() => {
      expect(urls.length).toBe(1);
      expect(state.abort).not.toBeNull();
    });

    await cancelEnvoyLocalDownloadViaRuntime(state, deps);
    await expect(pending).rejects.toThrow(/abort/i);
    expect(urls.length).toBe(1);
    expect(state.lastError).toBe("Download cancelled");
  });
});
