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
import { z } from "zod";
import type { Tool } from "../types.js";
/**
 * The read_file tool. Single required parameter: `path`.
 *
 * **Error handling:** ENOENT, EACCES, EISDIR are caught and
 * returned as `{ content: <message>, isError: true }`. The model
 * can read the error message and try a different path.
 */
export declare const readFileTool: Tool<z.ZodObject<{
    path: z.ZodString;
    maxBytes: z.ZodOptional<z.ZodNumber>;
}>>;
//# sourceMappingURL=read-file.d.ts.map