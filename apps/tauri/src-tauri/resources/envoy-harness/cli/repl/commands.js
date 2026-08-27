/**
 * F17.2 — Built-in slash commands.
 *
 * The REPL ships with 9 slash commands that operate on
 * local state (no model call):
 *
 * | Command            | Effect                                                |
 * |--------------------|-------------------------------------------------------|
 * | `/help`            | List all visible commands.                            |
 * | `/model <id>`      | Swap the model adapter (F17.2 setter).                 |
 * | `/provider <name>` | Swap via `createProviderAdapter` (env-driven).        |
 * | `/sandbox <mode>`  | Change permission mode (rebuilds the policy).         |
 * | `/approval <mode>` | Change the per-call approval policy.                  |
 * | `/clear`           | Reset the session transcript (keep AGENTS.md).        |
 * | `/cost`            | Print accumulated cost + token usage.                 |
 * | `/status`          | Print current model / sandbox / turn count.           |
 * | `/quit`            | Exit the REPL. (alias: `/exit`)                       |
 *
 * **Why a function, not a class?** each command is a small
 * (5-20 LoC) `ReplCommand` literal. A class would just
 * hide the handler in `this.handle()` for no gain.
 *
 * **Note on `/sandbox` and `/approval`:** the Agent has
 * setters (`setPermissionMode`, `setAskHandler`) that
 * take effect on the next tool call. The Session's
 * `metadata.permissionMode` is immutable (per the Session
 * contract), so the running policy reflects the current
 * mode; the session's metadata reflects the start-of-
 * session mode. This is documented in the setter JSDoc.
 *
 * **Stability:** `BUILTIN_COMMANDS` is the public surface.
 * Adding new built-ins is additive; renaming or removing
 * one is a breaking change.
 */
import { createProviderAdapter } from "../../index.js";
/**
 * `/help` — list all non-hidden commands. One line per
 * command: `<name>  <description>`. The output is sent
 * to stdout (the user sees it).
 */
const helpCommand = {
    name: "/help",
    description: "list all slash commands",
    handler(_args, ctx) {
        // The REPL wires `ctx.registry` to the live registry
        // before dispatching. Without it, the help command
        // has no way to enumerate peers (the registry isn't
        // closed-over because the built-in commands are
        // declared as `const` at module load time).
        const lines = [];
        const visible = ctx.registry.listVisible();
        for (const c of visible) {
            lines.push(`  ${c.name.padEnd(16)}  ${c.description}`);
        }
        ctx.stdout.write(lines.join("\n") + "\n");
    },
};
/**
 * `/model <id>` — swap the model adapter on the running
 * Agent. The next `agent.run()` call uses the new model.
 * The cost tracker updates from the next `response.model`.
 *
 * **`/model` with no args** prints the current model
 * description (we don't track the model name on the
 * adapter; we say "model swapped; the next response will
 * show the name").
 */
const modelCommand = {
    name: "/model",
    description: "swap the model adapter",
    handler(args, ctx) {
        if (args.length === 0) {
            ctx.stdout.write("usage: /model <adapter>\n");
            ctx.stdout.write("(the adapter object must be injected programmatically; see the REPL plan)\n");
            return;
        }
        // F17.2 v0: `/model <id>` doesn't build an adapter
        // from the id alone — the host injects a real adapter
        // via ReplOptions. Print a hint and continue.
        ctx.stdout.write(`model swap via /model <id> is a v0 placeholder; the next chunk will build the adapter from the id\n` +
            `current model: ${ctx.agent ? "set" : "unset"}\n`);
    },
};
/**
 * `/provider <name>` — swap the provider via the
 * `createProviderAdapter` helper. Reads the API key from
 * the same env vars as the CLI's `--provider` flag.
 *
 * For F17.2 v0: this command works for the 4 supported
 * providers (`openai` / `anthropic` / `deepseek` / `ollama`)
 * when the matching env var is set. The new adapter is
 * installed via `agent.setModel(...)`.
 */
const providerCommand = {
    name: "/provider",
    description: "swap the model provider (openai | anthropic | deepseek | ollama)",
    handler(args, ctx) {
        if (args.length === 0) {
            ctx.stdout.write("usage: /provider <name> [model-id]\n");
            return;
        }
        const provider = args[0];
        if (provider === undefined) {
            ctx.stdout.write("usage: /provider <name> [model-id]\n");
            return;
        }
        const modelId = args[1];
        try {
            const newAdapter = createProviderAdapter({
                provider,
                ...(modelId !== undefined ? { model: modelId } : {}),
            });
            ctx.agent.setModel(newAdapter);
            ctx.stdout.write(`provider: ${provider}${modelId ? ` (model: ${modelId})` : ""}\n`);
        }
        catch (err) {
            ctx.stderr.write(`error: ${err.message}\n`);
        }
    },
};
/**
 * `/sandbox <mode>` — change the permission mode. The
 * next tool call sees the new policy. Valid modes:
 * `read-only` | `workspace-write` | `danger-full-access`.
 */
