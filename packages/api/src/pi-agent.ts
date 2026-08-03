/**
 * Phase 49 — Pi (built-in local coding agent) types.
 *
 * Pi (https://github.com/earendil-works/pi) runs as a child process in
 * RPC mode (`pi --mode rpc`) communicating over stdin/stdout JSON Lines.
 * These types model the wire protocol + the EnvoyMesh-facing RPC surface.
 *
 * Design: see docs/pi-integration-design.md. Pi is local-only — it has
 * NO access to mesh.* tools (OpenClaw stays the sole network boundary
 * per AGENTS.md:213). Tool calls (file/bash) flow through the existing
 * TerminalCommandProposal confirm flow (Phase 30).
 */

import type { TerminalAutoRunPolicy } from "./terminal-agent.js"

// ---------------------------------------------------------------------------
// RPC wire-protocol types (JSONL over stdin/stdout)
// ---------------------------------------------------------------------------
// Pi's RPC protocol (from packages/coding-agent/docs/rpc.md):
//   - Commands (stdin):    {"id","type","message"} or {"type": "set_model", ...}
//   - Responses (stdout):  {"id","type":"response","command","success"[,"error"]}
//   - Events (stdout):     {"type":"<event_name>", ...} — streaming, unsolicited
//   - UI requests/responses: tool-approval sub-protocol, see PiUiRequest/Response
// See docs/pi-integration-design.md §5 for how model config maps to these.

/** Discriminator for commands EnvoyMesh sends to Pi over stdin. */
export type PiCommandType =
  | "prompt" // send a user message
  | "set_model" // switch model mid-session
  | "cancel" // interrupt the current turn (legacy alias)
  | "abort"; // interrupt the current turn (Pi RPC name)

/** A command EnvoyMesh sends to Pi. `id` correlates the acceptance response. */
export interface PiCommand {
  id: string
  type: PiCommandType
  /** Present for "prompt" — the user's text. */
  message?: string
  /** Present for "prompt" with images — base64-encoded attachments. */
  images?: PiImageAttachment[]
  /**
   * Present for "prompt" while Pi is already streaming — queue as steer
   * (interrupt) or followUp (run after current turn). Required by Pi when
   * `isStreaming` is true; omit when idle.
   */
  streamingBehavior?: "steer" | "followUp"
  /** Present for "set_model" — provider/model spec, e.g. "anthropic/claude-...". */
  model?: string
}

export interface PiImageAttachment {
  type: "image"
  /** Base64-encoded image bytes (no data: prefix). */
  data: string
  mimeType: "image/png" | "image/jpeg" | "image/gif" | "image/webp"
}

/** Pi's response acknowledging (or rejecting) a command. */
export interface PiResponse {
  id: string
  type: "response"
  command: PiCommandType
  success: boolean
  /** Present when success === false. */
  error?: string
}

// ---------------------------------------------------------------------------
// Events Pi emits over stdout (streaming, unsolicited)
// ---------------------------------------------------------------------------

export type PiEventType =
  | "agent_start"
  | "agent_end"
  | "agent_settled"
  | "turn_start"
  | "turn_end"
  | "message_start"
  | "message_update"
  | "message_end"
  | "tool_execution_start"
  | "tool_execution_update"
  | "tool_execution_end"
  | "extension_ui_request"
  | "extension_error"
  | "auto_retry_start"
  | "auto_retry_end"

/** Discriminated union of Pi events. Unknown event types fall through as `PiUnknownEvent`. */
export type PiEvent =
  | PiAgentEvent
  | PiMessageEvent
  | PiToolExecutionEvent
  | PiExtensionUiRequest
  | PiExtensionErrorEvent
  | PiUnknownEvent

interface PiAgentEvent {
  type: "agent_start" | "agent_end" | "agent_settled" | "turn_start" | "turn_end"
  /** Present on agent_end — full turn messages (fallback when text_delta is missing). */
  messages?: unknown[]
  /** Present on turn_end — the assistant message for that turn. */
  message?: unknown
}

interface PiMessageEvent {
  type: "message_start" | "message_update" | "message_end"
  /** Present on message_start / message_update / message_end. */
  message?: unknown
  /** Present on message_update — incremental deltas (text, tool calls, etc.). */
  assistantMessageEvent?: PiAssistantMessageEvent
}

/** Sub-event inside a message_update. Only the shapes we care about are typed. */
export type PiAssistantMessageEvent =
  | { type: "text_delta"; contentIndex: number; delta: string; partial?: unknown }
  | { type: "text_end"; contentIndex: number; content?: string; partial?: unknown }
  | { type: "tool_use_start"; contentIndex: number; toolName: string; input?: unknown }
  | { type: "toolcall_start"; contentIndex: number; partial?: unknown }
  | { type: "tool_use_end"; contentIndex: number }
  | { type: "thinking_delta"; delta: string }
  | { type: "done"; message?: unknown }
  | { type: "error"; message?: string; error?: unknown }

