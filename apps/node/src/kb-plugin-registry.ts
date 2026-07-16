/**
 * Phase 44C — Knowledge Base Plugin Registry.
 *
 * In-memory registry for KB plugins with per-plugin JSON config storage
 * in `{profileDir}/plugins/{pluginId}/config.json`.
 *
 * The registry holds:
 * - Registered plugin implementations (from `registerPlugin()`)
 * - Per-plugin status (active / disabled / error)
 * - Per-plugin config (persisted to disk)
 *
 * The metadata bridge in `rag-service.ts` calls `runEnrichMetadata()` after
 * vault reindex to collect plugin-produced metadata.
 */

import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import type {
  KnowledgeBasePlugin,
  KbPluginInfo,
  KbPluginMetadataMap,
  KbPluginStatus,
} from "@envoymesh/api";

// ---------------------------------------------------------------------------
// Per-plugin config file envelope
// ---------------------------------------------------------------------------

interface PluginConfigFile {
  version: 1;
  config: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Internal registry entry
// ---------------------------------------------------------------------------

interface PluginEntry {
  impl: KnowledgeBasePlugin;
  status: KbPluginStatus;
  activatedAt?: string;
  updatedAt: string;
  errorMessage?: string;
}

// ---------------------------------------------------------------------------
// Plugin ID validation
// ---------------------------------------------------------------------------

/**
 * Reject plugin IDs that contain path separators or traversal sequences.
 * Only lowercase alphanumeric, hyphens, and underscores are allowed.
 */
const PLUGIN_ID_RE = /^[a-z0-9_-]+$/;

function assertSafePluginId(pluginId: string): void {
  if (!PLUGIN_ID_RE.test(pluginId)) {
    throw new Error(`invalid plugin id: ${pluginId}`);
  }
}

// ---------------------------------------------------------------------------
// PluginRegistry — public API
// ---------------------------------------------------------------------------

export interface PluginRegistry {
  /** Register a plugin implementation (no-op if already registered). */
  registerPlugin(plugin: KnowledgeBasePlugin): void
  /** Unregister a plugin implementation. Deactivates first if active. */
  unregisterPlugin(pluginId: string): Promise<void>

  /** Activate a registered plugin (calls plugin.activate(), persists config). */
  activatePlugin(pluginId: string, config?: Record<string, unknown>): Promise<{ ok: boolean; reason?: string }>
  /** Deactivate a registered plugin (calls plugin.deactivate()). */
  deactivatePlugin(pluginId: string): Promise<{ ok: boolean; reason?: string }>

  /** List all registered plugins (optionally filtered to active only). */
  listPlugins(activeOnly?: boolean): KbPluginInfo[]

  /** Get a single plugin's info, or undefined if not registered. */
  getPluginInfo(pluginId: string): KbPluginInfo | undefined

  /** Read a plugin's persisted config. Returns empty object when missing. */
  getPluginConfig(pluginId: string): Promise<Record<string, unknown>>
  /** Merge partial config into a plugin's persisted config. */
  updatePluginConfig(pluginId: string, partial: Record<string, unknown>): Promise<{ ok: boolean; reason?: string }>