const sandboxCommand = {
    name: "/sandbox",
    description: "change permission mode (read-only | workspace-write | danger-full-access)",
    handler(args, ctx) {
        const VALID = new Set(["read-only", "workspace-write", "danger-full-access"]);
        if (args.length === 0) {
            const current = ctx.args.sandbox ?? "read-only";
            ctx.stdout.write(`current sandbox: ${current}\n`);
            ctx.stdout.write("usage: /sandbox <read-only | workspace-write | danger-full-access>\n");
            return;
        }
        const mode = args[0];
        if (mode === undefined || !VALID.has(mode)) {
            ctx.stderr.write(`error: invalid sandbox mode: ${mode} (expected read-only | workspace-write | danger-full-access)\n`);
            return;
        }
        ctx.args.sandbox = mode;
        ctx.agent.setPermissionMode(ctx.args.sandbox);
        ctx.stdout.write(`sandbox: ${mode}\n`);
    },
};
/**
 * `/approval <mode>` — change the per-call approval policy.
 * Valid modes match the CLI: `unless-trusted` | `on-request`
 * | `granular` | `never`.
 *
 * **v0 semantics (fail-closed):** the REPL has no UI handler,
 * so every mode delegates to the agent's default (deny) —
 * `never` makes that explicit by installing a deny-all
 * handler, and the others remove any host-installed handler
 * so the safe default applies. (v0 installed an always-ALLOW
 * handler for non-`never` modes, which inverted the meaning:
 * `/approval on-request` auto-approved every ask.)
 */
const approvalCommand = {
    name: "/approval",
    description: "change approval policy (unless-trusted | on-request | granular | never)",
    handler(args, ctx) {
        const VALID = new Set([
            "unless-trusted",
            "on-request",
            "granular",
            "never",
        ]);
        if (args.length === 0) {
            const current = ctx.args.approval ?? "(none)";
            ctx.stdout.write(`current approval: ${current}\n`);
            ctx.stdout.write("usage: /approval <unless-trusted | on-request | granular | never>\n");
            return;
        }
        const mode = args[0];
        if (mode === undefined || !VALID.has(mode)) {
            ctx.stderr.write(`error: invalid approval mode: ${mode} (expected unless-trusted | on-request | granular | never)\n`);
            return;
        }
        ctx.args.approval = mode;
        if (mode === "never") {
            // Fail-closed: explicitly deny every ask.
            ctx.agent.setAskHandler(async () => ({
                kind: "deny",
                reason: `approval mode is 'never'`,
            }));
        }
        else {
            // No UI handler in the v0 REPL: delegate to the agent's
            // default (deny) rather than auto-allowing.
            ctx.agent.setAskHandler(undefined);
        }
        ctx.stdout.write(`approval: ${mode}\n`);
    },
};
/**
 * `/clear` — reset the session transcript. The next turn
 * starts a clean transcript (the AGENTS.md and the
 * agent's tool/hook/permission state are preserved).
 */
const clearCommand = {
    name: "/clear",
    description: "reset the session transcript (AGENTS.md preserved)",
    handler(_args, ctx) {
        ctx.agent.clearSession();
        ctx.stdout.write("session cleared\n");
    },
};
/**
 * `/cost` — print accumulated cost + token usage. The
 * agent's `getCost()` returns `{ costUsd, inputTokens,
 * outputTokens }`. We add the REPL-level `turns` for
 * context. The number of `calls` would require extending
 * the `RunCost` shape; deferred (F17.5 candidate).
 */
const costCommand = {
    name: "/cost",
    description: "print accumulated cost + token usage",
    handler(_args, ctx) {
        const t = ctx.agent.getCost();
        ctx.stdout.write(`cost: $${t.costUsd.toFixed(4)} ` +
            `| in: ${t.inputTokens} | out: ${t.outputTokens} ` +
            `| turns: ${ctx.turns}\n`);
    },
};
/**
 * `/status` — print the current model provider + sandbox
 * mode + turn count. Useful for the user to confirm the
 * REPL's state before issuing a prompt.
 */
const statusCommand = {
    name: "/status",
    description: "print current provider / sandbox / turn count",
    handler(_args, ctx) {
        const lines = [];
        const sandbox = ctx.args.sandbox ?? "read-only";
        const approval = ctx.args.approval ?? "(none)";
        lines.push(`sandbox:   ${sandbox}`);
        lines.push(`approval:  ${approval}`);
        lines.push(`turns:     ${ctx.turns}`);
        lines.push(`cost:      $${ctx.totalCostUsd.toFixed(4)}`);
        const cwd = ctx.args.cwd ?? "(default)";
        lines.push(`cwd:       ${cwd}`);
        ctx.stdout.write(lines.join("\n") + "\n");
    },
};
/**
 * `/quit` — exit the REPL. The dispatcher intercepts this
 * and returns `{ kind: "exit" }` (the handler is never
 * actually invoked; it's defined for symmetry + future
 * "are you sure?" prompts).
 */
const quitCommand = {
    name: "/quit",
    description: "exit the REPL",
    hidden: false,
    handler() {
        // The dispatcher's `EXIT_NAMES` set intercepts `/quit`
        // before invoking the handler. This handler is a
        // safety net for the case where a custom registry
        // omits the dispatcher (e.g. tests).
    },
};
/**
 * F17.2: list of the 9 built-in slash commands. The
 * registry picks this up by default. Hosts that want a
 * different set can pass `customCommands` instead (the
 * runner then ignores the built-ins).
 *
 * **Defined last** because each entry is a `const` declared
 * above. Forward references in `const` arrays would force
 * us to either inline the literals (less readable) or
 * convert each command to a function declaration (less
 * idiomatic for a data literal). The bottom-of-file
 * position is the cleanest fix.
 */
export const BUILTIN_COMMANDS = [
    helpCommand,
    modelCommand,
    providerCommand,
    sandboxCommand,
    approvalCommand,
    clearCommand,
    costCommand,
    statusCommand,
    quitCommand,
];
//# sourceMappingURL=commands.js.map