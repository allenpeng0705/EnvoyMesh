/**
 * `envoy-harness doctor` — lightweight health checks (codex doctor parity).
 */
import type { ParsedArgs } from "../argv.js";
import type { DoctorRunResult, RunOptions } from "./types.js";
export interface DoctorCheck {
    name: string;
    ok: boolean;
    detail: string;
}
export declare function runDoctorChecks(parsed: Extract<ParsedArgs, {
    subcommand: "doctor";
}>): Promise<DoctorCheck[]>;
export declare function runDoctorDispatch(parsed: Extract<ParsedArgs, {
    subcommand: "doctor";
}>, _options: RunOptions, stdout: NodeJS.WritableStream): Promise<DoctorRunResult>;
//# sourceMappingURL=doctor.d.ts.map