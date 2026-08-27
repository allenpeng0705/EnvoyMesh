/**
 * Phase 8 / v1.3 — per-skill formatters for the
 * B-class skills (setup-sponsor-friend / peer-list
 * / relay-status). The formatters turn each
 * skill's structured `tool-result` block into a
 * chat-friendly 1-line (success) or verbose
 * multi-line (failure) summary.
 *
 * **What this is:** the bridge between envoy-harness's
 * structured B-class result data and the Tauri
 * user-prompt chat surface (which expects a string).
 *
 * **Why per-skill:** each B-class skill has its own
 * result shape (`BClassSponsorFriendResult` /
 * `PeerListResult` / `BClassRelayStatusResult`).
 * Generic key-value dumps lose the meaning; per-
 * skill formatters produce summaries the user can
 * read at a glance.
 *
 * **Format style (Q1 / Q2 of the v1.3 sub-plan):**
 * - Success → 1-line summary (compact; matches the
 *   v1.2 token-style summaries).
 * - Failure → verbose multi-line with all
 *   `setupSponsorFriend*` fields (failures are
 *   rare; full context is justified).
 * - Skipped → "skipped: <reason> (<context>)"
 *   (Q3 — show reason + relevant context).
 *
 * **Where this lives:** host (`apps/node`), not
 * adapter. The adapter is for `execute()`; the
 * host formats for the chat surface (Q4).
 *
 * **Test fixtures:** real bridge imports (Q7) —
 * the formatters take the bridge's typed results.
 *
 * **Stability:** the public surface is
 * `formatBClassResult(skillId, data)` +
 * `getBClassFormatter(skillId)` + the per-skill
 * formatters + `B_CLASS_FORMATTERS`. Additive;
 * new B-class skills add a new entry to the map.
 */

import type {
  BClassSponsorFriendResult,
  BClassRelayStatusResult,
  PeerListResult,
} from "@envoymesh/envoy-harness-adapter";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * A function that formats a B-class skill's
 * parsed result as a chat-friendly string.
 *
 * **Input:** the `data.content` field of a
 *   `tool-result` structured block, parsed as
 *   `unknown` (the JSON shape is typed; the
 *   formatter casts to the right shape).
 *
 * **Output:** a chat string. 1-line for success /
 *   skipped; verbose multi-line for failure.
 *   Multi-block tool results join the tool-call
 *   summary (if any) + the tool-result summary
 *   with `\n\n`.
 */
export type BClassFormatter = (data: unknown) => string;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Truncate a peerId for chat display (Q8 of the
 * v1.3 sub-plan). First 16 chars + `...` matches
 * the existing bond-trace chat UX pattern. The
 * user can copy the full peerId from the
 * bond-trace panel if they need it.
 */
function truncatePeerId(peerId: string | undefined): string {
  if (typeof peerId !== "string" || peerId.length === 0) {
    return "(unknown)";
  }
  if (peerId.length <= 16) return peerId;
  return `${peerId.slice(0, 16)}...`;
}

/**
 * Format a date string for the chat UI. ISO 8601
 * dates get shortened to `YYYY-MM-DD HH:MM UTC`;
 * non-ISO strings are returned as-is. Defensive
 * against `undefined` / invalid input.
 */
