/**
 * argv parser for the envoy-harness CLI.
 *
 * **Design doc:** `docs/design.md` §19.
 *
 * **Phase 1+3 scope:** the v0 flag set for `envoy-harness` and
 * the `self-evolve` subcommand. We don't try to match every
 * flag from §19 in this chunk — the parser is designed to be
 * additive (new flags append to `KNOWN_FLAGS` without breaking
 * existing tests). The full §19 surface lands in later chunks.
 *
 * **Subcommand dispatch:** the first non-flag positional is
 * treated as a subcommand (`self-evolve` is the only one in
 * v0; `envoy-harness [prompt]` is the default / no-subcommand
 * form). The top-level `parseArgs` returns a discriminated
 * union; callers narrow on `subcommand`.
 *
 * **Why a hand-rolled parser?** `process.argv.slice(2)` is a
 * single line; a `commander` / `yargs` dependency is overkill
 * for v0. The parser is small enough to read in one screen.
 *
 * **Stability:** `ParsedArgs` is the public type. New fields
 * are additive (default to `undefined`).
 */
import { parsePeerEndpoint, parsePeerEndpointsFromEnv, } from "../peers/endpoints.js";
import { parsePluginConfigEntry, PluginConfigParseError, } from "../plugins/config-parser.js";
/** v0 flag set for the `run` subcommand (default). */
const RUN_FLAGS = new Set([
    "--help",
    "--version",
    "--json",
    "--sandbox",
    "--approval",
    "--model",
    "--provider",
    "--cwd",
    "--max-turns",
    "--max-cost-usd",
    "--resume",
    "--resume-remote",
    "--fork",
    "--persist",
    "--session-dir",
    "--config",
    "--import-config",
    "--from",
    "--plugin",
    "--plugin-config",
    "--peers",
    "--peer",
    "--connect-timeout-ms",
    "--plan",
    "--repl",
    "--acp",
    "--no-color",
    "--verbose",
    "--quiet",
]);
/** v0 flag set for the `self-evolve` subcommand. */
const SELF_EVOLVE_FLAGS = new Set([
    "--help",
    "--version",
    "--model",
    "--provider",
    "--scoreboard",
    "--snapshot-dir",
    "--benchmark",
    "--ruleset",
    "--agents-md",
    "--adoptions",
    "--commit",
    "--recent-failures",
    "--pull",
    "--peer-id",
    "--no-color",
    "--verbose",
    "--quiet",
]);
/** A flag that takes a value (--flag value) for the run subcommand. */
const RUN_VALUED_FLAGS = new Set([
    "--sandbox",
    "--sandbox-executor",
    "--approval",
    "--model",
    "--provider",
    "--cwd",
    "--max-turns",
    "--max-cost-usd",
    "--resume",
    "--resume-remote",
    "--fork",
    "--session-dir",
    "--config",
    "--import-config",
    "--from",
    "--plugin",
    "--plugin-config",
    "--peers",
    "--peer",
    "--connect-timeout-ms",
]);
/** A flag that takes a value for the self-evolve subcommand. */
const SELF_EVOLVE_VALUED_FLAGS = new Set([
    "--model",
    "--provider",
    "--scoreboard",
    "--snapshot-dir",
    "--benchmark",
    "--ruleset",
    "--agents-md",
    "--adoptions",
    "--recent-failures",
    "--peer-id",
]);
/** The shared flags used by every subcommand. */
const COMMON_FLAGS = new Set(["--help", "--version", "--no-color", "--verbose", "--quiet"]);
/** Error thrown when argv parsing fails. Caught by the runner. */
export class ArgvError extends Error {
    constructor(message) {
        super(message);
        this.name = "ArgvError";
    }
}
/**
 * Parse `argv` (typically `process.argv.slice(2)`) into a
 * `ParsedArgs` object. The first non-flag positional selects
 * the subcommand; `self-evolve` is the only one in v0.
 *
 * Unknown flags throw `ArgvError`; this is intentional — silent
 * acceptance of unknown flags would mask typos.
 */
