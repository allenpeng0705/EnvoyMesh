/**
 * Phase 70 — NodeService Context Memory helpers (status / list / forget / pin).
 */
import type {
  ContextMemoryFact,
  ContextMemorySettings,
  ContextMemoryStatusSnapshot,
} from "@envoymesh/api";
import { normalizeAiSettings, resolveContextMemorySettings } from "@envoymesh/api";
import {
  createContextMemoryRuntime,
  openClawMemoryMdPath,
  type ContextMemoryBackend,
  type ContextMemoryModelExtract,
} from "./context-memory-runtime.js";
import { createAuditEvent } from "@envoymesh/local-store";

export type ContextMemoryHost = {
  _profileDir: string;
  getNodeConfig(): Promise<{ aiSettings?: import("@envoymesh/api").AiSettings }>;
  /** Narrow persist for CM fields — should not re-enter full CM sync. */
  persistContextMemorySettings?: (partial: ContextMemorySettings) => Promise<void>;
  updateNodeConfig(config: {
    aiSettings?: import("@envoymesh/api").AiSettings;
  }): Promise<void>;
  _appendAuditEvent?: (event: ReturnType<typeof createAuditEvent>) => Promise<void>;
  /** Optional LLM extract for durable facts (native path). */
  extractContextMemoryFacts?: ContextMemoryModelExtract;
  _contextMemoryRuntime?: ContextMemoryBackend | null;
  _contextMemorySyncPromise?: Promise<void> | null;
  _contextMemorySkipResync?: boolean;
  /** True when sync was requested while another sync was in flight. */
  _contextMemorySyncDirty?: boolean;
};

export function getOrCreateContextMemoryRuntime(host: ContextMemoryHost): ContextMemoryBackend {
  if (host._contextMemoryRuntime) return host._contextMemoryRuntime;
  let cachedSettings: ContextMemorySettings = resolveContextMemorySettings(undefined);
  const runtime = createContextMemoryRuntime({
    profileDir: host._profileDir,
    getSettings: () => cachedSettings,
    extractFactsWithModel: host.extractContextMemoryFacts
      ? (input) => host.extractContextMemoryFacts!(input)
      : undefined,
    patchSettings: async (partial) => {
      cachedSettings = resolveContextMemorySettings({ ...cachedSettings, ...partial });
      const finishSkip = () => {
        host._contextMemorySkipResync = false;
        // A sync may have been requested while we were writing — run once more.
        if (host._contextMemorySyncDirty) {
          void syncContextMemoryFromConfig(host).catch(() => {});
        }
      };
      if (host.persistContextMemorySettings) {
        host._contextMemorySkipResync = true;
        try {
          await host.persistContextMemorySettings(partial);
        } finally {
          finishSkip();
        }
        return;
      }
      const cfg = await host.getNodeConfig();
      const ai = normalizeAiSettings(cfg.aiSettings);
      const nextCm = resolveContextMemorySettings({
        ...ai.contextMemory,
        ...partial,
      });
      host._contextMemorySkipResync = true;
      try {
        await host.updateNodeConfig({
          aiSettings: { ...ai, contextMemory: nextCm },
        });
      } finally {
        finishSkip();
      }
    },
  });
  // Keep cachedSettings updated whenever sync applies config.
  const origApply = runtime.applySettings.bind(runtime);
  runtime.applySettings = async (settings) => {
    cachedSettings = resolveContextMemorySettings(settings);
    await origApply(settings);
  };
  host._contextMemoryRuntime = runtime;
  return runtime;
}

/** Single-flight sync so OpenClaw turns / Settings RPCs do not double-seed.
 *  Concurrent callers coalesce; if config changes mid-flight, one more pass runs. */
