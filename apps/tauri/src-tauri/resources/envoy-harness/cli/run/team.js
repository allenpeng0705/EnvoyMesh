/**
 * The `team` subcommand handler. Extracted in
 * T3.2 from `cli/run.ts`.
 *
 * The flow:
 * 1. Resolve the model.
 * 2. Read the TOML config from `positional[0]`.
 * 3. Build the Team and run.
 * 4. Print a per-agent summary.
 */
import { promises as fs } from "node:fs";
import { CliError, EXIT_DATAERR, EXIT_USAGE, Team, createProviderAdapter, parseTeamToml, } from "../../index.js";
export async function runTeam(parsed, options, stdout, stderr) {
    void stderr;
    // 1. Resolve the model. Same dispatch as the `run`
    //    subcommand: programmatic injection takes
    //    precedence; else --provider + env.
    const model = resolveModelForTeam(parsed, options);
    // 2. Read the TOML config (positional[0]).
    if (parsed.positional.length === 0) {
        throw new CliError("team subcommand requires a TOML config path (e.g. `envoy team team.toml`)", EXIT_USAGE);
    }
    const configPath = parsed.positional[0];
    let config;
    try {
        const toml = await fs.readFile(configPath, "utf8");
        config = parseTeamToml(toml);
    }
    catch (err) {
        // Check by name (not instanceof) so the bundled
        // dist's class identity matches. instanceof can
        // fail when the same class is loaded from a
        // different module instance.
        if (err.name === "TomlParseError") {
            throw new CliError(`invalid team config at ${configPath}: ${err.message}`, EXIT_DATAERR);
        }
        throw new CliError(`failed to read team config at ${configPath}: ${err.message}`, EXIT_DATAERR);
    }
    // 3. Build the team and run.
    const team = new Team({
        config,
        model,
        cwd: parsed.cwd ?? options.cwd ?? process.cwd(),
        input: parsed.input ?? "",
    });
    const result = await team.runOnce();
    // 4. Print the summary.
    if (!parsed.quiet) {
        const lines = [
            `envoy team: ${result.teamName}`,
            `  status: ${result.status}`,
        ];
        for (const a of result.agents) {
            lines.push(`  [${a.id}] (${a.durationMs}ms): ${a.finalText.split("\n")[0]?.slice(0, 100) ?? ""}`);
        }
        if (result.error)
            lines.push(`  error: ${result.error}`);
        lines.push("");
        stdout.write(lines.join("\n"));
    }
    return {
        subcommand: "team",
        teamName: result.teamName,
        agents: result.agents,
        status: result.status,
        ...(result.error !== undefined ? { error: result.error } : {}),
    };
}
/**
 * Resolve the model for the `team` subcommand.
 * Same dispatch as `runAgent` but with the narrower
 * `team` parsed type.
 */
function resolveModelForTeam(parsed, options) {
    if (options.model)
        return options.model;
    if (!parsed.provider) {
        throw new CliError("no model configured: pass one via RunOptions.model, or use --provider <openai|anthropic|deepseek|ollama> with the matching *_API_KEY env var", EXIT_USAGE);
    }
    try {
        return createProviderAdapter({
            provider: parsed.provider,
            ...(parsed.model !== undefined ? { model: parsed.model } : {}),
        });
    }
    catch (err) {
        throw new CliError(err.message, EXIT_USAGE);
    }
}
//# sourceMappingURL=team.js.map