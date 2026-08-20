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
 * **v0 deferred:**
 * - Cost cap (requires UI affordance `/cost:0.5`)
 * - Multi-provider (requires UI affordance `/provider:openai`)
 * - Capability-tag-based detection (v1 — once the merged
 *   manifest exposes structured capability tags)
 * - Word-boundary tightening (v1)
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
 *    `isEnvoyHarnessReady === true`. Return
 *    envoy-harness.
 * 4. **`envoy-harness-unready`** — signals matched
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
    };
  }

  // 2. Scan the prompt for signals.
  const signals = scanSignals(input.prompt);

  // 3. No signals → default OpenClaw.
  if (signals.length === 0) {
    return {
      runtime: "openclaw",
      reason: "default",
      signals: [],
      hintPrefixLength: undefined,
    };
  }

  // 4. Signals matched. Decide based on
  //    envoy-harness readiness.
  if (input.isEnvoyHarnessReady) {
    return {
      runtime: "envoy-harness",
      reason: "signal",
      signals,
      hintPrefixLength: signals[0]?.category === "explicit-hint"
        ? signals[0].token.length
        : undefined,
    };
  }

  return {
    runtime: "openclaw",
    reason: "envoy-harness-unready",
    signals,
    hintPrefixLength: signals[0]?.category === "explicit-hint"
      ? signals[0].token.length
      : undefined,
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
 * hyphenated). v1 will tighten to a smarter
 * matcher that uses the merged manifest's
 * capability tags.
 */
function scanSignals(prompt: string): ReadonlyArray<SignalMatch> {
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

  // 2d. Mesh keywords. Case-insensitive substring.
  //     First occurrence wins per keyword. Same
  //     original-case token rule.
  for (const keyword of MESH_KEYWORDS) {
    const offset = lower.indexOf(keyword);
    if (offset >= 0) {
      signals.push({
        token: prompt.slice(offset, offset + keyword.length),
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
