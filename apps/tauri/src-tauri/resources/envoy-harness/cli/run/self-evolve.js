/**
 * The `self-evolve` subcommand handler. Extracted
 * in T3.2 from `cli/run.ts`.
 *
 * The flow:
 * 1. Resolve the model (programmatic or
 *    `--provider + env`).
 * 2. Build the SelfEvolvePaths (each path has
 *    a sensible default under `<cwd>/.envoymesh/...`).
 * 3. Wire the components (`ModelHypothesisProvider`,
 *    `DefaultBenchmarkRunner`).
 * 4. Load the committed ruleset (T1.3) or fall
 *    back to `DEFAULT_RULES`; log which one is
 *    in effect.
 * 5. Run the cycle (`evolve.runOneCycle()`).
 * 6. Federated pull (if `--pull`).
 * 7. Print a human-readable summary.
 */
import * as path from "node:path";
import { CliError, DefaultBenchmarkRunner, EXIT_USAGE, FederatedScoreboard, LocalPeerSource, loadRulesetFromFile, ModelHypothesisProvider, SelfEvolve, createProviderAdapter, DEFAULT_RULES, } from "../../index.js";
export async function runSelfEvolve(parsed, options, stdout, stderr) {
    // 1. Resolve the model. F7.5: dispatch via --provider + env
    //    when no model is injected via RunOptions. Same helper
    //    as `runAgent` (the hypothesis provider just needs a
    //    ModelAdapter; the wire format is provider-specific).
    const model = options.model
        ? options.model
        : (() => {
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
        })();
    // 2. Build paths. Each path has a sensible default under
    //    $ENVOY_HOME; for v0, we use `<cwd>/.envoymesh/...`.
    const cwd = options.cwd ?? process.cwd();
    const root = path.join(cwd, ".envoymesh");
    const paths = {
        scoreboard: parsed.scoreboard ?? path.join(root, "verifier-scoreboard.yaml"),
        snapshotDir: parsed.snapshotDir ?? path.join(root, "snapshots"),
        benchmark: parsed.benchmark ?? path.join(root, "frozen-benchmark.yaml"),
        ruleset: parsed.ruleset ?? path.join(root, "verifier-rules.json"),
        agentsMd: parsed.agentsMd ?? path.join(root, "AGENTS.md"),
    };
    const adoptionsFile = parsed.adoptions ?? path.join(root, "federated-adoptions.yaml");
    // 3. Wire the components.
    const hypothesisProvider = new ModelHypothesisProvider(model);
    const benchmarkRunner = new DefaultBenchmarkRunner();
    // F-fix: build on the committed ruleset when one exists
    // (the protocol is now real: candidates select rule names,
    // and the committed file is re-loadable). Fresh installs
    // fall back to DEFAULT_RULES.
    //
    // T1.3: visibility log — the user running
    // `envoy self-evolve` should see whether the
    // committed ruleset is in effect (vs the default).
    // Without this log, the cycle silently uses
    // DEFAULT_RULES on a fresh install and the
    // user wonders why their committed file isn't
    // being read.
    const committed = await loadRulesetFromFile(paths.ruleset, DEFAULT_RULES);
    const currentRules = committed ?? DEFAULT_RULES;
    if (committed !== null) {
        stderr.write(`self-evolve: using committed ruleset (${committed.length} rules from ${paths.ruleset})\n`);
    }
    else {
        stderr.write(`self-evolve: using DEFAULT_RULES (${DEFAULT_RULES.length} rules; no committed ruleset at ${paths.ruleset})\n`);
    }
    // 4. Run the cycle.
    const evolve = new SelfEvolve({
        paths,
        currentRules,
        hypothesisProvider,
        benchmarkRunner,
        shadowMode: !parsed.commit,
        ...(parsed.recentFailures !== undefined
            ? { recentFailureWindow: parsed.recentFailures }
            : {}),
    });
    const cycleResult = await evolve.runOneCycle();
    // 5. Federated pull (if --pull). v0: LocalPeerSource returns
    //    []. The pull runs the local 5-step gate against any
    //    candidates and records the audit trail. Without --pull,
    //    the federated layer is a no-op.
    let federated;
    if (parsed.pull) {
        const fed = new FederatedScoreboard(new LocalPeerSource());
        const pullResult = await fed.pull({ optIn: true });
        if (!pullResult.skipped) {
            const adoptResult = await fed.adopt(pullResult, evolve, {
                adoptionsFile,
                ...(parsed.peerId !== undefined ? { peerId: parsed.peerId } : {}),
            });
            federated = {
                skipped: false,
                adopted: adoptResult.adopted.length,
                rejected: adoptResult.rejected.length,
                filtered: pullResult.rejected.length,
            };
        }
        else {
            federated = { skipped: true, adopted: 0, rejected: 0, filtered: 0 };
        }
    }
    // 6. Print a human-readable summary.
    if (!parsed.quiet) {
        const lines = [
            `envoy self-evolve: cycle v${cycleResult.entry.version}`,
            `  status: ${cycleResult.entry.status}`,
            `  hypothesis: ${cycleResult.entry.hypothesis}`,
            `  pass rate: ${cycleResult.entry.passRateBefore.toFixed(2)} → ${cycleResult.entry.passRateAfter.toFixed(2)} (${cycleResult.entry.nRuns} runs)`,
            `  ruleset hash: ${cycleResult.entry.rulesetHash}`,
            cycleResult.kept && !parsed.commit
                ? `  (shadow mode: candidate was NOT committed)`
                : cycleResult.kept
                    ? `  (committed to ${paths.ruleset})`
                    : `  (reverted: no improvement)`,
        ];
        if (federated) {
            if (federated.skipped) {
                lines.push(`  federated: skipped (no --pull peers)`);
            }
            else {
                lines.push(`  federated: ${federated.adopted} adopted, ${federated.rejected} rejected, ${federated.filtered} filtered`);
                lines.push(`    (audit log: ${adoptionsFile})`);
            }
        }
        lines.push("");
        stdout.write(lines.join("\n"));
    }
    return {
        subcommand: "self-evolve",
        kept: cycleResult.kept,
        version: cycleResult.entry.version,
        hypothesis: cycleResult.entry.hypothesis,
        status: cycleResult.entry.status,
        passRateBefore: cycleResult.entry.passRateBefore,
        passRateAfter: cycleResult.entry.passRateAfter,
        nRuns: cycleResult.entry.nRuns,
        rulesetHash: cycleResult.entry.rulesetHash,
        ...(federated !== undefined ? { federated } : {}),
    };
}
//# sourceMappingURL=self-evolve.js.map