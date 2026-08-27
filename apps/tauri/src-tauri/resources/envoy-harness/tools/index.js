/**
 * @envoymesh/envoy-harness — tool system.
 *
 * Public API:
 * - `Tool` (interface) — the contract a tool must satisfy.
 * - `ToolRegistry` (class) — register/lookup tools.
 * - `ToolCall` / `ToolResult` / `ToolContext` — the call/result types.
 * - `Message` / `ContentBlock` / `Role` — the transcript types.
 * - `DuplicateToolError` — the duplicate-registration error.
 *
 * Built-in tools (read-file, bash) live in `./builtin/`. They're
 * optional — a host can choose to use only the registry API and
 * register its own tools.
 */
export { DuplicateToolError, ToolRegistry, } from "./registry.js";
//# sourceMappingURL=index.js.map