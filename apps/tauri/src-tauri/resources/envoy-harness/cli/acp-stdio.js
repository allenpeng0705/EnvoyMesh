/**
 * Phase G / 12b — ACP stdio entry for staged Tauri resources.
 *
 * Usage (from a staged `resources/envoy-harness` tree):
 *   node cli/acp-stdio.js
 *
 * Hosts (EnvoyMesh Tauri, TUI `--spawn`) attach as ACP clients over
 * this process's stdin/stdout. Do not write human text to stdout.
 */
import { run } from "../index.js";
const extra = process.argv.slice(2).filter((a) => a !== "--acp");
await run({ argv: ["--acp", ...extra] });
//# sourceMappingURL=acp-stdio.js.map