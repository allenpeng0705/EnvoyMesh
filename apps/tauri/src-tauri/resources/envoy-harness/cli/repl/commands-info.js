/**
 * F17.2.5 — Tier 1 info commands.
 *
 * 8 print/info commands that fill the gap between the F17.2
 * basics and what codex / claude-code / pi ship. The data
 * sources already exist (`agent.getCost`, `agent.getSessionId`,
 * `agent.getLspServers`, `agent.getHooks`, the scoreboard
 * from F6, the verifier from §12, the TOML profile config
 * from the README); these commands just format them.
 *
 * **Tier 1 = no new agent capabilities.** No compaction
 * algorithm, no AGENTS.md generation, no journaled action
 * log. Just data display.
 *
 * | Command             | Source                                |
 * |---------------------|---------------------------------------|
 * | `/session`          | `agent.getSessionId()`                 |
 * | `/context`          | `agent.getMessageCount()` + `getCost()`|
 * | `/scoreboard`       | `ctx.scoreboard` (F6, optional)       |
 * | `/rules`            | `ctx.verifierRules` (optional)        |
 * | `/lsp`              | `agent.getLspServers()`                |
 * | `/hooks`            | `agent.getHooks()`                     |
 * | `/mcp`              | v0 placeholder (no MCP servers yet)   |
 * | `/profile [name]`   | `ctx.profileLoader` (optional)         |
 *
 * **Stability:** `BUILTIN_INFO_COMMANDS` is the public surface.
 * Adding new info commands is additive.
 */
