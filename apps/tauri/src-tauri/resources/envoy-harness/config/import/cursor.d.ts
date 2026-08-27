/**
 * Cursor rules import — `.cursor/rules/*.mdc` and `*.md`.
 *
 * Maps Cursor rule files into envoy system-prompt fragments
 * (same seam as codex memories / AGENTS.md).
 */
export interface CursorRulesImportResult {
    /** Concatenated rule bodies for injection. */
    rulesText: string;
    /** Paths that were read. */
    files: string[];
}
/**
 * Import Cursor rules from a project directory.
 * Looks for `.cursor/rules/` under `projectRoot`.
 */
export declare function importCursorRules(projectRoot: string): Promise<CursorRulesImportResult>;
//# sourceMappingURL=cursor.d.ts.map