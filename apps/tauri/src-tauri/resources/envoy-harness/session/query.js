/**
 * Phase D / Item 14a — session history search service + tool.
 *
 * Indexes JSONL sessions under a configured directory and
 * exposes pattern / role / tool / time filters. Results are
 * bounded; paths outside the session dir are rejected.
 */
import { z } from "zod";
import { indexSessionDirectory, isPathInside, } from "./indexer.js";
const DEFAULT_LIMIT = 20;
const HARD_LIMIT = 100;
const DEFAULT_SNIPPET = 240;
function clip(text, max) {
    if (text.length <= max)
        return text;
    return text.slice(0, max) + "…";
}
/**
 * Create a {@link SessionQueryService} bound to a session dir.
 * Call {@link SessionQueryService.reindex} before searching
 * (or after new sessions land).
 */
export function createSessionQueryService(options) {
    const dir = options.dir;
    const snippetChars = options.snippetChars ?? DEFAULT_SNIPPET;
    let entries = [];
    return {
        dir,
        async reindex() {
            const result = await indexSessionDirectory({ dir });
            entries = result.entries;
            return { entryCount: entries.length, errors: result.errors };
        },
        search(request) {
            const limit = Math.min(Math.max(1, request.limit ?? DEFAULT_LIMIT), HARD_LIMIT);
            let pattern;
            if (request.pattern !== undefined && request.pattern.length > 0) {
                try {
                    pattern = new RegExp(request.pattern, "i");
                }
                catch {
                    throw new Error(`invalid pattern: ${request.pattern}`);
                }
            }
            const hits = [];
            for (const e of entries) {
                if (!isPathInside(e.filePath, dir))
                    continue;
                if (request.role !== undefined && e.role !== request.role)
                    continue;
                if (request.toolName !== undefined &&
                    !e.toolNames.includes(request.toolName)) {
                    continue;
                }
                if (request.since !== undefined && e.ts !== undefined) {
                    if (e.ts < request.since)
                        continue;
                }
                if (request.until !== undefined && e.ts !== undefined) {
                    if (e.ts > request.until)
                        continue;
                }
                if (pattern !== undefined && !pattern.test(e.text))
                    continue;
                const hit = {
                    sessionId: e.sessionId,
                    messageIndex: e.messageIndex,
                    role: e.role,
                    toolNames: e.toolNames,
                    snippet: clip(e.text, snippetChars),
                };
                if (e.ts !== undefined)
                    hit.ts = e.ts;
                hits.push(hit);
                if (hits.length >= limit)
                    break;
            }
            return hits;
        },
    };
}
/** Build the model-facing `session_query` tool. */
export function makeSessionQueryTool(service) {
    return {
        name: "session_query",
        description: "Search persisted session history under the configured session " +
            "directory (pattern / role / toolName / time range). Results are bounded.",
        parameters: z.object({
            pattern: z.string().optional().describe("Regex (case-insensitive)"),
            role: z
                .enum(["system", "user", "assistant", "tool"])
                .optional()
                .describe("Filter by message role"),
            toolName: z.string().optional().describe("Filter by tool_call name"),
            since: z.string().optional().describe("ISO lower bound"),
            until: z.string().optional().describe("ISO upper bound"),
            limit: z.number().int().positive().optional().describe("Max hits"),
            reindex: z
                .boolean()
                .optional()
                .describe("Re-scan the session directory before searching"),
        }),
        async execute(args) {
            try {
                if (args.reindex === true) {
                    await service.reindex();
                }
                const req = {};
                if (args.pattern !== undefined)
                    req.pattern = args.pattern;
                if (args.role !== undefined)
                    req.role = args.role;
                if (args.toolName !== undefined)
                    req.toolName = args.toolName;
                if (args.since !== undefined)
                    req.since = args.since;
                if (args.until !== undefined)
                    req.until = args.until;
                if (args.limit !== undefined)
                    req.limit = args.limit;
                const hits = service.search(req);
                return { content: JSON.stringify({ hits, dir: service.dir }) };
            }
            catch (err) {
                return {
                    content: err instanceof Error ? err.message : String(err),
                    isError: true,
                };
            }
        },
    };
}
/** Register `session_query` on a tool registry. */
export function registerSessionQueryTool(tools, service) {
    tools.register(makeSessionQueryTool(service));
}
//# sourceMappingURL=query.js.map