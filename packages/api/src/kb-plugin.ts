/**
 * Phase 44C — Knowledge Base Plugin interface.
 *
 * A KB plugin is an optional extension that enriches the vault knowledge base.
 * Examples: Obsidian frontmatter sync, MCP write-back, YAML link graph.
 *
 * Plugins are registered at runtime, activated/deactivated via RPC, and
 * their `enrichMetadata()` results are merged into vault search results
 * by the RAG metadata bridge.
 *
 * Storage: `{profileDir}/plugins/{pluginId}/config.json` (per-plugin config).
 * Registry: in-memory `PluginRegistry` in `apps/node/src/kb-plugin-registry.ts`.
 */

// ---------------------------------------------------------------------------
// Plugin lifecycle status
// ---------------------------------------------------------------------------

export type KbPluginStatus = "registered" | "active" | "disabled" | "error";

// ---------------------------------------------------------------------------
// Plugin descriptor — returned by listPlugins()
// ---------------------------------------------------------------------------

export interface KbPluginInfo {
  /** Stable identifier (e.g. "obsidian", "mcp-writeback"). */
  pluginId: string
  /** Human-readable name for the Settings UI. */
  displayName: string
  /** One-line description. */
  description: string
  /** Semantic version of the plugin implementation. */
  version: string
  /** Current lifecycle status. */
  status: KbPluginStatus
  /** ISO 8601 timestamp when the plugin was first activated, or undefined. */
  activatedAt?: string
  /** ISO 8601 timestamp of last status change. */
  updatedAt: string
  /** Human-readable error message when status is "error". */
  errorMessage?: string
}

// ---------------------------------------------------------------------------
// Metadata enrichment — plugin output merged into search results
// ---------------------------------------------------------------------------

/**
 * Extra metadata a plugin can attach to a vault document.
 * Merged into `LibraryItem` and `VaultSearchResult` contexts by the
 * metadata bridge in `node-service-fileshare.ts`.
 */
export interface KbPluginMetadataEntry {
  /** The plugin that produced this entry. */
  pluginId: string
  /** Machine-readable key (e.g. "frontmatter:tags", "obsidian:links"). */
  key: string
  /** String value — callers parse as needed (JSON, comma-list, etc.). */
  value: string
}

/**
 * Map of `documentId → metadata entries[]` produced by a plugin
 * during `enrichMetadata()`.
 */
export type KbPluginMetadataMap = Map<string, KbPluginMetadataEntry[]>;

// ---------------------------------------------------------------------------
// Core plugin interface — implemented by each plugin module
// ---------------------------------------------------------------------------

/**
 * Lifecycle hook called when the plugin is activated.
 * Use this to validate config, open file handles, etc.
 * Return `{ ok: true }` on success or `{ ok: false, reason }` on failure.
 */
export type KbPluginActivateResult =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * A knowledge-base plugin.
 *
 * Plugins are stateless functions — the registry holds any per-plugin
 * config and passes it via `getConfig()`.
 */
export interface KnowledgeBasePlugin {
  /** Stable identifier (must match the key used to register the plugin). */
  readonly id: string
  /** Human-readable name. */
  readonly displayName: string
  /** One-line description. */
  readonly description: string
  /** Semantic version. */
  readonly version: string

  /**
   * Called when the plugin is activated. May validate config or prepare state.
   * Return `{ ok: false, reason }` to reject activation.
   */
  activate?(config: Record<string, unknown>): Promise<KbPluginActivateResult>

  /**
   * Called when the plugin is deactivated. Clean up resources.
   */
  deactivate?(): Promise<void>

  /**
   * Enrich vault document metadata.
   *
   * Called by the metadata bridge during vault reindex or on-demand.
   * The plugin receives document metadata and returns per-document
   * metadata entries. Errors are caught and logged — they must not
   * propagate to the caller (graceful degradation).
   *
   * @param documents — all documents in the current vault index
   * @returns map of documentId → metadata entries (may be empty)
   */
  enrichMetadata?(documents: Array<{
    documentId: string
    relativePath: string
    title: string
    extension: string
    byteLength: number
  }>): Promise<KbPluginMetadataMap>
}

// ---------------------------------------------------------------------------
// RPC params / results (used by NodeService)
// ---------------------------------------------------------------------------

export interface ListKbPluginsParams {
  /** When true, only return active plugins. Default: false (all). */
  activeOnly?: boolean
}

export interface UpdateKbPluginConfigParams {
  pluginId: string
  /** Merged into the existing per-plugin config (not a full replacement). */
  config: Record<string, unknown>
}

export interface ActivateKbPluginParams {
  pluginId: string
  /** Optional initial config (merged into any existing config). */
  config?: Record<string, unknown>
}

export interface DeactivateKbPluginParams {
  pluginId: string
}
