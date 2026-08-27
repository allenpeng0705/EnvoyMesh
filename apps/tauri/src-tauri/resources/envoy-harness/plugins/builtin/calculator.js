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
/** zod schema for the calculator plugin's config.
 *  Chunk 3.4: the runner validates the CLI-supplied
 *  config against this schema before calling `apply`.
 *  The `.min(0)` and `.max(15)` caps keep
 *  `toFixed(precision)` sensible (a negative
 *  precision throws; precision > 15 is
 *  implementation-defined and rarely useful). */
export const CalculatorConfigSchema = z.object({
    precision: z.number().int().min(0).max(15).optional(),
});
/** The plugin's name. Used by the whitelist + the registry. */
export const CALCULATOR_NAME = "envoy-harness-plugin-calculator";
/** The default precision (when no config is supplied). */
const DEFAULT_PRECISION = 6;
// ---------------------------------------------------------------------------
// Expression evaluator — a small recursive-descent parser
// ---------------------------------------------------------------------------
/** A `CalculatorError` is thrown when the expression is
 *  invalid (e.g. unmatched parens, unexpected character).
 *  The `ToolRegistry` converts thrown errors into
 *  `{ isError: true, content: { error: message } }`. */
export class CalculatorError extends Error {
    name = "CalculatorError";
    constructor(message) {
        super(message);
    }
}
/** Tokenize a calculator expression. Throws
 *  `CalculatorError` on an unexpected character. */
function tokenize(input) {
    const tokens = [];
    let i = 0;
    while (i < input.length) {
        const c = input[i];
        if (c === " " || c === "\t" || c === "\n") {
            i++;
            continue;
        }
        if (c === "+") {
            tokens.push({ kind: "plus", text: "+", value: 0 });
            i++;
            continue;
        }
        if (c === "-") {
            tokens.push({ kind: "minus", text: "-", value: 0 });
            i++;
            continue;
        }
        if (c === "*") {
            tokens.push({ kind: "star", text: "*", value: 0 });
            i++;
            continue;
        }
        if (c === "/") {
            tokens.push({ kind: "slash", text: "/", value: 0 });
            i++;
            continue;
        }
        if (c === "(") {
            tokens.push({ kind: "lparen", text: "(", value: 0 });
            i++;
            continue;
        }
        if (c === ")") {
            tokens.push({ kind: "rparen", text: ")", value: 0 });
            i++;
            continue;
        }
        if (c >= "0" && c <= "9") {
            let j = i;
            while (j < input.length && input[j] >= "0" && input[j] <= "9")
                j++;
            if (input[j] === ".") {
                j++;
                while (j < input.length && input[j] >= "0" && input[j] <= "9")
                    j++;
            }
            const text = input.slice(i, j);
            const value = Number(text);
            if (Number.isNaN(value)) {
                throw new CalculatorError(`invalid number: ${text}`);
            }
            tokens.push({ kind: "number", text, value });
            i = j;
            continue;
        }
        throw new CalculatorError(`unexpected character at position ${i}: ${c}`);
    }
    return tokens;
}
/** A parser for arithmetic expressions. The grammar:
 *
 *  Expression := Term (('+' | '-') Term)*
 *  Term       := Factor (('*' | '/') Factor)*
 *  Factor     := ('-' | '+') Factor | Primary
 *  Primary    := Number | '(' Expression ')'
 *
 *  Standard operator precedence: `*` / `/` bind
 *  tighter than `+` / `-`. Parens override.
 */