export function parseArgs(argv) {
    // Detect subcommand: the first non-flag positional.
    const firstPositional = argv.find((a) => !a.startsWith("--"));
    if (firstPositional === "self-evolve") {
        return parseSelfEvolveArgs(argv);
    }
    if (firstPositional === "team") {
        return parseTeamArgs(argv);
    }
    if (firstPositional === "doctor") {
        return parseDoctorArgs(argv);
    }
    if (firstPositional === "mcp") {
        return parseMcpArgs(argv);
    }
    if (firstPositional === "tui") {
        return parseTuiArgs(argv);
    }
    return parseRunArgs(argv);
}
// ---------------------------------------------------------------------------
// run subcommand (default)
// ---------------------------------------------------------------------------
function parseRunArgs(argv) {
    const out = {
        subcommand: "run",
        help: false,
        version: false,
        json: false,
        sandbox: undefined,
        sandboxExecutor: undefined,
        approval: undefined,
        model: undefined,
        provider: undefined,
        cwd: undefined,
        maxTurns: undefined,
        maxCostUsd: undefined,
        resume: undefined,
        resumeRemote: undefined,
        fork: undefined,
        persist: false,
        sessionDir: undefined,
        config: undefined,
        importConfig: undefined,
        importFrom: undefined,
        plugins: [],
        pluginConfigs: [],
        plan: false,
        repl: false,
        acp: false,
        peers: [],
        peerConnectTimeoutMs: undefined,
        noColor: false,
        verbose: false,
        quiet: false,
        positional: [],
    };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === undefined)
            continue;
        if (arg.startsWith("--")) {
            if (!RUN_FLAGS.has(arg)) {
                throw new ArgvError(`unknown flag: ${arg}`);
            }
            if (handleCommonFlag(arg, out))
                continue;
            if (arg === "--json") {
                out.json = true;
                continue;
            }
            if (arg === "--plan") {
                out.plan = true;
                continue;
            }
            if (arg === "--repl") {
                out.repl = true;
                continue;
            }
            if (arg === "--acp") {
                out.acp = true;
                continue;
            }
            if (arg === "--persist") {
                out.persist = true;
                continue;
            }
            // Valued flags: consume the next arg.
            if (RUN_VALUED_FLAGS.has(arg)) {
                const value = argv[++i];
                if (value === undefined) {
                    throw new ArgvError(`${arg} requires a value`);
                }
                switch (arg) {
                    case "--sandbox":
                        if (!isPermissionMode(value)) {
                            throw new ArgvError(`invalid --sandbox: ${value} (expected read-only | workspace-write | danger-full-access)`);
                        }
                        out.sandbox = value;
                        break;
                    case "--sandbox-executor":
                        if (value !== "landlock" &&
                            value !== "seatbelt" &&
                            value !== "windows-sandbox" &&
                            value !== "none") {
                            throw new ArgvError(`invalid --sandbox-executor: ${value} (expected landlock | seatbelt | windows-sandbox | none)`);
                        }
                        out.sandboxExecutor = value;
                        break;
                    case "--approval":
                        if (value !== "unless-trusted" &&
                            value !== "on-request" &&
                            value !== "granular" &&
                            value !== "never") {
                            throw new ArgvError(`invalid --approval: ${value} (expected unless-trusted | on-request | granular | never)`);
                        }
                        out.approval = value;
                        break;
                    case "--model":
                        out.model = value;
                        break;
                    case "--provider":
                        out.provider = value;
                        break;
                    case "--cwd":
                        out.cwd = value;
                        break;
                    case "--max-turns": {
                        const n = Number(value);
                        if (!Number.isFinite(n) || n <= 0) {
                            throw new ArgvError(`invalid --max-turns: ${value}`);
                        }
                        out.maxTurns = n;
                        break;
                    }
                    case "--max-cost-usd": {
                        const n = Number(value);
                        if (!Number.isFinite(n) || n < 0) {
                            throw new ArgvError(`invalid --max-cost-usd: ${value}`);
                        }
                        out.maxCostUsd = n;
                        break;
                    }
                    case "--resume":
                        out.resume = value;
                        break;
                    case "--resume-remote":
                        out.resumeRemote = value;
                        break;
                    case "--fork":
                        out.fork = value;
                        break;
                    case "--session-dir":
                        out.sessionDir = value;
                        break;
                    case "--config":
                        out.config = value;
                        break;
                    case "--import-config":
                        out.importConfig = value;
                        break;
                    case "--from":
                        out.importFrom = value;
                        break;
                    case "--plugin":
                        out.plugins.push(value);
                        break;
                    case "--plugin-config":
                        try {
                            out.pluginConfigs.push(parsePluginConfigEntry(value));
                        }
                        catch (err) {
                            if (err instanceof PluginConfigParseError) {
                                // Re-throw as `ArgvError` so the runner
                                // converts to `CliError(EXIT_USAGE)`.
                                throw new ArgvError(err.message);
                            }
                            throw err;
                        }
                        break;
                    case "--peers":
                    case "--peer": {
                        try {
                            out.peers.push(parsePeerEndpoint(value));
                        }
                        catch (err) {
                            throw new ArgvError(err.message);
                        }
                        break;
                    }
                    case "--connect-timeout-ms": {
                        const n = Number(value);
                        if (!Number.isInteger(n) || n <= 0) {
                            throw new ArgvError(`invalid --connect-timeout-ms: ${value}`);
                        }
                        out.peerConnectTimeoutMs = n;
                        break;
                    }
                }
                continue;
            }
            // Should be unreachable.
            throw new ArgvError(`unhandled flag: ${arg}`);
        }
        out.positional.push(arg);
    }
    if (out.peers.length === 0) {
        out.peers = [...parsePeerEndpointsFromEnv()];
    }
    return out;
}
// ---------------------------------------------------------------------------
// self-evolve subcommand
// ---------------------------------------------------------------------------
function parseSelfEvolveArgs(argv) {
    const out = {
        subcommand: "self-evolve",
        help: false,
        version: false,
        model: undefined,
        provider: undefined,
        scoreboard: undefined,
        snapshotDir: undefined,
        benchmark: undefined,
        ruleset: undefined,
        agentsMd: undefined,
        adoptions: undefined,
        commit: false,
        recentFailures: undefined,
        pull: false,
        peerId: undefined,
        noColor: false,
        verbose: false,
        quiet: false,
    };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === undefined)
            continue;
        if (arg.startsWith("--")) {
            if (!SELF_EVOLVE_FLAGS.has(arg)) {
                throw new ArgvError(`unknown flag: ${arg}`);
            }
            if (handleCommonFlag(arg, out))
                continue;
            if (arg === "--commit") {
                out.commit = true;
                continue;
            }
            if (arg === "--pull") {
                out.pull = true;
                continue;
            }
            if (SELF_EVOLVE_VALUED_FLAGS.has(arg)) {
                const value = argv[++i];
                if (value === undefined) {
                    throw new ArgvError(`${arg} requires a value`);
                }
                switch (arg) {
                    case "--model":
                        out.model = value;
                        break;
                    case "--provider":
                        out.provider = value;
                        break;
                    case "--scoreboard":
                        out.scoreboard = value;
                        break;
                    case "--snapshot-dir":
                        out.snapshotDir = value;
                        break;
                    case "--benchmark":
                        out.benchmark = value;
                        break;
                    case "--ruleset":
                        out.ruleset = value;
                        break;
                    case "--agents-md":
                        out.agentsMd = value;
                        break;
                    case "--adoptions":
                        out.adoptions = value;
                        break;
                    case "--recent-failures": {
                        const n = Number(value);
                        if (!Number.isFinite(n) || n < 0) {
                            throw new ArgvError(`invalid --recent-failures: ${value}`);
                        }
                        out.recentFailures = n;
                        break;
                    }
                    case "--peer-id":
                        out.peerId = value;
                        break;
                }
                continue;
            }
            throw new ArgvError(`unhandled flag: ${arg}`);
        }
        // For self-evolve, the only non-flag positional is the
        // subcommand keyword itself ("self-evolve"), which we've
        // already used to dispatch. Anything else is an error.
        if (arg !== "self-evolve") {
            throw new ArgvError(`unexpected positional: ${arg}`);
        }
    }
    return out;
}
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
/**
 * Handle flags common to all subcommands: --help, --version,
 * --no-color, --verbose, --quiet. Returns `true` if handled
 * (caller should continue), `false` otherwise.
 */
