// Phase 8 / v1.9 — import the `AgentRuntime` type
// from the protocol so the router's `runtimeTags`
// field can use it as a key. (The router doesn't
// otherwise depend on the protocol package
// directly — the v1.1 + v1.7 + v1.8 designs all
// consumed only the `EnvoyHarnessSkillEntry`
// projection.)
import type { AgentRuntime } from "@envoymesh/protocol";

/**
 * Phase 8 / Step 5 — Tauri user-prompt signal router.
 *
 * Phase 8 / v1.9 — imports the `AgentRuntime`
 * type from the protocol so the router's
 * `runtimeTags` field can use it as a key.
 * (The router doesn't otherwise depend on the
 * protocol package directly — the v1.1 +
 * v1.7 + v1.8 designs all consumed only the
 * `EnvoyHarnessSkillEntry` projection.)
 *
 * **What this is:** a pure function that decides which AI
 * Engine (Built-in OpenClaw vs envoy-harness) handles a
 * Tauri user prompt. The Social UI calls
 * `runOwnerAgentTurnViaRuntime(message)` →
 * `routeUserPrompt(input)` → dispatch based on the
 * decision.
 *
 * **Default = OpenClaw.** When the prompt contains a
 * signal (mesh keyword, envoy-harness tool name, or
 * explicit hint prefix), the decision is envoy-harness
 * (when ready; otherwise fall back to OpenClaw with
 * `reason: "envoy-harness-unready"`).
 *
 * **Why a pure function:** the routing decision is a
 * deterministic function of (prompt, readiness, opt-in
 * flag). Pure functions are easy to test in isolation
 * (no I/O, no mocks, no clock). The reference pattern is
 * [`reputation-router.ts`](./reputation-router.ts) (the
 * Team-job capability ranking function).
 *
 * **Why not a class / DI seam:** the router has no
 * dependencies. It's a function, not a service. A class
 * would just add ceremony.
 *
 * **v0 signal set:**
 * 1. **Mesh keywords**: `mesh`, `federated`, `cross-node`
 *    (case-insensitive substring; v0 accepts substring
 *    false positives like `"meshes"` — tighten in v1).
 * 2. **Tool names**: `RemoteMeshSubmitter`, `FanOutSpec`
 *    (case-insensitive substring) + `lsp_*` (regex,
 *    word-boundary, e.g. `lsp_goto_definition`).
 * 3. **Explicit hint prefix**: `!eh` or `/eh` at the
 *    start of the prompt (case-insensitive). The caller
 *    strips the hint from the prompt before dispatch
 *    (the LLM doesn't see `!eh translate this`; it sees
 *    `translate this`).
 *
 * **v1.1 signal set (Phase 8 v1):**
 * The v0 `MESH_KEYWORDS` is replaced by a dynamic
 * vocabulary extracted from the merged manifest's
 * envoy-harness skills' `tags[]` (passed as
 * `input.envoyHarnessTags`). The dynamic vocabulary:
 * - Is **word-boundary regex** for single-word tags
 *   (e.g. `mesh` doesn't match `meshes`).
 * - Is **exact substring** for hyphenated tags
 *   (e.g. `cross-node` matches `cross-node`).
 * - Falls back to the v0 `MESH_KEYWORDS` constant
 *   when `envoyHarnessTags` is `undefined` (backward
 *   compat for callers that haven't been updated to
 *   read the manifest).
 *
 * **v0 deferred (still):**
 * - Cost cap (requires UI affordance `/cost:0.5`)
 * - Multi-provider (requires UI affordance `/provider:openai`)
 * - OpenClaw tags as negative signals (v1.1 only
 *   uses envoy-harness tags as positive)
 *
 * **Stability:** the public surface is `routeUserPrompt`
 * + the input/decision/matcher types. The signal set is
 * additive (new signal categories are new branches; no
 * breaking changes). The env var name
 * (`ENVOY_HARNESS_SIGNAL_OPT_IN`) is the contract with
 * the host config; the literal values `"enabled"` /
 * `"disabled"` are part of the same contract.
 */

// ---------------------------------------------------------------------------
// Constants — the v0 signal vocabulary.
// ---------------------------------------------------------------------------

/**
 * The mesh-keyword vocabulary. Substring match
 * (case-insensitive). v0 accepts false positives
 * like `"meshes"`; v1 will tighten to word
 * boundary.
 */
const MESH_KEYWORDS: ReadonlyArray<string> = [
  "mesh",
  "federated",
  "cross-node",
];

/**
 * The envoy-harness tool-name vocabulary.
 * Substring match (case-insensitive).
 */
const TOOL_NAMES: ReadonlyArray<string> = [
  "RemoteMeshSubmitter",
  "FanOutSpec",
];

/**
 * The envoy-harness `lsp_*` tool family. Regex
 * match. Uses `\b` so `lsp_goto_definition` matches
 * but `mylsp_foo` does not. The captured group is
 * the whole match (e.g. `lsp_goto_definition`).
 */
const LSP_REGEX = /\blsp_\w+/i;

/**
 * The explicit hint prefixes. The user types
 * `!eh translate this` or `/eh translate this` to
 * force envoy-harness routing. Match is
 * case-insensitive, at the start of the prompt
 * (after `trimStart()`).
 *
 * **v1.6 — added `!openclaw`:** the per-prompt
 * opt-out (Q1 + Q3 of the v1.6 sub-plan). When
 * the owner types `!openclaw translate this` at
 * the start, the router routes to OpenClaw
 * regardless of any signals. The order in this
 * list is the precedence order (Q5): the first
 * prefix that matches at offset 0 wins. We put
 * `!openclaw` FIRST so that
 * `!openclaw !eh translate` → OpenClaw (the
 * opt-out is the safety net) but
 * `!eh !openclaw translate` → EH (the explicit
 * route wins when the user types it first).
 */
const HINT_PREFIXES: ReadonlyArray<string> = ["!openclaw", "!eh", "/eh"];

