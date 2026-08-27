/**
 * edit — the targeted-edit built-in tool.
 *
 * **Design doc:** §10.1.
 *
 * **Why a tool (vs `write` for everything):** the
 * `edit` tool is idempotent and re-runnable. The
 * model can declare "replace X with Y" and the
 * tool will fail with a clear error if X doesn't
 * appear (so the model can re-read the file and
 * try again). For `write`, the model has to
 * re-send the entire file content.
 *
 * **The 3 modes (per design):**
 * - `replace`: the default. Replace the first
 *   occurrence of `oldText` with `newText`. Fails
 *   if `oldText` doesn't appear exactly once.
 * - `replaceAll`: replace every occurrence. Fails
 *   if `oldText` doesn't appear at all.
 * - `insertAfter`: insert `newText` after the
 *   first occurrence of `anchor`.
 *
 * **Permission model:** same as `write` (read-only
 * rejects; workspace-write checks `writableRoots`).
 *
 * **Stability:** `path`, `oldText`, `newText` are
 * required. `mode` defaults to `"replace"`. The
 * `all_occurrences` flag is a shortcut for
 * `mode: "replaceAll"`.
 */
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { z } from "zod";
import { policyFromMode } from "../../permissions/policy.js";
/**
 * The edit tool. Three required parameters:
 * `path`, `oldText`, `newText`. One optional:
 * `mode` (default: "replace").
 */
export const editTool = {
    name: "edit",
    description: "Apply a targeted edit to the file at `path`. Three modes: " +
        "'replace' (default; replace the first occurrence of `oldText` with " +
        "`newText`; fails if `oldText` doesn't appear exactly once), " +
        "'replaceAll' (replace every occurrence; fails if zero matches), " +
        "'insertAfter' (insert `newText` after the first occurrence of " +
        "`oldText`; the `newText` may be empty for deletion).",
    parameters: z.object({
        path: z.string().describe("Path to the file, relative to cwd or absolute"),
        oldText: z.string().describe("The text to find (must be unique unless mode='replaceAll')"),
        newText: z.string().describe("The replacement text (may be empty for delete)"),
        mode: z
            .enum(["replace", "replaceAll", "insertAfter"])
            .optional()
            .describe("Edit mode; default is 'replace'"),
    }),
    async execute({ path: filePath, oldText, newText, mode }, ctx) {
        const resolved = path.isAbsolute(filePath)
            ? filePath
            : path.resolve(ctx.cwd, filePath);
        const effectiveMode = mode ?? "replace";
        const policy = ctx.sandboxPolicy ?? policyFromMode("read-only", ctx.cwd);
        // Same permission check as `write`.
        if (policy.mode === "read-only") {
            return {
                content: "permission denied: edit is not allowed in read-only mode",
                isError: true,
            };
        }
        // Same permission check as `write` — empty
        // writableRoots falls back to [ctx.cwd] to match
        // the bash path validator's behavior (so a host
        // that constructs {mode: "workspace-write",
        // writableRoots: []} gets cwd-writes, not
        // blanket denial). See write.ts for the rationale.
        if (policy.mode === "workspace-write") {
            const roots = policy.writableRoots.length > 0
                ? policy.writableRoots
                : [ctx.cwd];
            const allowed = roots.some((root) => {
                const absRoot = path.resolve(root);
                return resolved === absRoot || resolved.startsWith(absRoot + path.sep);
            });
            if (!allowed) {
                return {
                    content: `permission denied: ${resolved} is not under any writable root`,
                    isError: true,
                };
            }
        }
        let original;
        try {
            original = await fs.readFile(resolved, "utf8");
        }
        catch (err) {
            const e = err;
            return {
                content: `edit error: cannot read ${resolved}: ${e.code ?? "UNKNOWN"}: ${e.message}`,
                isError: true,
            };
        }
        let updated;
        try {
            switch (effectiveMode) {
                case "replace": {
                    const occurrences = original.split(oldText).length - 1;
                    if (occurrences !== 1) {
                        return {
                            content: `edit error: oldText appears ${occurrences} times in ${resolved} (expected exactly 1; use mode='replaceAll' to replace every occurrence)`,
                            isError: true,
                        };
                    }
                    updated = original.replace(oldText, newText);
                    break;
                }
                case "replaceAll": {
                    const occurrences = original.split(oldText).length - 1;
                    if (occurrences === 0) {
                        return {
                            content: `edit error: oldText appears 0 times in ${resolved} (no replacements made)`,
                            isError: true,
                        };
                    }
                    updated = original.split(oldText).join(newText);
                    break;
                }
                case "insertAfter": {
                    const idx = original.indexOf(oldText);
                    if (idx < 0) {
                        return {
                            content: `edit error: oldText not found in ${resolved}`,
                            isError: true,
                        };
                    }
                    const insertAt = idx + oldText.length;
                    updated =
                        original.slice(0, insertAt) + newText + original.slice(insertAt);
                    break;
                }
            }
        }
        catch (err) {
            return {
                content: `edit error: ${err.message}`,
                isError: true,
            };
        }
        try {
            if (ctx.recordUndo !== undefined) {
                ctx.recordUndo({ path: resolved, previousContent: original });
            }
            await fs.writeFile(resolved, updated, "utf8");
            return {
                content: `edited ${resolved}`,
            };
        }
        catch (err) {
            const e = err;
            return {
                content: `edit error: cannot write ${resolved}: ${e.code ?? "UNKNOWN"}: ${e.message}`,
                isError: true,
            };
        }
    },
};
//# sourceMappingURL=edit.js.map