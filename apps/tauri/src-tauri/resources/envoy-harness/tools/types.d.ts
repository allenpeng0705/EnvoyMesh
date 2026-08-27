/**
 * Tool types (§10 of the design).
 *
 * A `Tool` is the unit of capability the agent can invoke. Each tool
 * has:
 * - `name` — the string the model uses to call it.
 * - `description` — what the model reads in the system prompt.
 * - `parameters` — a zod schema; arguments are validated before
 *   `execute` runs.
 * - `execute` — the actual implementation.
 *
 * **Why zod?** The same schema can be (1) used to validate args at
 * runtime, (2) converted to a JSON Schema for the model's tool
 * definition (in v1), and (3) used to type `execute(args)` correctly
 * via `z.infer`. Three uses, one source of truth.
 *
 * **Why a `ToolContext`?** Some tools need to know the cwd, the
 * session id, or to abort on a signal. We pass these as a single
 * object so the tool signature stays stable as context grows.
 *
 * **Wire compatibility:** the local `Tool` type and the wire
 * `ToolDefinition` in `@envoymesh/protocol/agent-adapter` have the
 * same shape (name, description, parameters). The adapter (Package 3)
 * translates. Per design target #4, this package has zero
 * EnvoyMesh-internal deps.
 */
import { z } from "zod";
import type { Session } from "../session.js";
/**
 * A tool invocation emitted by the model. The agent looks up the
 * tool by `name`, validates `args` against the tool's `parameters`
 * schema, then calls `execute`.
 *
 * `id` is opaque to the model; the agent uses it to correlate the
 * tool call with the tool result in the transcript.
 */
export interface ToolCall {
    /** Opaque correlation id. */
    id: string;
    /** Tool name (matches `Tool.name`). */
    name: string;
    /** Arguments, must validate against `Tool.parameters`. */
    args: unknown;
}
/**
 * The result of running a tool. `content` is the data the tool
 * produced; the agent serializes it into a tool result message
 * that the model can read on the next turn.
 *
 * `isError: true` means the tool ran but failed (e.g. ENOENT, bad
 * input). The result is still passed to the model so it can
 * recover (read another file, try a different command, etc.).
 */
export interface ToolResult<T = unknown> {
    content: T;
    /** True if the tool failed but the error is recoverable. */
    isError?: boolean;
}
/**
 * Passed to every tool's `execute` method. Contains runtime info
 * the tool may need but the model doesn't choose.
 *
 * `cwd` is the agent's working directory (where shell commands run,
 * where relative paths resolve). `session` is for tools that need
 * to read or write session state. `abortSignal` lets the agent
 * cancel a long-running tool when the user interrupts.
 */
export interface ToolContext {
    cwd: string;
    session: Session;
    abortSignal: AbortSignal;
    /**
     * The agent's current effective `SandboxPolicy`. Tools that
     * enforce permissions (e.g. `bash`) use this instead of
     * re-deriving from session metadata, so runtime policy
     * changes (`/sandbox`, plan mode) take effect immediately.
     * Optional for backward compatibility with callers that
     * construct a `ToolContext` directly.
     */
    sandboxPolicy?: import("../types.js").SandboxPolicy;
    /**
     * Env for bash / background job spawns after shell_environment_policy.
     * When unset, bash uses a filtered copy of process.env.
     */
    shellEnv?: Record<string, string>;
    /**
     * Phase F: optional OS sandbox executor. When set, bash
     * runs commands through this executor (landlock / seatbelt /
     * noop) after the 6 validators. When unset, bash spawns
     * `sh -c` directly (v0 behavior).
     */
    sandboxExecutor?: import("../sandbox/types.js").SandboxExecutor;
    /**
     * Live stdout chunks during long-running tools (e.g. bash).
     * Protocol hosts forward these as `tool_progress` activity.
     */
    onToolOutput?: (stdout: string) => void;
    /**
     * Record a file change for `/undo` (write / edit tools).
     */
    recordUndo?: (entry: {
        path: string;
        previousContent: string | null;
    }) => void;
}
/**
 * A tool the agent can invoke. The model sees `name` and
 * `description` (in the system prompt's tool list) and the JSON
 * Schema derived from `parameters`. The agent validates `args`
 * against `parameters` before calling `execute`.
 *
 * **Generics:** `TParams` is a zod schema. The agent infers the
 * args type via `z.infer<TParams>`, so `execute` is typed without
 * a cast.
 *
 * @example
 * ```ts
 * const readFile: Tool<z.ZodObject<{ path: z.ZodString }>> = {
 *   name: 'read_file',
 *   description: 'Read a file.',
 *   parameters: z.object({ path: z.string() }),
 *   async execute({ path }, ctx) {
 *     return { content: await fs.readFile(path, 'utf8') };
 *   },
 * };
 * ```
 */
export interface Tool<TParams extends z.ZodTypeAny = z.ZodTypeAny> {
    /** Unique tool name. Lowercase snake_case recommended. */
    name: string;
    /** Human-readable description, shown to the model. */
    description: string;
    /** Zod schema for the tool's arguments. */
    parameters: TParams;
    /**
     * Run the tool. Args are pre-validated by the registry; the
     * tool may still throw on I/O errors. The registry catches
     * and converts throws to `{ isError: true }` results.
     */
    execute(args: z.infer<TParams>, context: ToolContext): Promise<ToolResult>;
}
/**
 * The role of a message in a transcript. The model sees these
 * roles in its prompt; the agent appends new ones as the loop runs.
 */
export type Role = "system" | "user" | "assistant" | "tool";
/**
 * A piece of content inside a message. Messages are arrays of
 * blocks so a single assistant turn can carry both text and
 * tool calls (this is the OpenAI / Anthropic convention).
 */
export type ContentBlock = {
    type: "text";
    text: string;
} | {
    type: "image";
    mimeType: string;
    data: string;
} | {
    type: "tool_call";
    id: string;
    name: string;
    args: unknown;
} | {
    type: "tool_result";
    toolCallId: string;
    content: unknown;
    isError: boolean;
};
/**
 * One message in the transcript. Role determines how the model
 * interprets the blocks: `user` blocks are user input; `assistant`
 * blocks are model output; `tool` blocks are results of tool
 * calls (the model reads them to plan the next step).
 */
export interface Message {
    role: Role;
    content: ContentBlock[];
}
//# sourceMappingURL=types.d.ts.map