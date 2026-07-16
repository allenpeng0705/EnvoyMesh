/**
 * Phase 44E — MCP Knowledge Base Plugin.
 *
 * A registration point for MCP external knowledge in the KB plugin interface.
 *
 * This plugin does NOT enrich vault metadata itself — MCP-sourced notes are
 * identified by `source: mcp` in their YAML frontmatter, which the Obsidian
 * plugin surfaces via its own `enrichMetadata()`.
 *
 * The plugin's purpose is:
 * 1. Make MCP configuration manageable through the plugin interface (activate/deactivate/config)
 * 2. Provide a discoverable entry in `listKbPlugins()` for the Settings UI
 * 3. Serve as the conceptual owner of the `formatMcpResultsAsNote()` write-back
 *    flow in `@envoymesh/rag`
 */

import type {
  KbPluginMetadataMap,
  KnowledgeBasePlugin,
} from "@envoymesh/api"

/**
 * Create the MCP Knowledge KB plugin.
 *
 * Stateless — no activate/deactivate hooks, no enrichMetadata output.
 * The plugin is a registration point for MCP in the KB plugin system.
 */
export function createMcpKnowledgePlugin(): KnowledgeBasePlugin {
  return {
    id: "mcp-knowledge",
    displayName: "MCP Knowledge",
    description: "MCP external knowledge search results, source attribution, and write-back",
    version: "1.0.0",

    async enrichMetadata(): Promise<KbPluginMetadataMap> {
      // MCP metadata enrichment is handled by the Obsidian plugin reading
      // `source: mcp` frontmatter. This plugin is a registration point only.
      return new Map()
    },
  }
}