/**
 * Phase 8 / v1.5 — the inline hint regex.
 *
 * Matches `/cost:N` and `/provider:NAME`
 * anywhere in the prompt (case-insensitive).
 * The value is alphanumeric + dash + dot
 * (cost decimals like `0.5` are valid;
 * future provider names like `openai-4`
 * are valid).
 *
 * **Why slash-prefixed inline** (Q1 of the
 * v1.5 sub-plan): the slash is the "command
 * marker" — consistent with the v0 `/eh`
 * prefix. The hints are modifiers (cap
 * cost, force provider), not commands
 * (route to envoy-harness), so they appear
 * inline anywhere in the prompt (Q2).
 *
 * **Why case-insensitive:** `/COST:0.5`
 * should work the same as `/cost:0.5`.
 *
 * **Why alphanumeric + dash + dot for the
 * value:** cost values are decimal numbers
 * (`0.5`, `1.0`); future provider names
 * like `openai-4` or `ollama-local` are
 * valid. The dispatch validates the
 * parsed value (Q4 of the v1.5 sub-plan)
 * — `Number.parseFloat("0.5")` is 0.5;
 * `Number.parseFloat("abc")` is NaN.
 */
const INLINE_HINT_REGEX = /\/(cost|provider):([\w.-]+)/gi;

/**
 * Phase 8 / v1.5 — the env-var name the
 * host uses to opt into the per-prompt
 * cost cap. Default: disabled (the
 * `/cost:N` hint is parsed + recorded on
 * the decision but the dispatch uses the
 * per-skill default — v0 behavior).
 *
 * **Why a separate env var (Q9 of the v1.5
 * sub-plan):** the cost feature is
 * deliberately dormant in v1.5. The EH
 * runtime's cost tracking isn't mature
 * enough to enforce a per-call cap
 * reliably yet. A single env var (not a
 * persisted field) is the simplest flag —
 * when a future chunk lands real cost
 * tracking, the flag can graduate to a
 * persisted field. **Keep it simple.**
 */
export const COST_CAP_ENABLED_ENV_VAR = "ENVOY_HARNESS_COST_CAP_ENABLED";
// (the `AgentRuntime` type is imported at the top
// of the file — see the v1.9 note above the file
// header.)

/**
 * The env-var name the host uses to disable
 * signal-based opt-in. Default: enabled.
 */
export const SIGNAL_OPT_IN_ENV_VAR = "ENVOY_HARNESS_SIGNAL_OPT_IN";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** A single matched signal. */
export interface SignalMatch {
  /**
   * The matched token, in its original case
   * (e.g. `"MESH"` for the prompt `"this is a MESH
   * question"`). For tool names and hint prefixes
   * this is the canonical spelling; for
   * `lsp_*` matches it's the exact substring
   * captured by the regex.
   */
  token: string;
  /**
   * Which vocabulary the token came from.
   * `explicit-hint` matches always come with
   * `offset === 0` (the start of the trimmed
   * prompt) and signal the user forced the
   * routing. `mesh-keyword` + `tool-name` come
   * from the inferred content.
   */
  category: "mesh-keyword" | "tool-name" | "explicit-hint";
  /**
   * Byte offset in the **original** prompt (not
   * the trimmed one). Useful for debug logs and
   * the Social UI's "routed because of <token>"
   * badge. For hint prefixes the offset is the
   * position after any leading whitespace.
   */
  offset: number;
}

