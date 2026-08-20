/**
 * Phase 8 / Step 5 — Tauri user-prompt signal router.
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
 */
const HINT_PREFIXES: ReadonlyArray<string> = ["!eh", "/eh"];

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
    };
  }

  // 2. Scan the prompt for signals.
  //    v1.1 — pass the dynamic `envoyHarnessTags`
  //    from the merged manifest (per Q2 / Q7 of
  //    the v1.1 sub-plan). The scanner uses the
  //    dynamic vocabulary when provided; falls
  //    back to the v0 `MESH_KEYWORDS` when
  //    undefined.
  const signals = scanSignals(input.prompt, input.envoyHarnessTags);

  // 3. No signals → default OpenClaw.
  if (signals.length === 0) {
    return {
      runtime: "openclaw",
      reason: "default",
      signals: [],
      hintPrefixLength: undefined,
      targetSkill: undefined,
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
