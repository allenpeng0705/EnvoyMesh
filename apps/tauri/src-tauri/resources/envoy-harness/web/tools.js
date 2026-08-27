/**
 * Phase C / Item 8 — model-facing web tools.
 */
import { z } from "zod";
import { WebError } from "./types.js";
function errResult(err) {
    if (err instanceof WebError) {
        return {
            content: `web error (${err.code}): ${err.message}`,
            isError: true,
        };
    }
    return {
        content: err instanceof Error ? err.message : String(err),
        isError: true,
    };
}
/** Build `web_search` + `web_fetch` tools bound to a runtime. */
export function makeWebTools(runtime) {
    const webSearch = {
        name: "web_search",
        description: "Search the web. Returns sources (url, title, snippet). " +
            "Requires a configured search provider.",
        parameters: z.object({
            query: z.string().describe("Search query"),
            maxResults: z
                .number()
                .int()
                .positive()
                .max(20)
                .optional()
                .describe("Max sources to return (default 5)"),
        }),
        async execute(args, ctx) {
            try {
                const result = await runtime.search({
                    query: args.query,
                    maxResults: args.maxResults ?? 5,
                }, ctx.abortSignal);
                return { content: JSON.stringify(result) };
            }
            catch (err) {
                return errResult(err);
            }
        },
    };
    const webFetch = {
        name: "web_fetch",
        description: "Fetch a URL and return a size-capped text/html body. " +
            "Non-2xx responses are returned as results (not errors).",
        parameters: z.object({
            url: z.string().url().describe("HTTP(S) URL to fetch"),
        }),
        async execute(args, ctx) {
            try {
                const result = await runtime.fetch({ url: args.url }, ctx.abortSignal);
                return { content: JSON.stringify(result) };
            }
            catch (err) {
                return errResult(err);
            }
        },
    };
    return [webSearch, webFetch];
}
/** Register web tools on a tool registry. */
export function registerWebTools(tools, runtime) {
    for (const tool of makeWebTools(runtime)) {
        tools.register(tool);
    }
}
//# sourceMappingURL=tools.js.map