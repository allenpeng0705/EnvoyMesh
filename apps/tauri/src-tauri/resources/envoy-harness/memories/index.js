/**
 * Phase A / Item 2 — public surface for the memory
 * subsystem. Re-exported by the package entry point.
 */
export { LocalMemoryStore, estimateMemoryTokens, parseMemoryFile, serializeMemoryFile, } from "./store.js";
export { parseCitation, renderCitation, slugify, } from "./citations.js";
export { buildMemoryIndex, buildIndexFragment, buildMemoryFragment, } from "./inject.js";
export { consolidateMemories, hashMemoryBody, } from "./consolidate.js";
//# sourceMappingURL=index.js.map