export async function syncContextMemoryFromConfig(host: ContextMemoryHost): Promise<void> {
  for (;;) {
    // During seed/persist skip: wait for in-flight work and mark dirty so a
    // follow-up pass applies the latest config once skip clears.
    if (host._contextMemorySkipResync) {
      host._contextMemorySyncDirty = true;
      if (host._contextMemorySyncPromise) {
        await host._contextMemorySyncPromise;
      }
      return;
    }
    host._contextMemorySyncDirty = true;
    if (host._contextMemorySyncPromise) {
      await host._contextMemorySyncPromise;
      if (host._contextMemorySkipResync || !host._contextMemorySyncDirty) return;
      continue;
    }
    host._contextMemorySyncPromise = (async () => {
      while (host._contextMemorySyncDirty && !host._contextMemorySkipResync) {
        host._contextMemorySyncDirty = false;
        const runtime = getOrCreateContextMemoryRuntime(host);
        const cfg = await host.getNodeConfig();
        const cm = normalizeAiSettings(cfg.aiSettings).contextMemory;
        await runtime.applySettings(cm);
        if (runtime.status() === "ready") {
          const seed = await runtime.maybeSeedMemoryMd(openClawMemoryMdPath(host._profileDir));
          if (seed.seeded && host._appendAuditEvent) {
            await host._appendAuditEvent(
              createAuditEvent({
                type: "context_memory.seed",
                outcome: "record",
                summary: `Seeded ${seed.count} facts from MEMORY.md`,
              }),
            );
          }
        }
      }
    })();
    try {
      await host._contextMemorySyncPromise;
    } finally {
      host._contextMemorySyncPromise = null;
    }
    if (host._contextMemorySkipResync || !host._contextMemorySyncDirty) return;
  }
}

export async function getContextMemoryStatusViaRuntime(
  host: ContextMemoryHost,
): Promise<ContextMemoryStatusSnapshot> {
  await syncContextMemoryFromConfig(host);
  return getOrCreateContextMemoryRuntime(host).snapshot();
}

export async function listContextMemoryFactsViaRuntime(
  host: ContextMemoryHost,
): Promise<ContextMemoryFact[]> {
  await syncContextMemoryFromConfig(host);
  return getOrCreateContextMemoryRuntime(host).listFacts();
}

export async function forgetContextMemoryFactViaRuntime(
  host: ContextMemoryHost,
  id: string,
): Promise<boolean> {
  await syncContextMemoryFromConfig(host);
  const ok = await getOrCreateContextMemoryRuntime(host).forget(id);
  if (ok && host._appendAuditEvent) {
    await host._appendAuditEvent(
      createAuditEvent({
        type: "context_memory.forget",
        outcome: "record",
        summary: `Forgot context memory fact ${id.slice(0, 8)}`,
      }),
    );
  }
  return ok;
}

export async function pinContextMemoryFactViaRuntime(
  host: ContextMemoryHost,
  id: string,
  pinned: boolean,
): Promise<boolean> {
  await syncContextMemoryFromConfig(host);
  const ok = await getOrCreateContextMemoryRuntime(host).pin(id, pinned);
  if (ok && host._appendAuditEvent) {
    await host._appendAuditEvent(
      createAuditEvent({
        type: "context_memory.pin",
        outcome: "record",
        summary: pinned
          ? `Pinned context memory fact ${id.slice(0, 8)}`
          : `Unpinned context memory fact ${id.slice(0, 8)}`,
      }),
    );
  }
  return ok;
}

/** Settings Retry — force managed OpenViking reinstall/start (no-op for native/BYO). */
export async function retryContextMemoryInstallViaRuntime(
  host: ContextMemoryHost,
): Promise<import("@envoymesh/api").ContextMemoryStatusSnapshot> {
  // Refresh cached settings from disk first so Retry matches current UI config.
  await syncContextMemoryFromConfig(host);
  const runtime = getOrCreateContextMemoryRuntime(host);
  await runtime.retryManagedInstall();
  // Let the installing snapshot surface immediately; do not await full install.
  return runtime.snapshot();
}

/** Await sync then return CM handle for OpenClaw (never null when enabled+Ready). */
export async function ensureContextMemoryForOpenClaw(host: ContextMemoryHost): Promise<{
  status: () => string;
  recallForTurn: (query: string) => Promise<string>;
  rememberFromTurn: (input: {
    userText: string;
    assistantText?: string;
  }) => Promise<void>;
} | null> {
  await syncContextMemoryFromConfig(host);
  const runtime = host._contextMemoryRuntime;
  if (!runtime) return null;
  return {
    status: () => runtime.status(),
    recallForTurn: (q) => runtime.recallForTurn(q),
    rememberFromTurn: (input) => runtime.rememberFromTurn(input),
  };
}

/** @deprecated Prefer ensureContextMemoryForOpenClaw (async). */
export function contextMemoryForOpenClaw(host: ContextMemoryHost): {
  status: () => string;
  recallForTurn: (query: string) => Promise<string>;
  rememberFromTurn: (input: {
    userText: string;
    assistantText?: string;
  }) => Promise<void>;
} | null {
  const runtime = host._contextMemoryRuntime;
  if (!runtime) return null;
  return {
    status: () => runtime.status(),
    recallForTurn: (q) => runtime.recallForTurn(q),
    rememberFromTurn: (input) => runtime.rememberFromTurn(input),
  };
}

export type { ContextMemorySettings };
