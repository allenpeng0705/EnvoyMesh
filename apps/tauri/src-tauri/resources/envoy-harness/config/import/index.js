/**
 * Phase B / Item 15 — config-import public surface.
 *
 * Re-exports the importers. Chunk 15.1 ships the codex
 * importer; chunk 15.2 adds the deepseek `cordis.yml`
 * importer + the Claude Code hooks.json bridge.
 */
export { importCodexConfig, } from "./codex.js";
export { importDeepseekConfig, } from "./deepseek.js";
export { parseClaudeCodeHooks, } from "./claude-code.js";
export { importCursorRules, } from "./cursor.js";
/**
 * The set of `--from <format>` values supported by
 * `loadConfigWithImport` (in `src/config/loader.ts`).
 *
 * **v0.2:** `codex` and `deepseek-cordis`. Future chunks
 * add `auto` (auto-detect by file content).
 */
export const SUPPORTED_IMPORT_FORMATS = [
    "codex",
    "deepseek-cordis",
];
/**
 * Type-guard: is `s` a supported import format?
 *
 * Used by the CLI runner to validate the `--from` flag
 * before dispatching to the importer.
 */
export function isImportFormat(s) {
    return SUPPORTED_IMPORT_FORMATS.includes(s);
}
//# sourceMappingURL=index.js.map