function handleCommonFlag(arg, out) {
    if (arg === "--help") {
        out.help = true;
        return true;
    }
    if (arg === "--version") {
        out.version = true;
        return true;
    }
    if (arg === "--no-color") {
        out.noColor = true;
        return true;
    }
    if (arg === "--verbose") {
        out.verbose = true;
        return true;
    }
    if (arg === "--quiet") {
        out.quiet = true;
        return true;
    }
    return false;
}
function isPermissionMode(value) {
    return (value === "read-only" ||
        value === "workspace-write" ||
        value === "danger-full-access");
}
// Silence the "unused" warning for COMMON_FLAGS — it's kept as
// documentation of the shared surface; the actual handling is
// in `handleCommonFlag`.
void COMMON_FLAGS;
/** Print the help text to stderr (or wherever `out` points). */
export function formatHelp(version) {
    return [
        `envoy-harness ${version}`,
        "",
        "Usage:",
        "  envoy-harness [flags] [prompt]",
        "  envoy-harness [flags] -                    # read prompt from stdin",
        "  envoy-harness [flags] <prompt-file>        # read prompt from a file",
        "  envoy-harness self-evolve [flags]          # run one self-evolution cycle",
        "  envoy-harness doctor [--config <path>]     # health checks",
        "  envoy-harness tui [flags]                  # terminal UI (envoy-harness-tui)",
        "",
        "Flags (run):",
        "  --sandbox <mode>       read-only | workspace-write | danger-full-access",
        "  --sandbox-executor <b> landlock | seatbelt | windows-sandbox | none  (opt-in kernel sandbox; default none)",
        "  --approval <mode>      unless-trusted | on-request | granular | never",
        "  --model <id>           LLM model identifier",
        "  --provider <name>      LLM provider (openai, anthropic, deepseek, ollama)",
        "  --cwd <path>           override working directory",
        "  --max-turns <n>        agent loop iteration cap (default 50)",
        "  --max-cost-usd <n>     cost ceiling (default 5.00)",
        "  --resume <session-id>  resume a previous session",
        "  --resume-remote <node>/<session>  resume from a mesh peer (requires mesh adapter)",
        "  --fork <session-id>    fork a previous session",
        "  --persist              persist this session to disk (for --resume later)",
        "  --session-dir <path>   session storage dir (default ~/.local/state/envoy-harness/sessions)",
        "  --config <path>        TOML config file (default ~/.config/envoy-harness/config.toml)",
        "  --import-config <path> import a foreign config file (use with --from <format>)",
        "  --from <format>        source format for --import-config (v0: codex)",
        "  --plugin <name>        load a plugin (repeatable; must be in the curated whitelist)",
        "  --plugin-config <spec> per-plugin config (repeatable; '<name>.<key>=<value>')",
        "  --peers <id>@<host:port>  mesh peer endpoint (repeatable; also ENVOY_PEERS)",
        "  --connect-timeout-ms <n>  per-peer connect timeout (default 10000)",
        "  --plan                 read + plan only, no writes",
        "  --repl                 interactive REPL (no positional prompt)",
        "  --acp                  serve ACP JSON-RPC on stdio (hosts / TUI)",
        "  --json                 JSON Lines output (machine-readable)",
        "  --quiet                suppress human output",
        "  --no-color             disable ANSI colors",
        "  --verbose              print hook fires and validator verdicts",
        "  --help                 print this help and exit",
        "  --version              print version and exit",
        "",
        "Flags (self-evolve):",
        "  --scoreboard <path>    scoreboard YAML file",
        "  --snapshot-dir <path>  snapshot directory",
        "  --benchmark <path>     frozen benchmark YAML file",
        "  --ruleset <path>       live ruleset file (committed on kept)",
        "  --agents-md <path>     user AGENTS.md (snapshotted)",
        "  --adoptions <path>     federated adoptions YAML file",
        "  --commit               actually write the candidate (default: shadow)",
        "  --recent-failures <n>  recent entries to feed the prompt (default 20)",
        "  --pull                 opt in to federated pull (default: off)",
        "  --peer-id <id>         this peer's id (recorded in adoptions log)",
        "",
        "Flags (tui):",
        "  --spawn                spawn envoy-harness --acp (default for envoy-harness tui)",
        "  --demo                 in-process demo backend",
        "  --cluster-only         mesh cluster console",
        "  --peers <id>@<host:port>  static peer (repeatable)",
        "  --connect-timeout-ms <n>",
        "  --provider <name>      LLM provider for --spawn",
        "  --model <id>           LLM model for --spawn",
        "  --ask-permission       demo permission prompts",
        "  --no-color             disable ANSI colors",
        "",
        "See docs/design.md §19 for the full surface.",
    ].join("\n");
}
// ---------------------------------------------------------------------------
// team subcommand (F9.3)
// ---------------------------------------------------------------------------
const TEAM_FLAGS = new Set([
    "--model",
    "--provider",
    "--cwd",
    "--input",
    "--json",
    "--quiet",
    "--help",
    "--version",
]);
function parseTeamArgs(argv) {
    const out = {
        subcommand: "team",
        help: false,
        version: false,
        model: undefined,
        provider: undefined,
        cwd: undefined,
        input: undefined,
        json: false,
        quiet: false,
        positional: [],
    };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === undefined)
            continue;
        if (arg.startsWith("--")) {
            if (!TEAM_FLAGS.has(arg)) {
                throw new ArgvError(`unknown flag for team subcommand: ${arg}`);
            }
            if (arg === "--help") {
                out.help = true;
                continue;
            }
            if (arg === "--version") {
                out.version = true;
                continue;
            }
            if (arg === "--json") {
                out.json = true;
                continue;
            }
            if (arg === "--quiet") {
                out.quiet = true;
                continue;
            }
            // Valued flags: consume the next arg.
            const next = argv[i + 1];
            if (next === undefined) {
                throw new ArgvError(`flag ${arg} requires a value`);
            }
            if (arg === "--model")
                out.model = next;
            else if (arg === "--provider")
                out.provider = next;
            else if (arg === "--cwd")
                out.cwd = next;
            else if (arg === "--input")
                out.input = next;
            i++;
            continue;
        }
        // Strip the "team" subcommand keyword from
        // the positional list.
        if (arg === "team")
            continue;
        out.positional.push(arg);
    }
    return out;
}
function parseMcpArgs(argv) {
    const out = {
        subcommand: "mcp",
        help: false,
        version: false,
    };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === "mcp")
            continue;
        if (arg === "--help") {
            out.help = true;
            continue;
        }
        if (arg === "--version") {
            out.version = true;
            continue;
        }
        if (arg === "--cwd") {
            const next = argv[i + 1];
            if (next === undefined) {
                throw new ArgvError("--cwd requires a path");
            }
            out.cwd = next;
            i++;
            continue;
        }
        throw new ArgvError(`unknown flag for mcp subcommand: ${arg}`);
    }
    return out;
}
function parseDoctorArgs(argv) {
    const out = {
        subcommand: "doctor",
        help: false,
        version: false,
    };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === "doctor")
            continue;
        if (arg === "--help") {
            out.help = true;
            continue;
        }
        if (arg === "--version") {
            out.version = true;
            continue;
        }
        if (arg === "--config") {
            const next = argv[i + 1];
            if (next === undefined) {
                throw new ArgvError("flag --config requires a value");
            }
            out.config = next;
            i++;
            continue;
        }
        throw new ArgvError(`unknown flag for doctor subcommand: ${arg}`);
    }
    return out;
}
const TUI_FLAGS = new Set([
    "--demo",
    "--spawn",
    "--cluster-only",
    "--peers",
    "--connect-timeout-ms",
    "--provider",
    "--model",
    "--ask-permission",
    "--help",
    "-h",
    "--no-color",
]);
function parseTuiArgs(argv) {
    const out = {
        subcommand: "tui",
        help: false,
        version: false,
        noColor: false,
    };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === "tui")
            continue;
        if (arg === "--help" || arg === "-h") {
            out.help = true;
            continue;
        }
        if (arg === "--version") {
            out.version = true;
            continue;
        }
        if (arg === "--no-color") {
            out.noColor = true;
            continue;
        }
        if (!TUI_FLAGS.has(arg)) {
            throw new ArgvError(`unknown flag for tui subcommand: ${arg}`);
        }
        if (arg === "--peers" ||
            arg === "--connect-timeout-ms" ||
            arg === "--provider" ||
            arg === "--model") {
            const next = argv[i + 1];
            if (next === undefined || next.startsWith("--")) {
                throw new ArgvError(`${arg} requires a value`);
            }
            i++;
        }
    }
    return out;
}
//# sourceMappingURL=argv.js.map