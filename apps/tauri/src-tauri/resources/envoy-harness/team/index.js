/**
 * Team public API (F9.3, §22 of the design).
 *
 * **What this module exports:** the team types +
 * the TOML parser. The `Team` class (the runner)
 * lands in F9.3.2 (follow-up commit).
 *
 * **Exports:**
 * - Types: `TeamConfig`, `AgentSpec`, `ScheduleSpec`,
 *   `TeamResult`, `AgentRunResult`.
 * - Parser: `parseTeamToml(input: string): TeamConfig`.
 * - `TomlParseError` — the parser's error type.
 *
 * **Stability:** the public surface is the union of
 * the above. Additive; new fields on the types are
 * additive; the TOML parser is v0 and grows over
 * time.
 */
export { parseTeamToml, TomlParseError } from "./toml.js";
export { Team } from "./runner.js";
//# sourceMappingURL=index.js.map