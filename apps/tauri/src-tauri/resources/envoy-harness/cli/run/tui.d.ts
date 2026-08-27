/**
 * `envoy-harness tui` — delegate to the EHUI package (`envoy-harness-tui`).
 *
 * Package 1 stays UI-free; this subcommand only resolves and spawns the
 * sibling TUI binary with `--spawn` and forwarded flags.
 */
import type { ParsedArgs } from "../argv.js";
export declare function resolveTuiEntry(forwardArgv: readonly string[]): {
    command: string;
    args: string[];
};
export declare function runTuiDispatch(parsed: Extract<ParsedArgs, {
    subcommand: "tui";
}>, rawArgv: readonly string[]): Promise<{
    subcommand: "tui";
}>;
//# sourceMappingURL=tui.d.ts.map