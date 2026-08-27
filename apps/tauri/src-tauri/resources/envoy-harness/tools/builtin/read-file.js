/**
 * read_file — the simplest built-in tool.
 *
 * **Design doc:** `docs/design.md` §10.
 *
 * **Why so simple?** read_file is the model's primary input channel.
 * Making it the canonical "does this harness even work" tool keeps
 * the surface small. If you can read a file, the agent loop is
 * functional.
 *
 * **Permission model:** read is allowed in all three permission
 * modes (`read-only`, `workspace-write`, `danger-full-access`).
 * The model can read in any session.
 *
 * **Path resolution:** paths are resolved against `ctx.cwd`.
 * Absolute paths in the args bypass cwd. Symlinks are followed
 * (Node's default `fs.readFile` behavior).
 *
 * **Stability:** the `path` parameter is required. Output is a
 * UTF-8 string; binary files are not supported (the model would
 * see garbled text and likely fail to plan). A future chunk can
 * add a `binary: boolean` option if needed.
 */
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { z } from "zod";
/**
 * The read_file tool. Single required parameter: `path`.
 *
 * **Error handling:** ENOENT, EACCES, EISDIR are caught and
 * returned as `{ content: <message>, isError: true }`. The model
 * can read the error message and try a different path.
 */
export const readFileTool = {
    name: "read_file",
    description: "Read the contents of a file at `path` (relative to cwd or absolute). " +
        "Returns the file contents as a UTF-8 string. Use `maxBytes` to cap " +
        "the size for very large files (default: 1 MB).",
    parameters: z.object({
        path: z.string().describe("Path to the file, relative to cwd or absolute"),
        maxBytes: z
            .number()
            .int()
            .positive()
            .optional()
            .describe("Maximum bytes to read. Defaults to 1 MB. Larger files are truncated."),
    }),
    async execute({ path: filePath, maxBytes }, ctx) {
        const resolved = path.isAbsolute(filePath)
            ? filePath
            : path.resolve(ctx.cwd, filePath);
        const cap = maxBytes ?? 1024 * 1024; // 1 MB default
        try {
            const buf = await fs.readFile(resolved);
            const truncated = buf.byteLength > cap;
            const slice = truncated ? buf.subarray(0, cap) : buf;
            const content = slice.toString("utf8");
            if (truncated) {
                return {
                    content: content +
                        `\n\n[truncated at ${cap} bytes; full size is ${buf.byteLength} bytes]`,
                };
            }
            return { content };
        }
        catch (err) {
            const e = err;
            return {
                content: `read_file error: ${e.code ?? "UNKNOWN"}: ${e.message}`,
                isError: true,
            };
        }
    },
};
//# sourceMappingURL=read-file.js.map