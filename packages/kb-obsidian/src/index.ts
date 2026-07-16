/**
 * @envoymesh/kb-obsidian — Obsidian-style knowledge base plugin.
 *
 * Provides:
 * - YAML frontmatter parsing for vault Markdown notes
 * - Wiki-link (`[[target]]`) parsing and bidirectional link graph
 * - `published: true/false` → sensitivity override sync
 * - Sensitivity-aware link resolution for peer queries and agent traversal
 */

// Frontmatter parsing
export {
  parseFrontmatter,
  frontmatterString,
  frontmatterBoolean,
  frontmatterStringArray,
  type FrontmatterValue,
  type ParsedFrontmatter,
} from "./frontmatter.js"

// Wiki-link parsing and graph
export {
  parseWikiLinks,
  stripWikiLinks,
  stripPrivateWikiLinks,
  buildLinkGraph,
  loadLinkGraph,
  saveLinkGraph,
  deleteLinkGraph,
  linkGraphFilePath,
  normalizeWikiTarget,
  resolveLinksForNote,
  getBacklinks,
  type WikiLink,
  type LinkGraphEntry,
  type LinkGraph,
} from "./wiki-links.js"

// Sensitivity-aware link resolution
export {
  isAccessible,
  resolveLinksWithSensitivity,
  resolveBacklinksWithSensitivity,
  filterContentLinks,
  traverseLinks,
  type SensitivityLevel,
  type NoteSensitivityMap,
} from "./link-resolver.js"

// Plugin implementation
export {
  createObsidianPlugin,
  type ObsidianPluginConfig,
  type ObsidianPluginDeps,
  type SensitivitySyncCallback,
  type ReadVaultFileCallback,
} from "./obsidian-plugin.js"
