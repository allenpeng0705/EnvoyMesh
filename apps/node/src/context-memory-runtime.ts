/**
 * Phase 70 — Context Memory runtime (native store + optional OpenViking HTTP).
 * Ready-gated: callers must check status() === "ready" before recall/write.
 * Wave OV-DL: blank OV endpoint → managed download-on-enable; set endpoint → BYO.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  ContextMemoryBackendId,
  ContextMemoryFact,
  ContextMemoryInstallPhase,
  ContextMemorySettings,
  ContextMemoryStatus,
  ContextMemoryStatusSnapshot,
} from "@envoymesh/api";
import { resolveContextMemorySettings } from "@envoymesh/api";
import {
  CONTEXT_MEMORY_DEFAULT_NAMESPACE,
  createContextMemoryStore,
  extractDurableFactsFromTurn,
  mergeExtractedFacts,
  normalizeContextMemoryNamespace,
  parseMemoryMdSeedLines,
  shouldTryLlmFactExtract,
  type ContextMemoryStore,
} from "@envoymesh/local-store";
import {
  createOvClient,
  DEFAULT_OV_ENDPOINT,
  type OvClient,
  type OvFetchLike,
} from "./context-memory-ov-client.js";
import {
  createDefaultOvManagedDriver,
  ovManagedRoot,
  type OvManagedDriver,
} from "./context-memory-ov-managed.js";

export type ContextMemoryModelExtract = (input: {
  userText: string;
  assistantText?: string;
}) => Promise<string[]>;

export interface ContextMemoryBackend {
  status(): ContextMemoryStatus;
  snapshot(): ContextMemoryStatusSnapshot;
  recallForTurn(query: string): Promise<string>;
  rememberFromTurn(input: {
    userText: string;
    assistantText?: string;
  }): Promise<void>;
  listFacts(): Promise<ContextMemoryFact[]>;
  forget(id: string): Promise<boolean>;
  pin(id: string, pinned: boolean): Promise<boolean>;
  applySettings(settings: ContextMemorySettings | null | undefined): Promise<void>;
  /** Force a new managed install attempt (Settings Retry). */
  retryManagedInstall(): Promise<void>;
  maybeSeedMemoryMd(memoryMdPath: string): Promise<{ seeded: boolean; count: number }>;
}

function toFact(f: {
  id: string;
  text: string;
  tags: string[];
  importance: number;
  createdAt: string;
  updatedAt: string;
  source?: string;
}): ContextMemoryFact {
  return {
    id: f.id,
    text: f.text,
    tags: f.tags,
    importance: f.importance,
    createdAt: f.createdAt,
    updatedAt: f.updatedAt,
    source: f.source,
  };
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "ENOENT"
  );
}

function isAbortError(err: unknown): boolean {
  return (
    (err instanceof Error && err.name === "AbortError") ||
    (typeof err === "object" &&
      err !== null &&
      "name" in err &&
      (err as { name?: string }).name === "AbortError")
  );
}

