/**
 * Ext-agent contract — the small surface shared by the node core and the
 * harness layer.
 *
 * ## Why these six symbols live in `protocol`
 *
 * They were declared in `@envoymesh/api/src/ext-agent.ts`, which is the product's
 * contract package: importing **any** symbol from it makes a module
 * `product-bound` under §3's third condition, because `@envoymesh/api` exports
 * the whole 436-method node surface (E9). That is exactly what happened to
 * `@envoymesh/node-core`: it re-exported `home-fs.ts` and `mmx-media-slash.ts`,
 * which needed four types and two values from `api`, so the *package* was
 * product-bound — and therefore unusable by any `reusable` module, including
 * every host module.
 *
 * The dependency was never the interesting part. This module holds the part a
 * shared core legitimately needs:
 *
 * | Symbol | Needed by |
 * |---|---|
 * | {@link ExtAgentCommandDescriptor}, {@link ExtAgentCommandIntercept} | `node-core/mmx-media-slash` (slash descriptors) |
 * | {@link EXT_AGENTS_WITH_PROJECT_PATH}, {@link extAgentUsesProjectPath} | `node-core/home-fs` (which agents take a cwd) |
 * | {@link PreviewHomeFsFileParams}, {@link PreviewHomeFsFileResult}, {@link HomeFsPreviewKind} | `node-core/home-fs` (the folder-preview payloads) |
 *
 * `protocol` is the right home rather than a new package: it already carries the
 * repo's dep-free domain contracts (`market.ts`, `agent-network.ts`,
 * `agent-adapter.ts`), it is in the classifier's declared core set, and it has no
 * dependency of its own — so nothing can be re-tainted by this move.
 * `@envoymesh/api` re-exports every symbol below, so no importer changed.
 */

/**
 * How EnvoyMesh treats one slash command typed into Ext Agent chat.
 *
 * - `envoy` — handled by EnvoyMesh UI/node (never sent as chat text)
 * - `forward` — sent as plain text to `backend.ask()` (agent may honor it)
 * - `hybrid` — Envoy may apply local side effects and/or forward
 */
export type ExtAgentCommandIntercept = "envoy" | "forward" | "hybrid";

/** One slash command shown in Ext Agent chat autocomplete. */
export interface ExtAgentCommandDescriptor {
  /** Full slash token including leading `/`, e.g. `/model`. */
  slash: string;
  /** Short human summary for the suggestion row. */
  summary: string;
  /** Optional args hint, e.g. `"<name> | list"`. */
  argsHint?: string;
  intercept: ExtAgentCommandIntercept;
  source: "static" | "dynamic";
}

/** Agents that honor `ExtAgentDefinition.projectPath` as cwd. */
export const EXT_AGENTS_WITH_PROJECT_PATH = [
  "codex",
  "claudecode",
  "cursor",
  "aider",
  "mmx",
  "opencode",
  "codewhale",
  "hermes",
  "openhuman",
] as const;

export function extAgentUsesProjectPath(agentId: string | undefined | null): boolean {
  const id = agentId?.trim().toLowerCase() ?? "";
  return (EXT_AGENTS_WITH_PROJECT_PATH as readonly string[]).includes(id);
}

/** Params for previewing one file from the home node's filesystem. */
export interface PreviewHomeFsFileParams {
  /** Absolute file path on the home node. */
  path: string;
}

export type HomeFsPreviewKind =
  | "image"
  | "pdf"
  | "html"
  | "markdown"
  | "text"
  | "office"
  | "unsupported"
  | "error";

export interface PreviewHomeFsFileResult {
  path: string;
  title: string;
  kind: HomeFsPreviewKind;
  mediaType?: string;
  /** Sanitized HTML document fragment/body for WebView. */
  html?: string;
  /** Plain text when html is not used. */
  text?: string;
  /** Base64 payload for binary previews (image/pdf). */
  contentBase64?: string;
  /** Human-readable error when kind is error/unsupported. */
  error?: string;
  byteLength?: number;
}
