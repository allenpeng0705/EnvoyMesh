/**
 * Phase B / Item 3.2 + 3.4 — built-in sample plugin: `calculator`.
 *
 * **What this is:** a tool plugin that registers a
 * `calculator` tool on the agent's `ToolRegistry`.
 * The tool takes `{ expression: string }` and returns
 * the evaluated result.
 *
 * **Why this plugin:** it exercises the tool-registration
 * path of the seam that the `audit-log` and
 * `confirm-tool` samples (hook plugins) don't.
 * Proves that `ctx.tools.register(tool)` works for
 * a plugin-defined tool, and that the agent's
 * `ToolRegistry` accepts the plugin's `Tool`
 * instance.
 *
 * **Expression evaluator:** v0 supports `+`, `-`,
 * `*`, `/`, `(`, `)`, unary minus, and integer /
 * decimal literals. No variables, no functions, no
 * exponentiation. The evaluator is a small recursive-
 * descent parser (~70 LoC) — the chunk's goal is to
 * prove the tool-registration path, not to ship a
 * calculator. A future chunk can swap in a real
 * expression library (e.g. `mathjs`) if the use
 * case emerges.
 *
 * **Why the `precision?` config:** real calculators
 * round; a user might want 2 decimal places for
 * currency, or 10 for scientific notation. v0
 * exposes `precision` as a config so the user can
 * tune the output. Default: 6 decimal places.
 * Capped at 0..15 by the zod schema.
 *
 * **Hermetic:** the expression evaluator is pure
 * (no I/O, no LLM). The test suite invokes the
 * tool's `execute` directly with a synthetic
 * `ToolContext`. No real network / kernel / agent.
 *
 * **Config shape:** `{ precision?: number }` — the
 * number of decimal places to round to. The
 * schema is exported as `CalculatorConfigSchema`.
 */
import { z } from "zod";
import type { Tool } from "../../tools/types.js";
import type { CapabilityModule } from "../types.js";
/** The calculator plugin's typed config. The
 *  `| undefined` is intentional: the zod schema's
 *  optional fields produce `{ key: number | undefined }`
 *  in the parsed output, and the interface matches
 *  that exactOptionalPropertyTypes-friendly shape. */
export interface CalculatorConfig {
    /** The number of decimal places to round to.
     *  Default: 6. */
    precision?: number | undefined;
}
/** zod schema for the calculator plugin's config.
 *  Chunk 3.4: the runner validates the CLI-supplied
 *  config against this schema before calling `apply`.
 *  The `.min(0)` and `.max(15)` caps keep
 *  `toFixed(precision)` sensible (a negative
 *  precision throws; precision > 15 is
 *  implementation-defined and rarely useful). */
export declare const CalculatorConfigSchema: z.ZodObject<{
    precision: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    precision?: number | undefined;
}, {
    precision?: number | undefined;
}>;
/** The plugin's name. Used by the whitelist + the registry. */
export declare const CALCULATOR_NAME = "envoy-harness-plugin-calculator";
/** A `CalculatorError` is thrown when the expression is
 *  invalid (e.g. unmatched parens, unexpected character).
 *  The `ToolRegistry` converts thrown errors into
 *  `{ isError: true, content: { error: message } }`. */
export declare class CalculatorError extends Error {
    readonly name = "CalculatorError";
    constructor(message: string);
}
/** Evaluate a calculator expression. Throws
 *  `CalculatorError` on parse / runtime errors. */
export declare function evaluateExpression(input: string): number;
/** zod schema for the calculator tool's arguments. */
declare const CalculatorParams: z.ZodObject<{
    expression: z.ZodString;
}, "strip", z.ZodTypeAny, {
    expression: string;
}, {
    expression: string;
}>;
/**
 * Build a configured calculator tool. The plugin's
 * `apply` calls this with the user's config (precision).
 * Each plugin instance gets its own `Tool` (so a host
 * that loads two calculator plugins with different
 * precisions would see two `calculator` tools — but
 * the `ToolRegistry` rejects duplicate names, so the
 * second registration throws. v0 uses one
 * `calculator` tool with one precision per process).
 */
export declare function makeCalculatorTool(precision: number): Tool<typeof CalculatorParams>;
/**
 * The calculator plugin.
 *
 * Registers a configured `calculator` tool on the
 * agent's `ToolRegistry`. The tool is closed over
 * the plugin's `config.precision` (default 6). The
 * returned `Disposable` unregisters the tool when
 * the plugin is disposed.
 */
export declare const calculatorPlugin: CapabilityModule<CalculatorConfig>;
export {};
//# sourceMappingURL=calculator.d.ts.map