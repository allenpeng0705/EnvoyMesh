/**
 * Phase A / Item 2 — public surface for the memory
 * subsystem. Re-exported by the package entry point.
 */
export { LocalMemoryStore, estimateMemoryTokens, parseMemoryFile, serializeMemoryFile, type LocalMemoryStoreOptions, type Memory, type MemoryMeta, type MemoryStore, } from "./store.js";
export { parseCitation, renderCitation, slugify, type MemoryCitation, } from "./citations.js";
export { buildMemoryIndex, buildIndexFragment, buildMemoryFragment, } from "./inject.js";
export { consolidateMemories, hashMemoryBody, type ConsolidateOptions, type ConsolidateResult, } from "./consolidate.js";
//# sourceMappingURL=index.d.ts.map