  /**
   * Run enrichMetadata() on all active plugins and merge results.
   * Errors from individual plugins are caught and logged — they do not
   * propagate to the caller (graceful degradation).
   */
  runEnrichMetadata(documents: Array<{
    documentId: string
    relativePath: string
    title: string
    extension: string
    byteLength: number
  }>): Promise<KbPluginMetadataMap>
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a plugin registry backed by `{profileDir}/plugins/{pluginId}/config.json`.
 */
export function createPluginRegistry(profileDir: string): PluginRegistry {
  const entries = new Map<string, PluginEntry>();

  // ---- config file I/O ----

  function configFilePath(pluginId: string): string {
    assertSafePluginId(pluginId);
    const dir = join(profileDir, "plugins", pluginId);
    // Double-check: resolved path must start with profileDir.
    const resolved = resolve(dir);
    if (!resolved.startsWith(resolve(profileDir) + sep)) {
      throw new Error(`plugin id resolves outside profile dir: ${pluginId}`);
    }
    return join(dir, "config.json");
  }

  async function loadPluginConfig(pluginId: string): Promise<Record<string, unknown>> {
    try {
      const raw = await readFile(configFilePath(pluginId), "utf8")
      const parsed = JSON.parse(raw) as PluginConfigFile
      if (parsed.version !== 1 || typeof parsed.config !== "object" || parsed.config === null) {
        return {}
      }
      return parsed.config
    } catch {
      return {}
    }
  }

  async function writePluginConfig(pluginId: string, config: Record<string, unknown>): Promise<void> {
    const filePath = configFilePath(pluginId)
    await mkdir(dirname(filePath), { recursive: true })
    const tmp = `${filePath}.tmp.${process.pid}`
    await writeFile(tmp, `${JSON.stringify({ version: 1, config }, null, 2)}\n`, { mode: 0o600 })
    await rename(tmp, filePath)
  }

  async function deletePluginConfig(pluginId: string): Promise<void> {
    try {
      await unlink(configFilePath(pluginId))
    } catch {
      // file may not exist
    }
  }

  // ---- entry helpers ----

  function toInfo(pluginId: string, entry: PluginEntry): KbPluginInfo {
    return {
      pluginId,
      displayName: entry.impl.displayName,
      description: entry.impl.description,
      version: entry.impl.version,
      status: entry.status,
      activatedAt: entry.activatedAt,
      updatedAt: entry.updatedAt,
      errorMessage: entry.errorMessage,
    }
  }

  function now(): string {
    return new Date().toISOString()
  }

  // ---- registry implementation ----

  return {
    registerPlugin(plugin: KnowledgeBasePlugin): void {
      assertSafePluginId(plugin.id);
      if (entries.has(plugin.id)) return
      entries.set(plugin.id, {
        impl: plugin,
        status: "registered",
        updatedAt: now(),
      })
    },

    async unregisterPlugin(pluginId: string): Promise<void> {
      const entry = entries.get(pluginId)
      if (!entry) return
      if (entry.status === "active" && entry.impl.deactivate) {
        try {
          await entry.impl.deactivate()
        } catch {
          // best-effort cleanup
        }
      }
      entries.delete(pluginId)
      await deletePluginConfig(pluginId)
    },

    async activatePlugin(pluginId: string, config?: Record<string, unknown>): Promise<{ ok: boolean; reason?: string }> {
      const entry = entries.get(pluginId)
      if (!entry) return { ok: false, reason: `plugin not registered: ${pluginId}` }

      // Merge any incoming config into persisted config.
      if (config && Object.keys(config).length > 0) {
        const existing = await loadPluginConfig(pluginId)
        const merged = { ...existing, ...config }
        await writePluginConfig(pluginId, merged)
      }

      // Call plugin activate hook.
      if (entry.impl.activate) {
        try {
          const persistedConfig = await loadPluginConfig(pluginId)
          const result = await entry.impl.activate(persistedConfig)
          if (!result.ok) {
            entry.status = "error"
            entry.updatedAt = now()
            entry.errorMessage = result.reason
            return { ok: false, reason: result.reason }
          }
        } catch (err) {
          entry.status = "error"
          entry.updatedAt = now()
          entry.errorMessage = err instanceof Error ? err.message : String(err)
          return { ok: false, reason: entry.errorMessage }
        }
      }

      entry.status = "active"
      entry.activatedAt = entry.activatedAt ?? now()
      entry.updatedAt = now()
      entry.errorMessage = undefined
      return { ok: true }
    },

    async deactivatePlugin(pluginId: string): Promise<{ ok: boolean; reason?: string }> {
      const entry = entries.get(pluginId)
      if (!entry) return { ok: false, reason: `plugin not registered: ${pluginId}` }
      if (entry.status !== "active") return { ok: true }

      if (entry.impl.deactivate) {
        try {
          await entry.impl.deactivate()
        } catch (err) {
          // Log but don't block deactivation.
          console.error(`[kb-plugin] deactivate error (${pluginId}):`, err)
        }
      }

      entry.status = "disabled"
      entry.updatedAt = now()
      entry.errorMessage = undefined
      return { ok: true }
    },

    listPlugins(activeOnly?: boolean): KbPluginInfo[] {
      const result: KbPluginInfo[] = []
      for (const [id, entry] of entries) {
        if (activeOnly && entry.status !== "active") continue
        result.push(toInfo(id, entry))
      }
      return result
    },

    getPluginInfo(pluginId: string): KbPluginInfo | undefined {
      const entry = entries.get(pluginId)
      return entry ? toInfo(pluginId, entry) : undefined
    },

    async getPluginConfig(pluginId: string): Promise<Record<string, unknown>> {
      return loadPluginConfig(pluginId)
    },

    async updatePluginConfig(
      pluginId: string,
      partial: Record<string, unknown>,
    ): Promise<{ ok: boolean; reason?: string }> {
      const entry = entries.get(pluginId)
      if (!entry) return { ok: false, reason: `plugin not registered: ${pluginId}` }

      const existing = await loadPluginConfig(pluginId)
      const merged = { ...existing, ...partial }
      await writePluginConfig(pluginId, merged)
      return { ok: true }
    },

    async runEnrichMetadata(documents: Array<{
      documentId: string
      relativePath: string
      title: string
      extension: string
      byteLength: number
    }>): Promise<KbPluginMetadataMap> {
      const merged = new Map<string, Array<{ pluginId: string; key: string; value: string }>>()

      for (const [pluginId, entry] of entries) {
        if (entry.status !== "active" || !entry.impl.enrichMetadata) continue

        try {
          const result = await entry.impl.enrichMetadata(documents)
          for (const [docId, entries_] of result) {
            const existing = merged.get(docId) ?? []
            existing.push(...entries_)
            merged.set(docId, existing)
          }
        } catch (err) {
          // Graceful degradation: log and continue with other plugins.
          console.error(`[kb-plugin] enrichMetadata error (${pluginId}):`, err)
          entry.status = "error"
          entry.updatedAt = now()
          entry.errorMessage = err instanceof Error ? err.message : String(err)
        }
      }

      return merged
    },
  }
}