import { DEFAULT_RULES } from "../../index.js";
// ---------------------------------------------------------------------------
// 1. /session — print the current session id
// ---------------------------------------------------------------------------
const sessionCommand = {
    name: "/session",
    description: "print the current session id",
    handler(_args, ctx) {
        ctx.stdout.write(`session: ${ctx.agent.getSessionId()}\n`);
    },
};
// ---------------------------------------------------------------------------
// 2. /context — print message count + input/output tokens
// ---------------------------------------------------------------------------
const contextCommand = {
    name: "/context",
    description: "print transcript size + token usage",
    handler(_args, ctx) {
        const messageCount = ctx.agent.getMessageCount();
        const cost = ctx.agent.getCost();
        ctx.stdout.write(`messages: ${messageCount} ` +
            `| in: ${cost.inputTokens} | out: ${cost.outputTokens} ` +
            `| cost: $${cost.costUsd.toFixed(4)}\n`);
    },
};
// ---------------------------------------------------------------------------
// 3. /scoreboard — list scoreboard entries (when a scoreboard is loaded)
// ---------------------------------------------------------------------------
const scoreboardCommand = {
    name: "/scoreboard",
    description: "print the federated scoreboard (when loaded)",
    handler(_args, ctx) {
        const scoreboard = ctx.scoreboard;
        if (!scoreboard) {
            ctx.stdout.write("no scoreboard loaded (start envoy with --self-evolve to populate)\n");
            return;
        }
        // F17.2.5 v0: print the scoreboard path + entry count.
        // The detailed entry listing is a future chunk (the
        // FederatedScoreboard has a read API; we expose the
        // path + count for now).
        const entries = scoreboard.entries?.() ?? [];
        ctx.stdout.write(`scoreboard: ${entries.length} entr${entries.length === 1 ? "y" : "ies"}\n`);
    },
};
// ---------------------------------------------------------------------------
// 4. /rules — print the active verifier rules
// ---------------------------------------------------------------------------
const rulesCommand = {
    name: "/rules",
    description: "print the active verifier rules",
    handler(_args, ctx) {
        // `ctx.verifierRules` overrides DEFAULT_RULES when set
        // (the host injects custom rules via AgentOptions).
        const rules = ctx.verifierRules ?? DEFAULT_RULES;
        if (rules.length === 0) {
            ctx.stdout.write("no verifier rules\n");
            return;
        }
        const lines = [];
        for (const r of rules) {
            lines.push(`  ${r.name.padEnd(20)}  ${r.description ?? ""}`);
        }
        ctx.stdout.write(lines.join("\n") + "\n");
    },
};
// ---------------------------------------------------------------------------
// 5. /lsp — list active LSP servers (from agent.lspManager)
// ---------------------------------------------------------------------------
const lspCommand = {
    name: "/lsp",
    description: "list active LSP servers",
    handler(_args, ctx) {
        const servers = ctx.agent.getLspServers();
        if (servers.length === 0) {
            ctx.stdout.write("no LSP servers configured (set AgentOptions.lspManager)\n");
            return;
        }
        const lines = [];
        for (const s of servers) {
            lines.push(`  ${s.language.padEnd(12)}  ${s.rootUri}`);
        }
        ctx.stdout.write(lines.join("\n") + "\n");
    },
};
// ---------------------------------------------------------------------------
// 6. /hooks — list registered hooks
// ---------------------------------------------------------------------------
const hooksCommand = {
    name: "/hooks",
    description: "list registered hooks",
    handler(_args, ctx) {
        const hooks = ctx.agent.getHooks();
        if (hooks.length === 0) {
            ctx.stdout.write("no hooks registered\n");
            return;
        }
        const lines = [];
        for (const h of hooks) {
            const noun = h.handlerCount === 1 ? "handler" : "handlers";
            lines.push(`  ${h.event.padEnd(20)}  ${h.handlerCount} ${noun}`);
        }
        ctx.stdout.write(lines.join("\n") + "\n");
    },
};
// ---------------------------------------------------------------------------
// 7. /mcp — list MCP servers (T3.3: type seam shipped; transport pending)
// ---------------------------------------------------------------------------
const mcpCommand = {
    name: "/mcp",
    description: "list MCP servers wired from config or AgentOptions",
    handler(_args, ctx) {
        const registry = ctx.agent.mcpClients;
        if (registry === undefined) {
            ctx.stdout.write("no MCP servers (add [[mcp_servers]] to config.toml or inject mcpClients)\n");
            return;
        }
        const servers = registry.list();
        if (servers.length === 0) {
            ctx.stdout.write("MCP registry is empty (0 servers)\n");
            return;
        }
        ctx.stdout.write(`MCP servers (${servers.length}):\n`);
        for (const name of servers) {
            ctx.stdout.write(`  - ${name}\n`);
        }
    },
};
const profileCommand = {
    name: "/profile",
    description: "list profiles, show one, or apply: /profile apply <name>",
    handler(args, ctx) {
        if (!ctx.profileLoader) {
            ctx.stdout.write("no profile loader configured " +
                "(host injects a profileLoader via ReplOptions)\n");
            return;
        }
        if (args[0] === "apply") {
            const name = args[1];
            if (name === undefined) {
                ctx.stdout.write("usage: /profile apply <name>\n");
                return;
            }
            const profile = ctx.profileLoader.get(name);
            if (!profile) {
                ctx.stderr.write(`unknown profile: ${name}\n`);
                return;
            }
            if (typeof profile.sandbox === "string") {
                ctx.agent.setPermissionMode(profile.sandbox);
            }
            if (typeof profile.approval === "string") {
                ctx.agent.setApprovalPolicy(profile.approval);
            }
            if (typeof profile.model === "string") {
                ctx.stdout.write(`note: profile model "${profile.model}" not applied (use /model)\n`);
            }
            ctx.stdout.write(`applied profile: ${name}\n`);
            return;
        }
        if (args.length === 0) {
            const names = ctx.profileLoader.list();
            if (names.length === 0) {
                ctx.stdout.write("no profiles in config\n");
                return;
            }
            ctx.stdout.write(`profiles: ${names.join(", ")}\n`);
            return;
        }
        const name = args[0];
        if (name === undefined) {
            ctx.stdout.write("usage: /profile [name]\n");
            return;
        }
        const profile = ctx.profileLoader.get(name);
        if (!profile) {
            ctx.stderr.write(`unknown profile: ${name}\n`);
            return;
        }
        const lines = [`profile: ${name}`];
        for (const [k, v] of Object.entries(profile)) {
            lines.push(`  ${k.padEnd(12)}  ${String(v)}`);
        }
        ctx.stdout.write(lines.join("\n") + "\n");
    },
};
/**
 * F17.2.5: list of the 8 Tier 1 info commands. The runner
 * includes this in the default registry alongside the
 * F17.2 commands (`BUILTIN_COMMANDS`).
 *
 * **Defined last** because each entry is a `const` declared
 * above. Forward references in `const` arrays would force
 * us to either inline the literals (less readable) or
 * convert each command to a function declaration (less
 * idiomatic for a data literal). The bottom-of-file
 * position is the cleanest fix (same pattern as
 * `BUILTIN_COMMANDS` in `commands.ts`).
 */
export const BUILTIN_INFO_COMMANDS = [
    sessionCommand,
    contextCommand,
    scoreboardCommand,
    rulesCommand,
    lspCommand,
    hooksCommand,
    mcpCommand,
    profileCommand,
];
//# sourceMappingURL=commands-info.js.map