/** The input to `routeUserPrompt`. */
export interface RouteUserPromptInput {
  /**
   * The raw prompt text. The router does NOT
   * mutate this; the caller strips the hint
   * prefix (when one was matched) before
   * dispatching to the LLM.
   */
  prompt: string;
  /**
   * Is envoy-harness configured and ready?
   * Sync probe (see
   * `NodeServiceImpl.isEnvoyHarnessReady()`).
   * When `false` and signals match, the decision
   * is `runtime: "openclaw"` with
   * `reason: "envoy-harness-unready"` (the
   * `signals` field is still populated so the
   * caller / UI can surface what fired).
   */
  isEnvoyHarnessReady: boolean;
  /**
   * The reason envoy-harness isn't ready, when
   * applicable. `undefined` when ready. Surface
   * in the log so the owner can debug.
   */
  envoyHarnessUnreadyReason: string | undefined;
  /**
   * Per-node opt-in flag. When `"disabled"`, the
   * router never picks envoy-harness (regardless
   * of signals). The host reads this from
   * `process.env.ENVOY_HARNESS_SIGNAL_OPT_IN` via
   * `readSignalOptInEnv()`.
   */
  signalOptIn: "enabled" | "disabled";
  /**
   * Phase 8 v1.1 — dynamic tag vocabulary
   * extracted from the merged manifest's
   * envoy-harness skills' `tags[]`. The host
   * reads the manifest once (via
   * `getNodeManifest()`) and passes the union of
   * all `envoy-harness` skills' tags here.
   *
   * **Primary path:** when provided, the router
   * matches the prompt against these tags (word-
   * boundary regex for single-word tags; exact
   * substring for hyphenated tags).
   *
   * **Fallback:** when `undefined`, the router
   * uses the v0 `MESH_KEYWORDS` constant as a
   * backward-compat fallback. Callers that
   * haven't been updated to read the manifest
   * still work.
   *
   * **Empty array:** when `[]` (manifest has no
   * envoy-harness skills), the router has no
   * tag-based signals. The v0 vocabulary
   * (tool names / lsp / hint prefix) still
   * works.
   */
  envoyHarnessTags?: ReadonlyArray<string>;
  /**
   * Phase 8 v1.2 — structured skill list from the
   * merged manifest's envoy-harness skills. The
   * host projects the manifest's `MergedSkillEntry`
   * list (filtered by `runtime === "envoy-harness"`)
   * to `{ skillId, tags }[]` and passes the
   * projection here. The router picks the
   * best-match skill and sets `decision.targetSkill`
   * to its `skillId`.
   *
   * **Why a projected shape, not the full
   * `MergedSkillEntry`:** the router is a pure
   * function; it shouldn't depend on the manifest
   * type. The host does the projection (Q8 of the
   * v1.2 sub-plan).
   *
   * **When `undefined` or `[]`:** v1.1 behavior
   * (no per-skill routing). The v1.1
   * `envoyHarnessTags` field is independent — it
   * drives the signal scan; `envoyHarnessSkills`
   * drives the per-skill target. Both are
   * additive.
   */
  envoyHarnessSkills?: ReadonlyArray<EnvoyHarnessSkillEntry>;
  /**
   * Phase 8 v1.7 — negative-signal vocabulary
   * (the OpenClaw tag list from the merged
   * manifest). When the prompt matches any of
   * these tags, the router routes to OpenClaw
   * regardless of any positive (envoy-harness)
   * signals (Q1 + Q2 of the v1.7 sub-plan).
   *
   * **Why a separate field (not merging with
   * `envoyHarnessTags`):** the two vocabularies
   * have different semantics (positive vs.
   * negative signals). Keeping them apart
   * makes the v1.7 intent explicit and lets
   * the router apply the negative rule
   * separately from the positive rule.
   *
   * **Empty array:** when `[]` (manifest has
   * no OpenClaw skills), the router has no
   * negative signal scan. The v1.6
   * positive-signal behavior is preserved
   * (Q9 of the v1.7 sub-plan).
   *
   * **When `undefined`:** no negative signal
   * scan (backward compat with v1.6 callers).
   */
  openClawTags?: ReadonlyArray<string>;
  /**
   * Phase 8 v1.9 — per-runtime tag map (the
   * `Record<AgentRuntime, ReadonlyArray<string>>`
   * for all runtimes in the merged manifest).
   * The router uses `runtimeTags["envoy-harness"]`
   * for the v1.1 positive rule +
   * `runtimeTags["openclaw"]` for the v1.7
   * negative rule (Q2 + Q5 of the v1.9
   * sub-plan). The other runtimes' tag lists
   * (pi, hermes, codex, codex-cli, openhuman)
   * are available for future consumers (v1.9+
   * per-runtime routing extension).
   *
   * **Why a `Partial<Record>`:** the router
   * only consumes the runtimes it routes to
   * (EH + OpenClaw for v1.x). The per-runtime
   * map is optional — callers can pass only
   * the runtimes they care about. The other
   * runtimes' tag lists are still extracted
   * (for future use) but not consumed by the
   * router.
   *
   * **Fallback when `undefined`:** the router
   * uses `envoyHarnessTags` + `openClawTags`
   * independently (the v1.8 behavior, preserved
   * for backward compat — Q5 of the v1.9
   * sub-plan).
   */
  runtimeTags?: Partial<Record<AgentRuntime, ReadonlyArray<string>>>;
}

/**
 * Phase 8 v1.2 — the projected shape of an
 * envoy-harness skill entry, for the router's
 * per-skill matching.
 *
 * **Why a separate type:** the router is
 * manifest-independent (Q8). The host projects
 * the manifest's `MergedSkillEntry` to this
 * shape. Future runtimes (Ext, Pi) can use the
 * same shape; the router doesn't care.
 */
export interface EnvoyHarnessSkillEntry {
  /** The skill's manifest ID. */
  skillId: string;
  /**
   * The skill's tags. Matched with the same
   * algorithm as v1.1's `envoyHarnessTags`
   * (word-boundary regex for single-word tags,
   * exact substring for hyphenated tags).
   */
  tags: ReadonlyArray<string>;
}

/** The output of `routeUserPrompt`. */
export interface RouteUserPromptDecision {
  /** The chosen runtime. */
  runtime: "openclaw" | "envoy-harness";
  /**
   * Why the router made its choice. See the
   * per-branch JSDoc in `routeUserPrompt` for
   * when each value is returned.
   */
  reason:
    | "default"
    | "opt-in-disabled"
    | "opt-out-explicit"
    | "openclaw-tag-match"
    | "signal"
    | "signal-skill"
    | "envoy-harness-unready";
  /**
   * The matched signals. Empty when no signal
   * matched. Populated when signals matched
   * (regardless of whether envoy-harness was
   * ready; the "envoy-harness-unready" branch
   * still carries the signals so the UI can
   * surface what fired).
   */
  signals: ReadonlyArray<SignalMatch>;
  /**
   * When a hint prefix was matched: the length
   * of the matched hint (e.g. `3` for `!eh`).
   * The caller uses this to strip the hint
   * from the prompt before dispatch (LLM
   * doesn't see the `!eh` prefix). `undefined`
   * when no hint was matched.
   *
   * **Why not the full stripped prompt:** the
   * router is pure. It doesn't own the prompt
   * transformation. The caller can compose:
   * `prompt.trimStart().slice(hintPrefixLength).trimStart()`.
   */
  hintPrefixLength: number | undefined;
  /**
   * Phase 8 v1.2 — when the router picked a
   * specific envoy-harness skill (vs the v1.1
   * free-form LLM ask), this is the matched
   * `skillId`. The host dispatches to
   * `askEnvoyHarnessSkill(message, skillId)`
   * instead of `askEnvoyHarness(message)`.
   *
   * **Set when:** the top-scoring skill's
   * match count is ≥ 1 AND strictly greater
   * than the second-best skill's match count
   * (Q1 — uniquely-held threshold). Tie →
   * fall through; `targetSkill` is `undefined`
   * and the dispatch uses the v1.1 free-form
   * LLM ask path.
   *
   * **Combined with `reason: "signal-skill"`:**
   * the Social UI can render
   * "routed to skill `setup-sponsor-friend`"
   * badge.
   */
  targetSkill?: string;
  /**
   * Phase 8 / v1.5 — the per-call cost cap
   * parsed from `/cost:N` in the prompt
   * (Q1 + Q2 of the v1.5 sub-plan). The
   * dispatch uses this only when
   * `ENVOY_HARNESS_COST_CAP_ENABLED=1` is
   * set; otherwise the per-skill default
   * wins (Q9 + Q10 — keep the cost feature
   * dormant by default).
   */
  costCapUsd?: number;
  /**
   * Phase 8 / v1.5 — the provider name
   * parsed from `/provider:NAME` in the
   * prompt (Q1 + Q2). The dispatch uses
   * this to override the node's default
   * configured provider (Q8). No flag —
   * the provider hint is the v1.5
   * actively-used feature.
   */
  providerHint?: string;
  /**
   * Phase 8 / v1.5 — the prompt text with
   * the inline hints stripped. The LLM
   * sees the clean prompt; the user never
   * sees the hints in the chat reply.
   *
   * **When no hints were parsed:** equal
   * to the original prompt (no-op).
   */
  cleanPrompt: string;
}