export function createContextMemoryRuntime(input: {
  profileDir: string;
  getSettings: () => ContextMemorySettings | null | undefined;
  patchSettings?: (partial: ContextMemorySettings) => Promise<void>;
  /** Optional home-model extract; soft-fail — heuristic always runs. */
  extractFactsWithModel?: ContextMemoryModelExtract;
  /** Test seam for OpenViking HTTP. */
  ovFetch?: OvFetchLike;
  /** Test seam / override for managed install+start. */
  ovManagedDriver?: OvManagedDriver;
}): ContextMemoryBackend {
  const { profileDir, getSettings, patchSettings, extractFactsWithModel, ovFetch } = input;
  const managedDriver = input.ovManagedDriver ?? createDefaultOvManagedDriver();
  const managedRoot = ovManagedRoot(profileDir);

  let store: ContextMemoryStore | null = null;
  let ovClient: OvClient | null = null;
  /** apiKey the live ovClient was built with (endpoint is on the client). */
  let ovBoundApiKey: string | undefined;
  let lastStatus: ContextMemoryStatus = "off";
  let lastError: string | undefined;
  let lastBackend: ContextMemoryBackendId = "native";
  let appliedSettings: ContextMemorySettings = resolveContextMemorySettings(undefined);
  /** Serializes applySettings so OV probe / native open cannot interleave. */
  let applyChain: Promise<void> = Promise.resolve();

  /** Managed OV sidecar ownership. */
  let managedActive = false;
  let managedEndpoint: string | undefined;
  let installPhase: ContextMemoryInstallPhase | undefined;
  let installProgress: number | undefined;
  let managedAbort: AbortController | null = null;
  let managedRun: Promise<void> = Promise.resolve();
  /** Bumps on every new managed attempt so stale runs cannot apply status. */
  let managedGeneration = 0;

  function isManagedMode(settings: ContextMemorySettings): boolean {
    return settings.backend === "openviking" && !settings.endpoint;
  }

  function ovEndpointOf(settings: ContextMemorySettings): string {
    if (settings.endpoint) return settings.endpoint.replace(/\/$/, "");
    if (managedEndpoint) return managedEndpoint.replace(/\/$/, "");
    return DEFAULT_OV_ENDPOINT.replace(/\/$/, "");
  }

  function dropOvClient(): void {
    ovClient?.resetSession();
    ovClient = null;
    ovBoundApiKey = undefined;
  }

  function ensureOvClient(settings: ContextMemorySettings = appliedSettings): OvClient {
    const endpoint = ovEndpointOf(settings);
    const apiKey = settings.apiKey;
    if (ovClient && ovClient.getEndpoint() === endpoint && ovBoundApiKey === apiKey) {
      return ovClient;
    }
    dropOvClient();
    ovBoundApiKey = apiKey;
    ovClient = createOvClient({
      endpoint,
      apiKey,
      fetchImpl: ovFetch,
    });
    return ovClient;
  }

  function enqueueApply(fn: () => Promise<void>): Promise<void> {
    const run = applyChain.then(fn, fn);
    applyChain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  function summaryFor(status: ContextMemoryStatus): string {
    switch (status) {
      case "off":
        return "Context Memory is off. EnvoyAI works as usual.";
      case "installing": {
        if (installPhase === "download") return "Downloading OpenViking…";
        if (installPhase === "unpack") return "Preparing OpenViking…";
        if (installPhase === "start") return "Starting local memory…";
        if (installPhase === "health") return "Checking OpenViking…";
        return "Setting up Context Memory…";
      }
      case "needs_models":
        return "OpenViking is running but still needs embedding and vision models. EnvoyAI will use the usual memory path until then.";
      case "error":
        return lastError
          ? `Context Memory unavailable: ${lastError}. EnvoyAI will use the usual memory path.`
          : "Context Memory unavailable. EnvoyAI will use the usual memory path.";
      case "ready":
        return lastBackend === "openviking"
          ? managedActive
            ? "Context Memory is ready (OpenViking, managed)."
            : "Context Memory is ready (OpenViking)."
          : "Context Memory is ready.";
      default:
        return "Context Memory status unknown.";
    }
  }

  async function ensureNativeOpen(): Promise<boolean> {
    const ns = normalizeContextMemoryNamespace(appliedSettings.namespace);
    if (store?.ready() && store.namespace === ns) return true;
    try {
      store = createContextMemoryStore(profileDir, { namespace: ns });
      await store.open();
      lastError = undefined;
      return true;
    } catch (err) {
      store = null;
      lastError = err instanceof Error ? err.message : String(err);
      lastStatus = "error";
      return false;
    }
  }

  async function cancelManaged(): Promise<void> {
    managedGeneration++;
    managedAbort?.abort();
    managedAbort = null;
    await managedRun.catch(() => undefined);
    try {
      await managedDriver.stop(managedRoot);
    } catch {
      /* best-effort */
    }
    managedActive = false;
    managedEndpoint = undefined;
    installPhase = undefined;
    installProgress = undefined;
  }

  function applyProbeResult(health: {
    ok: boolean;
    needsModels?: boolean;
    error?: string;
  }): void {
    if (health.needsModels) {
      lastStatus = "needs_models";
      lastError = undefined;
      return;
    }
    if (!health.ok) {
      lastStatus = "error";
      lastError =
        health.error ||
        "OpenViking is not reachable. Start it locally or switch Context Memory to Built-in.";
      return;
    }
    lastStatus = "ready";
    lastError = undefined;
  }

  async function startManagedInstall(force: boolean): Promise<void> {
    if (!force && lastStatus === "installing" && managedActive) return;

    // Stop any in-flight attempt before replacing managedRun (avoids dual installs).
    const prevAbort = managedAbort;
    const prevRun = managedRun;
    prevAbort?.abort();
    await prevRun.catch(() => undefined);

    const ac = new AbortController();
    const generation = ++managedGeneration;
    managedAbort = ac;
    managedActive = true;
    managedEndpoint = undefined;
    dropOvClient();
    lastStatus = "installing";
    lastError = undefined;
    installPhase = "download";
    installProgress = 0;

    managedRun = (async () => {
      try {
        const result = await managedDriver.ensureRunning({
          rootDir: managedRoot,
          signal: ac.signal,
          onProgress: (p) => {
            if (ac.signal.aborted || generation !== managedGeneration) return;
            installPhase = p.phase;
            installProgress = p.progress;
          },
        });
        if (ac.signal.aborted || generation !== managedGeneration) return;
        managedEndpoint = result.endpoint;
        installPhase = "health";
        installProgress = 0.95;
        const client = ensureOvClient(appliedSettings);
        const health = await client.probeReady();
        if (ac.signal.aborted || generation !== managedGeneration) return;
        applyProbeResult(health);
        if (lastStatus === "ready" || lastStatus === "needs_models") {
          installPhase = undefined;
          installProgress = undefined;
        }
      } catch (err) {
        if (ac.signal.aborted || generation !== managedGeneration || isAbortError(err)) {
          return;
        }
        lastStatus = "error";
        lastError =
          err instanceof Error
            ? err.message
            : "Could not set up OpenViking. Try again or use a URL of a server you already run.";
        installPhase = undefined;
        installProgress = undefined;
      }
    })();
  }

  async function probeByo(settings: ContextMemorySettings): Promise<void> {
    store = null;
    // cancelManaged already ran for BYO switches; keep flags clear.
    managedActive = false;
    managedEndpoint = undefined;
    installPhase = undefined;
    installProgress = undefined;
    const client = ensureOvClient(settings);
    const health = await client.probeReady();
    applyProbeResult(health);
  }

  async function reprobeManaged(): Promise<void> {
    if (!managedEndpoint) {
      await startManagedInstall(true);
      return;
    }
    const client = ensureOvClient(appliedSettings);
    const health = await client.probeReady();
    applyProbeResult(health);
    // Process died after Ready — surface error so Retry can reinstall.
    if (lastStatus === "error") {
      managedEndpoint = undefined;
    }
  }

  const backend: ContextMemoryBackend = {
    status(): ContextMemoryStatus {
      return lastStatus;
    },

    snapshot(): ContextMemoryStatusSnapshot {
      return {
        status: lastStatus,
        backend: lastBackend,
        enabled: appliedSettings.enabled === true,
        factCount: store?.ready() ? store.factCount() : undefined,
        lastError,
        summary: summaryFor(lastStatus),
        managed: lastBackend === "openviking" ? managedActive || isManagedMode(appliedSettings) : false,
        installPhase: lastStatus === "installing" ? installPhase : undefined,
        installProgress: lastStatus === "installing" ? installProgress : undefined,
      };
    },

    async applySettings(settings): Promise<void> {
      return enqueueApply(async () => {
        const resolved = resolveContextMemorySettings(settings ?? getSettings());
        appliedSettings = resolved;
        lastBackend = resolved.backend;
        if (resolved.lastError) lastError = resolved.lastError;

        if (!resolved.enabled) {
          await cancelManaged();
          lastStatus = "off";
          lastError = undefined;
          store = null;
          dropOvClient();
          return;
        }

        if (resolved.backend === "openviking") {
          store = null;

          if (!isManagedMode(resolved)) {
            // BYO — cancel any managed sidecar and probe the given URL.
            await cancelManaged();
            await probeByo(resolved);
            return;
          }

          // Managed (blank endpoint).
          if (lastStatus === "installing" && managedActive) {
            return;
          }
          if (
            managedActive &&
            managedEndpoint &&
            (lastStatus === "ready" || lastStatus === "needs_models")
          ) {
            await reprobeManaged();
            return;
          }
          if (managedActive && lastStatus === "error") {
            // Poll/sync must not auto-retry; Settings Retry calls retryManagedInstall.
            return;
          }
          await startManagedInstall(false);
          return;
        }

        await cancelManaged();
        dropOvClient();
        const ok = await ensureNativeOpen();
        lastStatus = ok ? "ready" : "error";
        if (ok) lastError = undefined;
      });
    },

    async retryManagedInstall(): Promise<void> {
      return enqueueApply(async () => {
        const resolved = resolveContextMemorySettings(getSettings());
        appliedSettings = resolved;
        lastBackend = resolved.backend;
        if (!resolved.enabled || resolved.backend !== "openviking") return;
        if (!isManagedMode(resolved)) {
          await cancelManaged();
          await probeByo(resolved);
          return;
        }
        await cancelManaged();
        await startManagedInstall(true);
      });
    },

    async recallForTurn(query: string): Promise<string> {
      if (lastStatus !== "ready") return "";
      try {
        if (lastBackend === "openviking") {
          return await ensureOvClient().searchContext(query);
        }
        if (!store?.ready()) return "";
        return await store.renderContext(query);
      } catch {
        return "";
      }
    },

    async rememberFromTurn(inputTurn): Promise<void> {
      if (lastStatus !== "ready") return;
      try {
        if (lastBackend === "openviking") {
          await ensureOvClient().rememberTurn(inputTurn);
          return;
        }
        if (!store?.ready()) return;
        const heuristic = extractDurableFactsFromTurn(inputTurn);
        let llmFacts: string[] = [];
        if (
          extractFactsWithModel &&
          shouldTryLlmFactExtract({ userText: inputTurn.userText, heuristicFacts: heuristic })
        ) {
          try {
            llmFacts = await extractFactsWithModel(inputTurn);
          } catch {
            llmFacts = [];
          }
        }
        const facts = mergeExtractedFacts(heuristic, llmFacts);
        for (const text of facts) {
          await store.remember({
            text,
            source: llmFacts.includes(text) ? "envoyai-llm" : "envoyai-turn",
            importance: 0.7,
          });
        }
      } catch {
        /* soft-fail */
      }
    },

    async listFacts(): Promise<ContextMemoryFact[]> {
      if (lastStatus !== "ready") return [];
      try {
        if (lastBackend === "openviking") {
          return (await ensureOvClient().listMemories(40)).map(toFact);
        }
        if (!store?.ready()) return [];
        return (await store.listFacts()).map(toFact);
      } catch {
        return [];
      }
    },

    async forget(id: string): Promise<boolean> {
      if (lastStatus !== "ready") return false;
      try {
        if (lastBackend === "openviking") {
          return ensureOvClient().forgetMemory(id);
        }
        if (!store?.ready()) return false;
        return store.forget(id);
      } catch {
        return false;
      }
    },

    async pin(id: string, pinned: boolean): Promise<boolean> {
      if (lastStatus !== "ready") return false;
      try {
        if (lastBackend === "openviking") {
          return ensureOvClient().pinMemory(id, pinned);
        }
        if (!store?.ready()) return false;
        return store.pin(id, pinned);
      } catch {
        return false;
      }
    },

    async maybeSeedMemoryMd(memoryMdPath: string): Promise<{ seeded: boolean; count: number }> {
      const settings = { ...appliedSettings };
      if (lastStatus !== "ready" || lastBackend !== "native") {
        return { seeded: false, count: 0 };
      }
      const ns = normalizeContextMemoryNamespace(settings.namespace);
      const seededMap = { ...(settings.memorySeededAtByNamespace ?? {}) };
      const already =
        typeof seededMap[ns] === "string" ||
        (ns === CONTEXT_MEMORY_DEFAULT_NAMESPACE && typeof settings.memorySeededAt === "string");
      if (already) return { seeded: false, count: 0 };
      if (!store?.ready()) return { seeded: false, count: 0 };
      try {
        const md = await readFile(memoryMdPath, "utf8");
        const lines = parseMemoryMdSeedLines(md);
        let count = 0;
        for (const text of lines) {
          await store.remember({ text, source: "memory-md-seed", importance: 0.55 });
          count++;
        }
        const memorySeededAt = new Date().toISOString();
        seededMap[ns] = memorySeededAt;
        const nextPartial: ContextMemorySettings = {
          ...settings,
          memorySeededAtByNamespace: seededMap,
          ...(ns === CONTEXT_MEMORY_DEFAULT_NAMESPACE ? { memorySeededAt } : {}),
        };
        if (patchSettings) {
          await patchSettings(nextPartial);
        }
        appliedSettings = resolveContextMemorySettings(nextPartial);
        return { seeded: count > 0, count };
      } catch (err) {
        if (isMissingFileError(err)) {
          return { seeded: false, count: 0 };
        }
        return { seeded: false, count: 0 };
      }
    },
  };

  return backend;
}

export function openClawMemoryMdPath(profileDir: string): string {
  return join(profileDir, "openclaw-workspace", "MEMORY.md");
}
