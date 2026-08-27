/**
 * Cursor rules import — `.cursor/rules/*.mdc` and `*.md`.
 *
 * Maps Cursor rule files into envoy system-prompt fragments
 * (same seam as codex memories / AGENTS.md).
 */
import { promises as fs } from "node:fs";
import * as path from "node:path";
async function collectRuleFiles(rulesDir) {
    const entries = await fs.readdir(rulesDir, { withFileTypes: true });
    const files = [];
    for (const e of entries) {
        if (!e.isFile())
            continue;
        if (e.name.endsWith(".mdc") || e.name.endsWith(".md")) {
            files.push(path.join(rulesDir, e.name));
        }
    }
    return files.sort();
}
function stripMdcFrontmatter(text) {
    if (!text.startsWith("---"))
        return text;
    const end = text.indexOf("\n---", 3);
    if (end < 0)
        return text;
    return text.slice(end + 4).trimStart();
}
/**
 * Import Cursor rules from a project directory.
 * Looks for `.cursor/rules/` under `projectRoot`.
 */
export async function importCursorRules(projectRoot) {
    const rulesDir = path.join(projectRoot, ".cursor", "rules");
    try {
        await fs.access(rulesDir);
    }
    catch {
        return { rulesText: "", files: [] };
    }
    const files = await collectRuleFiles(rulesDir);
    const parts = [];
    for (const file of files) {
        const raw = await fs.readFile(file, "utf8");
        const body = file.endsWith(".mdc")
            ? stripMdcFrontmatter(raw)
            : raw.trim();
        if (body.length > 0) {
            parts.push(`## ${path.basename(file)}\n${body}`);
        }
    }
    return {
        rulesText: parts.join("\n\n"),
        files,
    };
}
//# sourceMappingURL=cursor.js.map