interface PiToolExecutionEvent {
  type: "tool_execution_start" | "tool_execution_update" | "tool_execution_end"
  /** Tool-call ID (correlates with the tool_use message event). */
  toolCallId?: string
  /** Tool name, e.g. "bash", "read", "write", "edit". */
  toolName?: string
  /** Present on tool_execution_end — the tool's output. */
  output?: string
  /** Present on tool_execution_end — did the tool succeed? */
  success?: boolean
}

/**
 * Tool-approval sub-protocol. When Pi wants to run a tool that requires
 * confirmation (e.g. a destructive bash command), it emits this request
 * and BLOCKS until EnvoyMesh responds with a matching
 * {@link PiExtensionUiResponse} on stdin. If no response arrives within
 * `timeout` ms, Pi proceeds with its default behavior (usually skip).
 *
 * In Phase 49D, these become TerminalCommandProposals in the UI; the
 * user's confirm/deny decision is sent back as PiExtensionUiResponse.
 */
export interface PiExtensionUiRequest {
  type: "extension_ui_request"
  id: string
  method: "confirm"
  title: string
  message: string
  timeout: number
}

/** EnvoyMesh's response to an extension_ui_request (sent over stdin). */
export interface PiExtensionUiResponse {
  type: "extension_ui_response"
  /** Matches the request id. */
  id: string
  /** true = allow the action; false = deny (Pi skips the tool call). */
  confirmed: boolean
}

interface PiExtensionErrorEvent {
  type: "extension_error"
  message: string
  /** Optional stack/source location for diagnostics. */
  source?: string
}

/** Catch-all for event types we don't model yet. Forwarded verbatim to subscribers. */
export interface PiUnknownEvent {
  type: string
  [key: string]: unknown
}

// ---------------------------------------------------------------------------
// EnvoyMesh-facing runtime + status types
// ---------------------------------------------------------------------------

/** Pi runtime states (mirrors OpenClawStatus for consistency). */
export type PiRuntimeState =
  | "disabled" // piEnabled === false (config)
  | "not-installed" // sidecar missing (slim build or fetch failed)
  | "starting" // spawn issued, awaiting readiness
  | "ready" // child process responding to pings
  | "error" // last spawn attempt failed
  | "stopped" // explicitly stopped (shutdown)

export interface PiStatus {
  /** Whether Pi is enabled in config (independent of whether it's installed). */
  enabled: boolean
  /** Runtime state of the child process. */
  state: PiRuntimeState
  /** Path to the bundled Pi CLI, when discovered. */
  piCliPath?: string
  /** Pinned upstream version, when known. */
  piVersion?: string
  /** Provider/model spec currently configured, e.g. "anthropic/claude-...". */
  modelSpec?: string
  /** Whether the model is inherited from EnvoyMesh vs overridden per-session. */
  modelInherited: boolean
  /** Error message if state === "error". */
  error?: string
  /** Process PID when running. */
  pid?: number
}

/** Result of a one-shot prompt (collected from streaming events). */
export interface PiPromptResult {
  /** The full assistant text response. */
  text: string
  /** Model that produced the response. */
  model?: string
  /** Number of tool calls made during the turn. */
  toolCallCount: number
  /** Whether the turn was cancelled before completion. */
  cancelled: boolean
}

/** EnvoyMesh-style modes allowed for a Pi-only model override. */
export type PiModelOverrideMode =
  | "openai-compatible"
  | "anthropic-compatible"
  | "ollama"
  | "litellm"

/**
 * Pi-only model override (clear = inherit EnvoyMesh Settings → AI).
 * Prefer Pi-native `provider` (e.g. minimax-cn). `mode` is legacy
 * EnvoyMesh-style and still resolved at spawn for older configs.
 */
export interface PiModelOverride {
  /** Pi CLI `--provider` id (preferred). */
  provider?: string
  /**
   * @deprecated Prefer `provider`. Kept so older node-config still loads.
   */
  mode?: PiModelOverrideMode
  model: string
  endpoint?: string
  apiKey?: string
}

/**
 * Persisted Pi agent settings (Phase 49). Stored under
 * PersistedNodeConfig.piSettings. All fields optional — defaults are
 * applied in node-service-config.ts.
 */