// ---------------------------------------------------------------------------
// The router
// ---------------------------------------------------------------------------

/**
 * Decide which runtime handles a Tauri user prompt.
 *
 * **Decision tree:**
 * 1. **`opt-in-disabled`** — `signalOptIn === "disabled"`.
 *    Return OpenClaw regardless of signals.
 * 2. **`default`** — no signals matched. Return
 *    OpenClaw.
 * 3. **`signal`** — signals matched and
 *    `isEnvoyHarnessReady === true`, but the v1.2
 *    per-skill matching either didn't pick a unique
 *    skill (tie) or the skills list is empty.
 *    Return envoy-harness runtime's free-form LLM
 *    ask (v1.1 path).
 * 4. **`signal-skill`** — signals matched, EH
 *    ready, AND a unique envoy-harness skill
 *    matched (Q1 — uniquely-held threshold). The
 *    host dispatches to `askEnvoyHarnessSkill(
 *    message, targetSkill)` instead of
 *    `askEnvoyHarness(message)`. The
 *    `targetSkill` field carries the picked
 *    `skillId`.
 * 5. **`envoy-harness-unready`** — signals matched
 *    but `isEnvoyHarnessReady === false`. Return
 *    OpenClaw (with `signals` populated so the
 *    caller / UI can surface the misfire).
 *
 * **Why fallback to OpenClaw on unready (Q4):** the
 * user typed a signal-bearing prompt; they expect
 * the chat to work. A fail-loud throw would force
 * them to rephrase. The `signals` field still tells
 * the UI which signal fired, so the user sees
 * "routed to OpenClaw because envoy-harness was
 * unavailable" — not a silent degradation.
 *
 * **Why unique-skill (Q1) instead of first-match:**
 * ambiguous prompts (e.g. "set up a mesh
 * sub-agent" matches `setup-sponsor-friend`,
 * `peer-list`, AND `relay-status` with score 1
 * each) should NOT be force-routed to the wrong
 * skill. Ties fall through to the v1.1 free-form
 * LLM ask, which is the safe default.
 *
 * **Pure function:** no I/O, no `process.env`
 * reads, no clock. Tests assert on the return
 * value. The `signalOptIn` field is passed in
 * (the host reads the env var and threads it
 * through).
 */
