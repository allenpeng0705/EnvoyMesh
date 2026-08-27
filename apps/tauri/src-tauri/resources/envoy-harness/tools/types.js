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
//# sourceMappingURL=types.js.map