class Parser {
    tokens;
    pos = 0;
    constructor(tokens) {
        this.tokens = tokens;
    }
    parse() {
        const result = this.parseExpression();
        if (this.pos < this.tokens.length) {
            const leftover = this.tokens[this.pos];
            throw new CalculatorError(`unexpected token at position ${this.pos}: ${leftover.text}`);
        }
        return result;
    }
    parseExpression() {
        let left = this.parseTerm();
        while (this.pos < this.tokens.length) {
            const t = this.tokens[this.pos];
            if (t.kind === "plus") {
                this.pos++;
                left = left + this.parseTerm();
            }
            else if (t.kind === "minus") {
                this.pos++;
                left = left - this.parseTerm();
            }
            else {
                break;
            }
        }
        return left;
    }
    parseTerm() {
        let left = this.parseFactor();
        while (this.pos < this.tokens.length) {
            const t = this.tokens[this.pos];
            if (t.kind === "star") {
                this.pos++;
                left = left * this.parseFactor();
            }
            else if (t.kind === "slash") {
                this.pos++;
                const right = this.parseFactor();
                if (right === 0) {
                    throw new CalculatorError("division by zero");
                }
                left = left / right;
            }
            else {
                break;
            }
        }
        return left;
    }
    parseFactor() {
        const t = this.tokens[this.pos];
        if (t === undefined) {
            throw new CalculatorError("unexpected end of expression");
        }
        if (t.kind === "minus") {
            this.pos++;
            return -this.parseFactor();
        }
        if (t.kind === "plus") {
            this.pos++;
            return this.parseFactor();
        }
        return this.parsePrimary();
    }
    parsePrimary() {
        const t = this.tokens[this.pos];
        if (t === undefined) {
            throw new CalculatorError("unexpected end of expression");
        }
        if (t.kind === "number") {
            this.pos++;
            return t.value;
        }
        if (t.kind === "lparen") {
            this.pos++;
            const v = this.parseExpression();
            const close = this.tokens[this.pos];
            if (close === undefined || close.kind !== "rparen") {
                throw new CalculatorError("unmatched '('");
            }
            this.pos++;
            return v;
        }
        throw new CalculatorError(`unexpected token: ${t.text}`);
    }
}
/** Evaluate a calculator expression. Throws
 *  `CalculatorError` on parse / runtime errors. */
export function evaluateExpression(input) {
    const tokens = tokenize(input);
    if (tokens.length === 0) {
        throw new CalculatorError("empty expression");
    }
    return new Parser(tokens).parse();
}
// ---------------------------------------------------------------------------
// The Tool
// ---------------------------------------------------------------------------
/** zod schema for the calculator tool's arguments. */
const CalculatorParams = z.object({
    expression: z.string().min(1, "expression must not be empty"),
});
/** The calculator tool's description. Exposed as a
 *  constant so the plugin's `makeCalculatorTool(precision)`
 *  factory reuses it (no duplication). */
const CALCULATOR_DESCRIPTION = "Evaluate a basic arithmetic expression. Supports +, -, *, /, " +
    "parens, and integer / decimal literals (e.g. \"2 + 2 * 3\").";
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
export function makeCalculatorTool(precision) {
    return {
        name: "calculator",
        description: CALCULATOR_DESCRIPTION,
        parameters: CalculatorParams,
        async execute(args, _context) {
            void _context;
            const value = evaluateExpression(args.expression);
            // Round to `precision` decimal places. `toFixed`
            // returns a string; the model reads the string.
            const rounded = value.toFixed(precision);
            return { content: { result: rounded } };
        },
    };
}
// ---------------------------------------------------------------------------
// The plugin
// ---------------------------------------------------------------------------
/**
 * The calculator plugin.
 *
 * Registers a configured `calculator` tool on the
 * agent's `ToolRegistry`. The tool is closed over
 * the plugin's `config.precision` (default 6). The
 * returned `Disposable` unregisters the tool when
 * the plugin is disposed.
 */
export const calculatorPlugin = {
    name: CALCULATOR_NAME,
    configSchema: CalculatorConfigSchema,
    apply(ctx, config) {
        const { precision = DEFAULT_PRECISION } = config;
        const tool = makeCalculatorTool(precision);
        ctx.tools.register(tool);
        return () => {
            ctx.tools.unregister("calculator");
        };
    },
};
//# sourceMappingURL=calculator.js.map