export function routeUserPrompt(
  input: RouteUserPromptInput,
): RouteUserPromptDecision {
  // 1. Opt-in check. When disabled, no signal
  //    can opt in to envoy-harness.
  if (input.signalOptIn === "disabled") {
    return {
      runtime: "openclaw",
      reason: "opt-in-disabled",
      signals: [],
      hintPrefixLength: undefined,
      targetSkill: undefined,
      // v1.5 — no hints when opt-in is
      // disabled (the router short-circuits).
      costCapUsd: undefined,
      providerHint: undefined,
      cleanPrompt: input.prompt,
    };
  }

  // 2. v1.5 — extract inline hints
  //    (`/cost:N`, `/provider:NAME`) from the
  //    prompt. The hints are stripped from the
  //    cleanPrompt (the LLM doesn't see them);
  //    the parsed values are returned on the
  //    decision for the dispatch. The original
  //    `input.prompt` is preserved (the signal
  //    scan uses the original — a signal after
  //    the hint still fires).
  const { cleanPrompt, hints } = extractPromptHints(input.prompt);

  // 2a. Scan the **original** prompt for signals
  //     (so a signal after the hint still fires).
  //     v1.1 — pass the dynamic `envoyHarnessTags`
  //     from the merged manifest (per Q2 / Q7 of
  //     the v1.1 sub-plan). The scanner uses the
  //     dynamic vocabulary when provided; falls
  //     back to the v0 `MESH_KEYWORDS` when
  //     undefined.
  //
  //     v1.9 — the v1.1 + v1.7 callers migrate to
  //     read from `runtimeTags["envoy-harness"]`
  //     (the per-runtime tag map). The old
  //     `envoyHarnessTags` field is the fallback
  //     when `runtimeTags` is undefined (Q5 of the
  //     v1.9 sub-plan — backward compat).
  const envoyHarnessVocabulary =
    input.runtimeTags?.["envoy-harness"] ?? input.envoyHarnessTags;
  const originalSignals = scanSignals(
    input.prompt,
    envoyHarnessVocabulary,
  );

  // 2b. v1.6 — re-scan the **cleanPrompt** for v0
  //     prefixes. Fixes the v0 corner case where a
  //     v1.5 inline hint before a v0 prefix (e.g.
  //     `/cost:0.5 !eh translate this`) would mask
  //     the v0 prefix because step 2a scans the
  //     **original** prompt (not the cleanPrompt).
  //     The result: the LLM would see
  //     `!eh translate this` (the `!eh` is leaked).
  //
  //     **Why only use the cleanPrompt's signal
  //     when the original missed it** (Q8 of the
  //     v1.6 sub-plan): the original is the
  //     "explicit" prefix; the cleanPrompt's prefix
  //     is "derived" (post v1.5 strip). When both
  //     are present, the original wins (the user
  //     typed the original prefix first). When the
  //     original missed (because a v1.5 hint masked
  //     it), the cleanPrompt's prefix is the
  //     "true" prefix.
  const cleanPromptSignals = scanSignals(
    cleanPrompt,
    envoyHarnessVocabulary,
  );
  const originalHasExplicitHint = originalSignals.some(
    (s) => s.category === "explicit-hint",
  );
  const cleanPromptHasExplicitHint = cleanPromptSignals.some(
    (s) => s.category === "explicit-hint",
  );
  const signals =
    cleanPromptHasExplicitHint && !originalHasExplicitHint
      ? cleanPromptSignals
      : originalSignals;

  // 2c. v1.6 — opt-out: `!openclaw` at the start
  //     of the (final) signal list routes to
  //     OpenClaw unconditionally (Q1 + Q3 + Q4 of
  //     the v1.6 sub-plan). The v1.5 hints are
  //     recorded on the decision (for the audit
  //     log) but NOT threaded to the OpenClaw
  //     runtime (the dispatch ignores them on the
  //     OpenClaw path — OpenClaw doesn't have a
  //     hint concept).
  //
  //     **Case-insensitive compare:** the v0
  //     prefix scan captures the **original-case**
  //     token (e.g. `!OPENCLAW` from a typed
  //     uppercase prompt); the opt-out check
  //     lowercases both sides so `!OPENCLAW`,
  //     `!Openclaw`, `!openclaw` all match.
  const explicitHint = signals.find(
    (s) => s.category === "explicit-hint",
  );
  if (explicitHint?.token.toLowerCase() === "!openclaw") {
    return {
      runtime: "openclaw",
      reason: "opt-out-explicit",
      signals,
      hintPrefixLength: explicitHint.token.length, // 9
      targetSkill: undefined,
      costCapUsd: hints.costCapUsd,
      providerHint: hints.providerHint,
      cleanPrompt,
    };
  }

  // 2d. v1.7 — negative-signal scan. When the
  //     prompt matches any OpenClaw tag in the
  //     manifest, the router routes to OpenClaw
  //     (the negative rule). This VETOES the
  //     positive (envoy-harness) signals — see
  //     Q2 of the v1.7 sub-plan.
  //
  //     **Precedence with v0 prefixes (Q3):**
  //     the explicit v0 prefix `!eh` (or `/eh`)
  //     wins over the implicit OpenClaw tag.
  //     The user explicitly typed `!eh` to
  //     force EH; the OpenClaw tag is just an
  //     incidental match. We check the
  //     explicit-hint signal here: when the
  //     hint is `!eh` or `/eh`, skip the
  //     negative-signal scan (the explicit
  //     prefix overrides the implicit tag).
  //     When the hint is `!openclaw`, we
  //     already returned in step 2c.
  const explicitHintKind =
    explicitHint?.token.toLowerCase() ?? undefined;
  const hasExplicitEhPrefix =
    explicitHintKind === "!eh" || explicitHintKind === "/eh";
  if (!hasExplicitEhPrefix) {
    // v1.9 — the v1.7 negative-signal scan
    // uses `runtimeTags["openclaw"]` (the
    // per-runtime map) with fallback to
    // `input.openClawTags` (the old v1.7
    // field, preserved for backward compat).
    const openClawVocabulary =
      input.runtimeTags?.["openclaw"] ?? input.openClawTags;
    const openClawSignals = scanOpenClawSignals(
      input.prompt,
      openClawVocabulary,
      signals,
    );
    if (openClawSignals.length > 0) {
      return {
        runtime: "openclaw",
        reason: "openclaw-tag-match",
        signals: [...signals, ...openClawSignals],
        // The hint prefix is honored even when
        // the negative signal wins (e.g. the
        // user typed `!eh write a story` —
        // the !eh is still a v0 prefix, just
        // overridden by the OpenClaw tag).
        // When the explicit-hint is !openclaw,
        // we already returned in step 2c.
        hintPrefixLength: signals[0]?.category === "explicit-hint"
          ? signals[0].token.length
          : undefined,
        targetSkill: undefined,
        costCapUsd: hints.costCapUsd,
        providerHint: hints.providerHint,
        cleanPrompt,
      };
    }
  }

  // 3. No signals → default OpenClaw.
  if (signals.length === 0) {
    return {
      runtime: "openclaw",
      reason: "default",
      signals: [],
      hintPrefixLength: undefined,
      targetSkill: undefined,
      costCapUsd: hints.costCapUsd,
      providerHint: hints.providerHint,
      cleanPrompt,
    };
  }

  // 4. v1.2 — per-skill matching. When the
  //    envoy-harness skills list is provided,
  //    pick the best-match skill by tag count
  //    (Q1 — uniquely-held threshold; tie → fall
  //    through to v1.1 free-form LLM ask).
  const targetSkill =
    input.envoyHarnessSkills && input.envoyHarnessSkills.length > 0
      ? pickTargetSkill(input.prompt, input.envoyHarnessSkills)
      : undefined;

  // 5. Signals matched. Decide based on
  //    envoy-harness readiness.
  if (input.isEnvoyHarnessReady) {
    // 5a. v1.2 — per-skill dispatch when a
    //     unique skill matched.
    if (targetSkill !== undefined) {
      return {
        runtime: "envoy-harness",
        reason: "signal-skill",
        signals,
        hintPrefixLength: signals[0]?.category === "explicit-hint"
          ? signals[0].token.length
          : undefined,
        targetSkill,
        costCapUsd: hints.costCapUsd,
        providerHint: hints.providerHint,
        cleanPrompt,
      };
    }
    // 5b. v1.1 — free-form LLM ask (also v1.2's
    //     tie-fall-through path).
    return {
      runtime: "envoy-harness",
      reason: "signal",
      signals,
      hintPrefixLength: signals[0]?.category === "explicit-hint"
        ? signals[0].token.length
        : undefined,
      targetSkill: undefined,
      costCapUsd: hints.costCapUsd,
      providerHint: hints.providerHint,
      cleanPrompt,
    };
  }

  return {
    runtime: "openclaw",
    reason: "envoy-harness-unready",
    signals,
    hintPrefixLength: signals[0]?.category === "explicit-hint"
      ? signals[0].token.length
      : undefined,
    targetSkill: undefined,
    costCapUsd: hints.costCapUsd,
    providerHint: hints.providerHint,
    cleanPrompt,
  };
}