function formatDate(dateStr: string | undefined): string {
  if (typeof dateStr !== "string" || dateStr.length === 0) {
    return "(unknown)";
  }
  const t = Date.parse(dateStr);
  if (Number.isNaN(t)) return dateStr;
  const d = new Date(t);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const min = String(d.getUTCMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${min} UTC`;
}

// ---------------------------------------------------------------------------
// Per-skill formatters
// ---------------------------------------------------------------------------

/**
 * Format a `BClassSponsorFriendResult` as a chat
 * summary. Mirrors the bridge's result shape
 * (see `@envoymesh/envoy-harness-adapter/src/b-class-skills/sponsor-friend.ts:131`).
 *
 * **Format style (Q1 / Q2 / Q3 + end-user-first
 * principle from `AGENTS.md`):**
 * - Success (`ok: true`, not skipped) → 1-line,
 *   user-readable: "Bonded with sponsor (12D3KooWSX7iGZC9...)"
 * - Skipped (`ok: true, skipped: true`) → 1-line
 *   with the reason + the next-step hint:
 *   "Sponsor bond: cooldown (until 2026-08-22 15:00 UTC) — wait or click Retry"
 * - Failure (`ok: false`) → multi-line with a
 *   user-readable headline ("Couldn't set up the
 *   sponsor bond.") + a plain-language cause
 *   ("The network kept dropping.") + a next-step
 *   hint ("Click Retry, or check your relay is
 *   online.") + a technical-details block at the
 *   bottom (for power users / audit log).
 *   **The technical block is INSIDE the chat
 *   reply** (Q2 wants verbose), but the user-
 *   readable part is on top.
 * - Unknown shape → "Sponsor bond: unknown shape"
 *   (graceful degradation; Q6 silent fall-through
 *   for the dispatcher).
 */
export function formatSponsorFriendResult(data: unknown): string {
  const r = data as Partial<BClassSponsorFriendResult> | undefined;
  if (r === undefined || r === null || typeof r !== "object") {
    return "Sponsor bond: unknown shape";
  }

  // Success path.
  if (r.ok === true) {
    if (r.skipped === true) {
      // Skipped reasons: already-completed,
      // disabled-or-incomplete, already-bonded,
      // cooldown, profile-not-ready,
      // mesh-not-ready, single-flight.
      const reason = r.reason ?? "skipped";
      const lines: string[] = [];
      lines.push(`Sponsor bond: ${reason}`);
      if (r.cooldownUntil !== undefined) {
        lines[0] += ` (cooldown until ${formatDate(r.cooldownUntil)})`;
      }
      // Next-step hint (end-user-first).
      const hint = skippedReasonHint(reason);
      if (hint !== undefined) {
        lines.push(`What to do: ${hint}`);
      }
      if (r.ownerId !== undefined) {
        lines.push(`(sponsor: ${truncatePeerId(r.ownerId)})`);
      }
      return lines.join("\n");
    }
    // Bond succeeded — 1-line, user-friendly.
    const parts: string[] = ["Bonded with sponsor"];
    if (r.ownerId !== undefined) {
      parts.push(`(${truncatePeerId(r.ownerId)})`);
    }
    if (r.attempts !== undefined && r.attempts > 0) {
      parts.push(
        `after ${r.attempts} attempt${r.attempts === 1 ? "" : "s"}`,
      );
    }
    return parts.join(" ");
  }

  // Failure path — user-readable headline + cause
  // + next-step + technical details (Q2 verbose,
  // end-user-first ordering).
  const { reason, lastErrorKind, attempts, ownerId, cooldownUntil, finalNote } =
    getFailureFields(r);
  const lines: string[] = [];
  lines.push("Couldn't set up the sponsor bond.");
  // Plain-language cause (translated from
  // lastErrorKind / reason / finalNote).
  const cause = failureCause(reason, lastErrorKind, finalNote);
  if (cause !== undefined) {
    lines.push(cause);
  }
  // Next-step hint.
  lines.push("What to do: " + failureHint(reason, lastErrorKind));
  // Technical details block (Q2 verbose — all the
  // setupSponsorFriend* fields the bridge wrote,
  // for power users + the audit log).
  lines.push("");
  lines.push("[debug details:]");
  if (reason !== undefined) {
    lines.push(`  reason: ${reason}`);
  }
  if (lastErrorKind !== undefined) {
    lines.push(`  lastErrorKind: ${lastErrorKind}`);
  }
  if (attempts !== undefined) {
    lines.push(`  attempts: ${attempts}`);
  }
  if (ownerId !== undefined) {
    lines.push(`  ownerId: ${truncatePeerId(ownerId)}`);
  }
  if (cooldownUntil !== undefined) {
    lines.push(`  cooldownUntil: ${formatDate(cooldownUntil)}`);
  }
  if (finalNote !== undefined) {
    lines.push(`  finalNote: ${finalNote}`);
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// End-user-friendly cause / hint helpers
// ---------------------------------------------------------------------------

/**
 * Extract the fields needed for the user-readable
 * cause / hint. Centralized so the failure path
 * doesn't repeat the field checks 3 times.
 */
function getFailureFields(r: Partial<BClassSponsorFriendResult>): {
  reason: string | undefined;
  lastErrorKind: string | undefined;
  attempts: number | undefined;
  ownerId: string | undefined;
  cooldownUntil: string | undefined;
  finalNote: string | undefined;
} {
  return {
    reason: r.reason,
    lastErrorKind: r.lastErrorKind,
    attempts: r.attempts,
    ownerId: r.ownerId,
    cooldownUntil: r.cooldownUntil,
    finalNote: r.finalNote,
  };
}

/**
 * Translate the failure's `reason` + `lastErrorKind`
 * into a plain-language cause for the user. Falls
 * back to the `finalNote` when the structured
 * fields don't give us a clear message.
 */
function failureCause(
  reason: string | undefined,
  lastErrorKind: string | undefined,
  finalNote: string | undefined,
): string | undefined {
  if (lastErrorKind === "network-unreachable") {
    return "Your relay is unreachable. The network kept dropping.";
  }
  if (lastErrorKind === "profile-not-ready") {
    return "Your profile isn't set up yet.";
  }
  if (lastErrorKind === "mesh-not-ready") {
    return "Your mesh isn't online yet.";
  }
  if (lastErrorKind === "protocol-mismatch") {
    return "The sponsor rejected the bond (protocol mismatch).";
  }
  if (lastErrorKind === "sponsor-no-ack") {
    return "The sponsor didn't acknowledge the bond request.";
  }
  if (lastErrorKind === "proof-token-mismatch") {
    return "The proof-of-context token didn't match.";
  }
  if (reason === "auto-exhausted") {
    return "Tried the maximum number of times.";
  }
  if (finalNote !== undefined) {
    return finalNote;
  }
  return undefined;
}

/**
 * Next-step hint for the user, based on the
 * failure's reason + lastErrorKind. End-user-
 * first (AGENTS.md): "click Retry" / "wait" /
 * "check your relay" instead of jargon.
 */
function failureHint(
  reason: string | undefined,
  lastErrorKind: string | undefined,
): string {
  if (lastErrorKind === "network-unreachable" || lastErrorKind === "sponsor-no-ack") {
    return "Check your relay is online, then click Retry in the bond panel.";
  }
  if (lastErrorKind === "profile-not-ready") {
    return "Set up your human profile first (the bond needs a hello message).";
  }
  if (lastErrorKind === "mesh-not-ready") {
    return "Wait for the mesh to come online, then click Retry.";
  }
  if (lastErrorKind === "protocol-mismatch" || lastErrorKind === "proof-token-mismatch") {
    return "The bundled sponsor-friend config may be out of date. Update the app, or contact the sponsor.";
  }
  if (reason === "auto-exhausted") {
    return "Click Retry in the bond panel to try again. The bond won't auto-retry.";
  }
  return "Click Retry in the bond panel, or check the bond-trace log for details.";
}

/**
 * Next-step hint for skipped results, based on
 * the `reason`. End-user-first (AGENTS.md).
 */
function skippedReasonHint(reason: string | undefined): string | undefined {
  switch (reason) {
    case "already-completed":
    case "already-bonded":
      return undefined; // No action needed.
    case "cooldown":
      return "wait for the cooldown to end, or click Retry in the bond panel.";
    case "profile-not-ready":
      return "set up your human profile first.";
    case "mesh-not-ready":
      return "wait for the mesh to come online.";
    case "disabled-or-incomplete":
      return "check the bond config in Settings.";
    case "single-flight":
      return "another bond run is in progress; wait for it to finish.";
    case "protocol-mismatch":
      return "the bundled sponsor-friend config may be out of date; update the app.";
    default:
      return undefined;
  }
}

/**
 * Format a `PeerListResult` as a chat summary.
 * Mirrors the bridge's result shape (see
 * `@envoymesh/envoy-harness-adapter/src/b-class-skills/peer-list.ts:101`).
 *
 * **Format style (Q1):**
 * - 1-line: "Observed N peers: 12D3Koo..., ... (and M more)"
 * - Top 3 peerIds shown, truncated to 16 chars.
 * - "and M more" hint when N > 3.
 * - 0 peers → "Observed 0 peers: (none)".
 * - Unknown shape → "Peer list: unknown shape".
 */
export function formatPeerListResult(data: unknown): string {
  const r = data as Partial<PeerListResult> | undefined;
  if (
    r === undefined ||
    r === null ||
    typeof r !== "object" ||
    !Array.isArray(r.entries) ||
    typeof r.total !== "number"
  ) {
    return "Peer list: unknown shape";
  }
  const top = r.entries.slice(0, 3);
  const topStr = top
    .map((e) => {
      const pid = truncatePeerId(e.peerId);
      return e.count > 0 ? `${pid} (${e.count} msg)` : pid;
    })
    .join(", ");
  const more = r.total - top.length;
  if (r.total === 0) {
    return `Observed 0 peers: (none)`;
  }
  if (more > 0) {
    return `Observed ${r.total} peers: ${topStr} (and ${more} more)`;
  }
  return `Observed ${r.total} peer${r.total === 1 ? "" : "s"}: ${topStr}`;
}

/**
 * Format a `BClassRelayStatusResult` as a chat
 * summary. Mirrors the bridge's result shape (see
 * `@envoymesh/envoy-harness-adapter/src/b-class-skills/relay-status.ts:139`).
 *
 * **Format style (Q1):**
 * - 1-line: "Relay 12D3Koo...: N peers, M book entries, K recent traces"
 *   (when the snapshot is populated)
 * - "Relay: disabled" or similar when disabled / no snapshot
 * - Unknown shape → "Relay status: unknown shape"
 *
 * **Note:** the bridge's result also has a `text`
 * field (multi-line CLI text). v1.3 does NOT use
 * it — the 1-line summary is the chat surface; the
 * `text` field is for the dev CLI (`showRelayStatus`).
 * The Tauri UI can render the `text` field as a
 * "details" expander in v1.4+.
 */
export function formatRelayStatusResult(data: unknown): string {
  const r = data as Partial<BClassRelayStatusResult> | undefined;
  if (r === undefined || r === null || typeof r !== "object") {
    return "Relay status: unknown shape";
  }
  if (r.snapshot === null || r.snapshot === undefined) {
    return "Relay: not running";
  }
  const snap = r.snapshot;
  // The snapshot nests counts:
  //   snap.relay.peerId / snap.relay.enabled
  //   snap.roster.total (peer count)
  //   snap.relayBook.total (book entries)
  //   snap.routing.recentTraces.length (trace count)
  // See `@envoymesh/envoy-harness-adapter/src/b-class-skills/relay-status.ts:51`
  // for the full BClassRelaySnapshot shape.
  if (snap.relay?.enabled === false) {
    return "Relay: disabled";
  }
  const relayId = truncatePeerId(snap.relay?.peerId);
  const peerCount = snap.roster?.total ?? 0;
  const bookCount = snap.relayBook?.total ?? 0;
  const traceCount = snap.routing?.recentTraces?.length ?? 0;
  return `Relay ${relayId}: ${peerCount} peers, ${bookCount} book entries, ${traceCount} recent traces`;
}

// ---------------------------------------------------------------------------
// Public surface
// ---------------------------------------------------------------------------

/**
 * The B-class formatter map. Keyed by `skillId`.
 * Each entry is a function that takes the parsed
 * JSON result + returns a chat string.
 */
export const B_CLASS_FORMATTERS: Readonly<Record<string, BClassFormatter>> = {
  "setup-sponsor-friend": formatSponsorFriendResult,
  "peer-list": formatPeerListResult,
  "relay-status": formatRelayStatusResult,
};

/**
 * Look up the B-class formatter for a given
 * `skillId`. Returns `undefined` when the skill
 * is not a B-class skill (e.g. a code skill —
 * those return `text` blocks, not `structured`).
 */
export function getBClassFormatter(
  skillId: string,
): BClassFormatter | undefined {
  return B_CLASS_FORMATTERS[skillId];
}

/**
 * Format a B-class skill's `tool-result` data as
 * a chat string. Returns `undefined` when no
 * formatter is registered for the skill.
 *
 * **Use this from the dispatcher** (`skill-result-formatter.ts`):
 * when the result's first block is a B-class
 * `tool-result`, call this. The returned string
 * is what the chat user sees.
 */
export function formatBClassResult(
  skillId: string,
  data: unknown,
): string | undefined {
  const formatter = getBClassFormatter(skillId);
  if (formatter === undefined) return undefined;
  return formatter(data);
}