export interface PiSettings {
  /**
   * When safe proposals may auto-execute. Default: "always-confirm" (every
   * tool call surfaces as a confirmable TerminalCommandProposal). "off" is
   * the opt-in trust mode for power users (Pi runs freely, no confirms).
   */
  autoRunPolicy?: TerminalAutoRunPolicy
  /**
   * Pi-only model override. When unset, Pi inherits EnvoyMesh's
   * ModelProviderConfig. Does not affect OpenClaw / Hermes / OpenHuman.
   */
  modelOverride?: PiModelOverride
  /**
   * Optional cwd allowlist for Pi file operations. When set, Pi file
   * tools are restricted to paths under one of these roots. Empty/undefined
   * = no restriction (Pi can touch any file the OS user can).
   */
  allowedPaths?: string[]
  /**
   * Whether Pi appears as a backend option in the terminal agent mode.
   * Default: true. Disable to keep terminal agent mode OpenClaw-only.
   */
  terminalIntegrationEnabled?: boolean
}

// ---------------------------------------------------------------------------
// EnvoyMesh JSON-RPC params/results (mirror the OpenClaw pattern)
// ---------------------------------------------------------------------------

export interface GetPiStatusParams {}

export interface GetPiStatusResult {
  status: PiStatus
}

export interface RestartPiParams {}

export interface RestartPiResult {
  status: PiStatus
}

export interface SendToPiParams {
  text: string
  /** Optional session/correlation key (future: multi-session support). */
  sessionId?: string
}

export interface SendToPiResult {
  /** Echoed back text response (for simple sync RPC callers). */
  text: string
}

// ---------------------------------------------------------------------------
// Phase 49D — Tool-call approval (confirm-dialog flow)
// ---------------------------------------------------------------------------
// Pi executes its own tools internally; EnvoyMesh only approves via the
// extension_ui_request / extension_ui_response stdin/stdout sub-protocol.
// See design §7. These types model the host-side confirm payload + RPC.

/**
 * A Pi tool-action confirmation request, surfaced to the user as a dialog.
 * Produced from a PiExtensionUiRequest by pi-tool-bridge.ts.
 *
 * NOTE: this is deliberately NOT a TerminalCommandProposal. Pi executes
 * its own tools — there's no command string for EnvoyMesh to write to a
 * PTY. The reuse is visual only (docked card + buttons).
 */
export interface PiToolProposal {
  /** The Pi extension_ui_request id — used to correlate the response. */
  uiRequestId: string
  /** Human-readable short heading, e.g. "Run bash command?". */
  title: string
  /** Supporting context, e.g. "rm -rf node_modules". */
  message: string
  /** Pi's requested timeout in ms; the UI may auto-dismiss after this. */
  timeoutMs: number
  /** ISO timestamp when EnvoyMesh received the request. */
  receivedAt: string
}

/** WebSocket push payload for the `pi:proposal` event. */
export interface PiProposalEvent {
  proposal: PiToolProposal
}

/** Params for the piRespondToProposal JSON-RPC method. */
export interface PiRespondToProposalParams {
  /** Matches PiToolProposal.uiRequestId. */
  uiRequestId: string
  /** true = allow the action (Pi proceeds); false = deny (Pi skips). */
  confirmed: boolean
}

export interface PiRespondToProposalResult {
  /** Echo of the request id, for client-side correlation. */
  uiRequestId: string
  /** Whether the response was delivered to Pi before its timeout elapsed. */
  delivered: boolean
}

/** Max concurrent interactive Pi TUI sessions (one per project folder). */
export const MAX_PI_TERMINAL_SESSIONS = 5

/** Params for starting / restarting a Pi interactive TUI terminal. */
export interface EnsurePiTerminalParams {
  /**
   * Absolute (or cwd-relative) project directory. Required to start a Pi TUI —
   * there is no boot auto-start from saved paths. Persisted into
   * `piSettings.allowedPaths` (MRU, capped) after a successful start.
   */
  projectPath?: string
  /**
   * When set with `forceRestart`, close this Pi session before starting the
   * new project folder (change-project for a specific TUI).
   */
  sessionId?: string
  /**
   * Kill the targeted Pi session (`sessionId`, or a session already on
   * `projectPath`) and start fresh. Default false — reuses a running Pi
   * for the same project folder.
   */
  forceRestart?: boolean
}

/** Result of ensuring a Pi interactive TUI terminal session. */
export type EnsurePiTerminalFailureCode =
  | "no_manager"
  | "disabled"
  | "no_config"
  | "no_model"
  | "no_sidecar"
  | "no_tools"
  | "needs_project"
  | "invalid_project"
  | "pi_limit_reached"
  | "spawn_failed"

export type EnsurePiTerminalResult =
  | { ok: true; session: import("./terminal.js").TerminalSessionSummary }
  | { ok: false; code: EnsurePiTerminalFailureCode; reason: string }