// ---------------------------------------------------------------------------
// Signal scanner (internal)
// ---------------------------------------------------------------------------

/**
 * Scan a prompt for all matched signals.
 *
 * **Order:** the first match in each category
 * wins. The combined list is sorted by offset
 * (so the hint prefix, when present, is at
 * offset 0).
 *
 * **Why substring (not word-boundary) for
 * keywords in v0:** the signal set is small
 * enough that false positives are cheap, and
 * word-boundary matching would miss legitimate
 * cases like `"Mesh-based federated scoreboard"`
 * (where `Mesh` is capitalized, plural, or
 * hyphenated). v1.1 replaces the v0 substring
 * mesh vocabulary with a word-boundary regex
 * against the merged manifest's envoy-harness
 * skill tags (the v1.1 primary path); the v0
 * substring mesh vocabulary remains as a
 * private fallback for callers that haven't
 * been updated to read the manifest.
 *
 * **v1.1 dynamic tag scan (4):** when
 * `envoyHarnessTags` is provided, scan the
 * prompt for any manifest tag using a word-
 * boundary regex (single-word tags) or exact
 * substring (hyphenated tags). The first
 * occurrence wins per tag. The reported `token`
 * is the original-case substring of the prompt.
 */
function scanSignals(
  prompt: string,
  envoyHarnessTags: ReadonlyArray<string> | undefined,
): ReadonlyArray<SignalMatch> {
  const signals: SignalMatch[] = [];
  const lower = prompt.toLowerCase();

  // 2a. Explicit hint prefix at the start of
  //     the trimmed prompt. The hint is the
  //     first match.
  //
  // **Word boundary after the hint:** the hint
  // must be followed by whitespace or end-of-
  // string. Otherwise `!ehSomething` would
  // match (it's just a word, not a command).
  // The regex `^!eh(\s|$)` captures the
  // contract.
  const trimmed = prompt.trimStart();
  const trimOffset = prompt.length - trimmed.length;
  for (const hint of HINT_PREFIXES) {
    // `!` and `/` are not regex metachars; the
    // hints are safe to inline. The `\s|$`
    // anchor ensures the hint is a real
    // command, not a substring of a word.
    const hintRe = new RegExp(`^${hint}(\\s|$)`, "i");
    if (hintRe.test(trimmed)) {
      // Capture the original-case token (e.g.
      // `!EH` → token is `!EH`). The dispatch
      // uses `token.length` to strip, which is
      // case-insensitive length (always 3).
      const token = trimmed.slice(0, hint.length);
      signals.push({
        token,
        category: "explicit-hint",
        offset: trimOffset,
      });
      break;
    }
  }

  // 2b. Tool names. Case-insensitive substring.
  //     First occurrence wins per tool. The
  //     reported `token` is the **original-case**
  //     substring of the prompt (not the lowercased
  //     keyword) so the UI can show what the user
  //     actually typed.
  for (const name of TOOL_NAMES) {
    const offset = lower.indexOf(name.toLowerCase());
    if (offset >= 0) {
      signals.push({
        token: prompt.slice(offset, offset + name.length),
        category: "tool-name",
        offset,
      });
    }
  }

  // 2c. lsp_* regex. First match wins. Same
  //     original-case token rule as above.
  const lspMatch = lower.match(LSP_REGEX);
  if (lspMatch && typeof lspMatch.index === "number") {
    signals.push({
      token: prompt.slice(lspMatch.index, lspMatch.index + lspMatch[0].length),
      category: "tool-name",
      offset: lspMatch.index,
    });
  }

  // 2d. v1.1 dynamic tag scan (per Q2 + Q7 of the
  //     v1.1 sub-plan). When `envoyHarnessTags`
  //     is provided, scan the prompt for any
  //     manifest tag. When `undefined`, fall
  //     back to the v0 `MESH_KEYWORDS` constant
  //     for backward compat (per Q1).
  const meshVocabulary = envoyHarnessTags ?? MESH_KEYWORDS;
  for (const tag of meshVocabulary) {
    const offset = findTagInPrompt(lower, tag);
    if (offset >= 0) {
      signals.push({
        token: prompt.slice(offset, offset + tag.length),
        category: "mesh-keyword",
        offset,
      });
    }
  }

  // Sort by offset for stable output. Tests
  // assert the order; UI badges expect a
  // deterministic sequence.
  return [...signals].sort((a, b) => a.offset - b.offset);
}

/**
 * Find the first occurrence of a tag in the
 * lowercased prompt.
 *
 * **Algorithm (per Q2 of the v1.1 sub-plan):**
 * - Hyphenated tags (e.g. `cross-node`,
 *   `lsp-goto`): exact substring match. Word
 *   boundary doesn't make sense for hyphenated
 *   tokens (the `-` is part of the tag).
 * - Single-word tags (e.g. `mesh`, `code`,
 *   `bond`): word-boundary regex. This cleans
 *   up the v0 substring FP (Q6 follow-up) —
 *   `meshes` no longer matches `mesh`, `codes`
 *   no longer matches `code`.
 *
 * **Why not always word-boundary:** word
 * boundary requires the tag to be surrounded by
 * non-word characters. For hyphenated tags,
 * `-` is a non-word character, so `\bmesh\b`
 * would only match `mesh` followed by `-` (e.g.
 * `mesh-based`), not `mesh` followed by a
 * letter. For hyphenated tags, exact substring
 * is the cleaner contract.
 *
 * **Returns:** the byte offset of the first
 * match in the lowercased prompt, or `-1` if
 * no match.
 */
function findTagInPrompt(lower: string, tag: string): number {
  if (tag.includes("-")) {
    const idx = lower.indexOf(tag.toLowerCase());
    return idx;
  }
  const re = new RegExp(`\\b${escapeRegex(tag)}\\b`, "i");
  const m = lower.match(re);
  return m?.index ?? -1;
}

/**
 * Escape regex metacharacters in a literal
 * string. Used to make tag values safe to
 * inline into a `RegExp` constructor.
 */
function escapeRegex(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ---------------------------------------------------------------------------
// Phase 8 / v1.7 — negative-signal scan
// ---------------------------------------------------------------------------

/**
 * Phase 8 / v1.7 — scan the prompt for tags
 * that match an OpenClaw skill (the
 * negative-signal vocabulary). Returns the
 * matched OpenClaw signals (token + offset).
 *
 * **Algorithm (per Q1 / Q4 / Q5 of the v1.7
 * sub-plan):**
 * 1. Iterate `openClawTags` (the manifest's
 *    OpenClaw tag list).
 * 2. For each tag, check if the prompt
 *    contains the tag (word-boundary for
 *    single-word tags; exact substring for
 *    hyphenated tags — same as v1.1).
 * 3. **Exclude tags that are also in the EH
 *    tag list** (Q4): when an EH skill AND
 *    an OpenClaw skill share a tag, the EH
 *    tag wins (positive signal takes
 *    precedence over the negative rule for
 *    the same tag).
 * 4. Return the matched OpenClaw signals.
 *
 * **Why exclude shared tags:** if both the
 * EH adapter and the OpenClaw adapter
 * define a tag (e.g. "mesh"), the user's
 * intent is ambiguous. The v1.7 design
 * chooses the positive rule (EH wins) — the
 * user can use `!openclaw` to force OpenClaw
 * for the shared tag.
 *
 * **When `openClawTags` is `undefined` or
 * `[]`:** the function returns `[]` (no
 * negative signal scan; v1.6 behavior
 * preserved).
 */
function scanOpenClawSignals(
  prompt: string,
  openClawTags: ReadonlyArray<string> | undefined,
  existingSignals: ReadonlyArray<SignalMatch>,
): ReadonlyArray<SignalMatch> {
  if (!openClawTags || openClawTags.length === 0) {
    return [];
  }
  const lower = prompt.toLowerCase();
  // Build a set of EH tags from the existing
  // signals (so we can exclude OpenClaw tags
  // that are also EH tags; Q4 of the v1.7
  // sub-plan).
  const existingMeshTags = new Set(
    existingSignals
      .filter((s) => s.category === "mesh-keyword")
      .map((s) => s.token.toLowerCase()),
  );
  const matched: SignalMatch[] = [];
  for (const tag of openClawTags) {
    if (existingMeshTags.has(tag.toLowerCase())) {
      // The tag is also an EH tag — the
      // positive rule wins. Skip.
      continue;
    }
    const offset = findTagInPrompt(lower, tag);
    if (offset >= 0) {
      matched.push({
        token: prompt.slice(offset, offset + tag.length),
        category: "mesh-keyword",
        offset,
      });
    }
  }
  return matched;
}

// ---------------------------------------------------------------------------
// Phase 8 / v1.5 — inline hint extraction
// ---------------------------------------------------------------------------

/**
 * Phase 8 / v1.5 — the parsed inline hints
 * from the user's prompt. The router extracts
 * these from the prompt text + strips them
 * before the LLM sees the prompt.
 *
 * **Both fields are optional** — a prompt
 * without hints is valid (the v0 behavior).
 * The dispatch uses `costCapUsd` only when
 * `ENVOY_HARNESS_COST_CAP_ENABLED=1` is set
 * (Q9 + Q10 of the v1.5 sub-plan); the
 * provider hint always works (no flag).
 */
export interface ParsedPromptHints {
  /**
   * Per-call cost cap (USD). Parsed from
   * `/cost:N` in the prompt. When `NaN`/
   * invalid (e.g. `/cost:abc`), the dispatch
   * falls back to the per-skill default
   * (Q4 of the v1.5 sub-plan).
   */
  costCapUsd?: number;
  /**
   * Provider name (e.g. `"openai"`,
   * `"ollama"`). Parsed from `/provider:NAME`
   * in the prompt. When unknown (e.g.
   * `/provider:foo`), the dispatch falls back
   * to the node's default (Q5 of the v1.5
   * sub-plan).
   */
  providerHint?: string;
}

/**
 * Phase 8 / v1.5 — extract inline hints
 * (`/cost:N`, `/provider:NAME`) from the
 * prompt.
 *
 * **Pure function:** no side effects.
 *
 * **Hunt-and-strip:** the function finds
 * all matching tokens (anywhere in the
 * prompt, case-insensitive) and returns:
 * 1. The clean prompt (with the hints
 *    stripped + trimmed + whitespace
 *    collapsed). The LLM sees the clean
 *    prompt; the user never sees the hints
 *    in the chat reply.
 * 2. The parsed hints (deduplicated; first
 *    occurrence wins on ties).
 *
 * **What it doesn't do:** it doesn't
 * validate the hint values. A `/cost:abc`
 * would set `costCapUsd: NaN`; the
 * dispatch (caller) checks `Number.isFinite`
 * + falls back to the per-skill default for
 * invalid values.
 *
 * **Why the slash is required:** the
 * plain `cost:0.5` (no slash) is too
 * ambiguous — it would match legitimate
 * English text. The slash is the "command
 * marker" (consistent with the v0 `/eh`
 * prefix and the inline `lsp_*` family).
 *
 * @example
 * extractPromptHints("explain mesh /cost:0.5 /provider:openai")
 * // → {
 * //     cleanPrompt: "explain mesh",
 * //     hints: { costCapUsd: 0.5, providerHint: "openai" },
 * //   }
 *
 * @param prompt The raw prompt text.
 * @returns The clean prompt + the parsed hints.
 */
export function extractPromptHints(prompt: string): {
  cleanPrompt: string;
  hints: ParsedPromptHints;
} {
  const hints: ParsedPromptHints = {};
  // Replace each match with an empty string.
  // The regex is global + case-insensitive,
  // so we iterate over all matches.
  const cleanPrompt = prompt.replace(INLINE_HINT_REGEX, (match, kind, value) => {
    const lowerKind = (kind as string).toLowerCase();
    const val = (value as string).toLowerCase();
    if (lowerKind === "cost" && hints.costCapUsd === undefined) {
      const parsed = Number.parseFloat(val);
      // NaN → undefined; the dispatch
      // handles invalid values (Q4 of the
      // v1.5 sub-plan). We record `undefined`
      // here so the field is absent.
      if (Number.isFinite(parsed)) {
        hints.costCapUsd = parsed;
      }
    } else if (lowerKind === "provider" && hints.providerHint === undefined) {
      hints.providerHint = val;
    }
    return ""; // Strip the hint.
  });
  // Collapse multiple spaces + trim. The
  // LLM doesn't care about extra whitespace
  // (mostly); the trim removes leading/
  // trailing space from the strip.
  const collapsed = cleanPrompt.replace(/\s+/g, " ").trim();
  return { cleanPrompt: collapsed, hints };
}

// ---------------------------------------------------------------------------
// Phase 8 / v1.2 — per-skill matching
// ---------------------------------------------------------------------------

/**
 * Pick the best-match envoy-harness skill for the
 * prompt, using a tag-count score.
 *
 * **Algorithm (Q1 of the v1.2 sub-plan):**
 * 1. Score each skill by the number of its tags
 *    that appear in the prompt (word-boundary for
 *    single-word tags, exact substring for
 *    hyphenated tags — same `findTagInPrompt`
 *    helper used by the v1.1 tag scan).
 * 2. The skill with the highest score wins.
 * 3. **Uniquely-held threshold:** the top score
 *    must be **strictly greater** than the
 *    second-best skill's score. If 2+ skills tie
 *    for the top score, return `undefined` (the
 *    caller falls through to the v1.1 free-form
 *    LLM ask).
 * 4. If the top score is 0 (no tags matched),
 *    return `undefined`.
 * 5. If the skills list is empty, return
 *    `undefined`.
 *
 * **Tiebreak (Q3):** the algorithm tracks
 * `secondBestScore` as it iterates. Ties
 * naturally fall through (top === second).
 * Insertion order is the iteration order, but
 * the unique-threshold makes it moot. Kept as a
 * 3-line insurance policy for v1.3+ (when the
 * threshold could be loosened).
 *
 * **Why not the v1.1 `MESH_KEYWORDS` fallback:**
 * the per-skill matching is independent of the
 * v1.1 signal scan. The v1.1 fallback only
 * applies to the signal scan; if the manifest
 * is unavailable, the v1.2 caller should pass
 * `envoyHarnessSkills: undefined` (and the router
 * skips the per-skill step entirely).
 *
 * @param prompt The raw prompt (lowercased
 *   internally; original case is preserved for
 *   the `signals` field).
 * @param skills The structured skill list
 *   (from `input.envoyHarnessSkills`).
 * @returns The `skillId` of the unique best
 *   match, or `undefined` on tie / no match.
 */
export function pickTargetSkill(
  prompt: string,
  skills: ReadonlyArray<EnvoyHarnessSkillEntry>,
): string | undefined {
  if (skills.length === 0) return undefined;
  const lower = prompt.toLowerCase();
  let best: { skillId: string; score: number } | undefined;
  let secondBestScore = 0;
  for (const skill of skills) {
    const score = scoreSkill(lower, skill.tags);
    if (score === 0) continue;
    if (best === undefined || score > best.score) {
      // New best. The old best becomes the new
      // second-best (preserves Q3 insertion-order
      // tiebreak if Q1 is ever loosened).
      secondBestScore = best?.score ?? 0;
      best = { skillId: skill.skillId, score };
    } else if (score > secondBestScore) {
      secondBestScore = score;
    }
  }
  if (best === undefined) return undefined;
  // Q1 — uniquely-held. Tie → fall through.
  if (best.score === secondBestScore) return undefined;
  return best.skillId;
}

/**
 * Score a skill by the number of its tags that
 * appear in the lowercased prompt. Pure function;
 * no side effects.
 *
 * **Matching algorithm:** same as v1.1's
 * `findTagInPrompt` (word-boundary regex for
 * single-word tags; exact substring for
 * hyphenated tags). A tag that doesn't match
 * contributes 0; a tag that matches contributes
 * 1 (we count tags, not occurrences).
 *
 * @param lower The lowercased prompt.
 * @param tags The skill's tags.
 * @returns The count of matched tags (0..N).
 */
function scoreSkill(lower: string, tags: ReadonlyArray<string>): number {
  let score = 0;
  for (const tag of tags) {
    if (findTagInPrompt(lower, tag) >= 0) score++;
  }
  return score;
}

// ---------------------------------------------------------------------------
// Env-var helper (host-side seam)
// ---------------------------------------------------------------------------

/**
 * Read the signal opt-in flag from
 * `process.env.ENVOY_HARNESS_SIGNAL_OPT_IN`.
 *
 * **Default:** `"enabled"`. The owner has to
 * explicitly set the env var to `"disabled"`
 * to opt out.
 *
 * **Why a separate function:** the router is
 * pure (it takes `signalOptIn` as input). The
 * host reads the env var once at the call site
 * and threads the value in. Tests don't have
 * to mock `process.env`.
 */
export function readSignalOptInEnv(): "enabled" | "disabled" {
  const raw = process.env[SIGNAL_OPT_IN_ENV_VAR];
  if (typeof raw === "string" && raw.toLowerCase() === "disabled") {
    return "disabled";
  }
  return "enabled";
}
