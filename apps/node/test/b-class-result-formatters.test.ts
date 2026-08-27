/**
 * Phase 8 / v1.3 — unit tests for the per-skill
 * B-class formatters.
 *
 * **What this covers:** the per-skill formatters
 * (`formatSponsorFriendResult` /
 * `formatPeerListResult` /
 * `formatRelayStatusResult`) + the
 * `B_CLASS_FORMATTERS` map + the
 * `getBClassFormatter` lookup. The dispatcher
 * integration is tested in
 * `skill-result-formatter.test.ts` + the e2e
 * tests in `run-owner-agent-turn-routing.test.ts`.
 *
 * **Test fixtures (Q7):** real bridge imports
 * (the formatters take the bridge's typed
 * results; tests use the real shapes).
 */
import { describe, expect, it } from "vitest";

import {
  B_CLASS_FORMATTERS,
  formatBClassResult,
  formatPeerListResult,
  formatRelayStatusResult,
  formatSponsorFriendResult,
  getBClassFormatter,
} from "../src/b-class-result-formatters.js";
import type {
  BClassRelayStatusResult,
  BClassSponsorFriendResult,
  PeerListResult,
} from "@envoymesh/envoy-harness-adapter";

// ---------------------------------------------------------------------------
// 1. formatSponsorFriendResult
// ---------------------------------------------------------------------------

describe("formatSponsorFriendResult", () => {
  it("formats a successful bond (1-line)", () => {
    const r: BClassSponsorFriendResult = {
      ok: true,
      ownerId: "12D3KooWSX7iGZC9z9Xj4Wp3KZv9qJf8K1Lt5Nm2P3Qr4UvYxZ",
      attempts: 3,
    };
    // 16-char truncation: "12D3KooWSX7iGZC9" + "..." (Q8)
    expect(formatSponsorFriendResult(r)).toBe(
      "Bonded with sponsor (12D3KooWSX7iGZC9...) after 3 attempts",
    );
  });

  it("formats a successful bond with 1 attempt (singular)", () => {
    const r: BClassSponsorFriendResult = { ok: true, ownerId: "12D3Koo", attempts: 1 };
    expect(formatSponsorFriendResult(r)).toBe(
      "Bonded with sponsor (12D3Koo) after 1 attempt",
    );
  });

  it("formats a skipped already-completed bond (no hint needed)", () => {
    const r: BClassSponsorFriendResult = {
      ok: true,
      skipped: true,
      reason: "already-completed",
      ownerId: "12D3KooWSX7iGZC9z9Xj4Wp3KZv9qJf8K1Lt5Nm2P3Qr4UvYxZ",
    };
    expect(formatSponsorFriendResult(r)).toBe(
      ["Sponsor bond: already-completed", "(sponsor: 12D3KooWSX7iGZC9...)"].join("\n"),
    );
  });

  it("formats a skipped cooldown bond with the timestamp + next-step hint", () => {
    const r: BClassSponsorFriendResult = {
      ok: true,
      skipped: true,
      reason: "cooldown",
      ownerId: "12D3Koo",
      cooldownUntil: "2026-08-22T15:00:00.000Z",
    };
    expect(formatSponsorFriendResult(r)).toBe(
      [
        "Sponsor bond: cooldown (cooldown until 2026-08-22 15:00 UTC)",
        "What to do: wait for the cooldown to end, or click Retry in the bond panel.",
        "(sponsor: 12D3Koo)",
      ].join("\n"),
    );
  });

  it("formats a skipped profile-not-ready bond (with hint, no ownerId)", () => {
    const r: BClassSponsorFriendResult = {
      ok: true,
      skipped: true,
      reason: "profile-not-ready",
    };
    expect(formatSponsorFriendResult(r)).toBe(
      [
        "Sponsor bond: profile-not-ready",
        "What to do: set up your human profile first.",
      ].join("\n"),
    );
  });

  it("formats a failed bond (user-readable headline + cause + next-step + debug block)", () => {
    // End-user-first: the headline is plain language,
    // the cause is translated from `lastErrorKind`,
    // the next-step is actionable. The `[debug details:]`
    // block at the bottom carries the raw fields (Q2
    // verbose — for power users + the audit log).
    const r: BClassSponsorFriendResult = {
      ok: false,
      reason: "auto-exhausted",
      lastErrorKind: "network-unreachable",
      attempts: 5,
      ownerId: "12D3KooWSX7iGZC9z9Xj4Wp3KZv9qJf8K1Lt5Nm2P3Qr4UvYxZ",
      cooldownUntil: "9999-12-31T00:00:00.000Z",
      finalNote: "exhausted 5 attempts; last error: dial tcp 1.2.3.4:0",
    };
    expect(formatSponsorFriendResult(r)).toBe(
      [
        "Couldn't set up the sponsor bond.",
        "Your relay is unreachable. The network kept dropping.",
        "What to do: Check your relay is online, then click Retry in the bond panel.",
        "",
        "[debug details:]",
        "  reason: auto-exhausted",
        "  lastErrorKind: network-unreachable",
        "  attempts: 5",
        "  ownerId: 12D3KooWSX7iGZC9...",
        "  cooldownUntil: 9999-12-31 00:00 UTC",
        "  finalNote: exhausted 5 attempts; last error: dial tcp 1.2.3.4:0",
      ].join("\n"),
    );
  });

  it("formats a failed bond with no lastErrorKind (prefers the known-reason message over the finalNote)", () => {
    // When `reason` matches a known string (e.g. "auto-exhausted"),
    // the formatter uses the user-friendly message; the
    // `finalNote` is bridge-internal and only surfaces in
    // the debug block at the bottom.
    const r: BClassSponsorFriendResult = {
      ok: false,
      reason: "auto-exhausted",
      attempts: 3,
      finalNote: "tried 3 times; something else went wrong",
    };
    expect(formatSponsorFriendResult(r)).toBe(
      [
        "Couldn't set up the sponsor bond.",
        "Tried the maximum number of times.",
        "What to do: Click Retry in the bond panel to try again. The bond won't auto-retry.",
        "",
        "[debug details:]",
        "  reason: auto-exhausted",
        "  attempts: 3",
        "  finalNote: tried 3 times; something else went wrong",
      ].join("\n"),
    );
  });

  it("formats a failed bond with no fields (minimal block)", () => {
    const r: BClassSponsorFriendResult = { ok: false };
    expect(formatSponsorFriendResult(r)).toBe(
      [
        "Couldn't set up the sponsor bond.",
        "What to do: Click Retry in the bond panel, or check the bond-trace log for details.",
        "",
        "[debug details:]",
      ].join("\n"),
    );
  });

  it("handles unknown shape gracefully", () => {
    expect(formatSponsorFriendResult(undefined)).toBe(
      "Sponsor bond: unknown shape",
    );
    expect(formatSponsorFriendResult(null)).toBe(
      "Sponsor bond: unknown shape",
    );
    expect(formatSponsorFriendResult("not an object")).toBe(
      "Sponsor bond: unknown shape",
    );
  });
});

// ---------------------------------------------------------------------------
// 2. formatPeerListResult
// ---------------------------------------------------------------------------

describe("formatPeerListResult", () => {
  it("formats a list of 5 peers with 3 shown + 2 more", () => {
    const r: PeerListResult = {
      total: 5,
      entries: [
        { peerId: "12D3KooAAA", count: 10, lastSeenAt: "2026-08-21T00:00:00Z" },
        { peerId: "12D3KooBBB", count: 0, lastSeenAt: "2026-08-21T00:00:00Z" },
        { peerId: "12D3KooCCC", count: 3, lastSeenAt: "2026-08-21T00:00:00Z" },
        { peerId: "12D3KooDDD", count: 0, lastSeenAt: "2026-08-21T00:00:00Z" },
        { peerId: "12D3KooEEE", count: 0, lastSeenAt: "2026-08-21T00:00:00Z" },
      ],
      text: "(pre-formatted CLI text)",
    };
    expect(formatPeerListResult(r)).toBe(
      "Observed 5 peers: 12D3KooAAA (10 msg), 12D3KooBBB, 12D3KooCCC (3 msg) (and 2 more)",
    );
  });

  it("formats a list of 1 peer (singular)", () => {
    const r: PeerListResult = {
      total: 1,
      entries: [{ peerId: "12D3Koo", count: 0, lastSeenAt: "2026-08-21T00:00:00Z" }],
      text: "",
    };
    expect(formatPeerListResult(r)).toBe("Observed 1 peer: 12D3Koo");
  });

  it("formats an empty list (0 peers)", () => {
    const r: PeerListResult = { total: 0, entries: [], text: "" };
    expect(formatPeerListResult(r)).toBe("Observed 0 peers: (none)");
  });

  it("formats exactly 3 peers (no `(and N more)` suffix)", () => {
    const r: PeerListResult = {
      total: 3,
      entries: [
        { peerId: "12D3KooAAA", count: 1, lastSeenAt: "2026-08-21T00:00:00Z" },
        { peerId: "12D3KooBBB", count: 0, lastSeenAt: "2026-08-21T00:00:00Z" },
        { peerId: "12D3KooCCC", count: 0, lastSeenAt: "2026-08-21T00:00:00Z" },
      ],
      text: "",
    };
    expect(formatPeerListResult(r)).toBe(
      "Observed 3 peers: 12D3KooAAA (1 msg), 12D3KooBBB, 12D3KooCCC",
    );
  });

  it("handles unknown shape gracefully", () => {
    expect(formatPeerListResult(undefined)).toBe("Peer list: unknown shape");
    expect(formatPeerListResult({})).toBe("Peer list: unknown shape");
  });
});

// ---------------------------------------------------------------------------
// 3. formatRelayStatusResult
// ---------------------------------------------------------------------------

describe("formatRelayStatusResult", () => {
  it("formats a running relay with counts", () => {
    const r: BClassRelayStatusResult = {
      text: "(CLI text)",
      json: "{}",
      snapshot: {
        relay: {
          peerId: "12D3KooWSX7iGZC9z9Xj4Wp3KZv9qJf8K1Lt5Nm2P3Qr4UvYxZ",
          enabled: true,
        },
        roster: { total: 12, fresh: 10, stale: 2 },
        relayBook: { total: 23 },
        routing: {
          recentTraces: [
            { createdAt: "2026-08-21T00:00:00Z", summary: "trace 1" },
            { createdAt: "2026-08-21T00:00:00Z", summary: "trace 2" },
            { createdAt: "2026-08-21T00:00:00Z", summary: "trace 3" },
            { createdAt: "2026-08-21T00:00:00Z", summary: "trace 4" },
          ],
        },
      },
    };
    // 16-char truncation: "12D3KooWSX7iGZC9" + "..." (Q8)
    expect(formatRelayStatusResult(r)).toBe(
      "Relay 12D3KooWSX7iGZC9...: 12 peers, 23 book entries, 4 recent traces",
    );
  });

  it("formats a disabled relay", () => {
    const r: BClassRelayStatusResult = {
      text: "",
      json: "",
      snapshot: { relay: { peerId: "12D3Koo", enabled: false } },
    };
    expect(formatRelayStatusResult(r)).toBe("Relay: disabled");
  });

  it("formats a no-snapshot state (relay not running)", () => {
    const r: BClassRelayStatusResult = {
      text: "",
      json: "",
      snapshot: null,
    };
    expect(formatRelayStatusResult(r)).toBe("Relay: not running");
  });

  it("formats an undefined snapshot as 'not running'", () => {
    const r: BClassRelayStatusResult = {
      text: "",
      json: "",
      snapshot: undefined,
    };
    expect(formatRelayStatusResult(r)).toBe("Relay: not running");
  });

  it("handles missing nested counts (defaults to 0)", () => {
    const r: BClassRelayStatusResult = {
      text: "",
      json: "",
      snapshot: { relay: { peerId: "12D3Koo", enabled: true } },
    };
    expect(formatRelayStatusResult(r)).toBe(
      "Relay 12D3Koo: 0 peers, 0 book entries, 0 recent traces",
    );
  });

  it("handles unknown shape gracefully", () => {
    // `undefined` / `null` / non-object → "unknown shape"
    // (defensive; malformed data). `{}` is a valid object
    // with no snapshot → "not running" (a valid state).
    expect(formatRelayStatusResult(undefined)).toBe("Relay status: unknown shape");
    expect(formatRelayStatusResult(null)).toBe("Relay status: unknown shape");
    expect(formatRelayStatusResult("not an object")).toBe("Relay status: unknown shape");
    expect(formatRelayStatusResult({})).toBe("Relay: not running");
  });
});

// ---------------------------------------------------------------------------
// 4. B_CLASS_FORMATTERS map + getBClassFormatter lookup
// ---------------------------------------------------------------------------

describe("B_CLASS_FORMATTERS + getBClassFormatter", () => {
  it("has all 3 B-class skills registered", () => {
    expect(Object.keys(B_CLASS_FORMATTERS).sort()).toEqual([
      "peer-list",
      "relay-status",
      "setup-sponsor-friend",
    ]);
  });

  it("returns the formatter for setup-sponsor-friend", () => {
    const f = getBClassFormatter("setup-sponsor-friend");
    expect(f).toBeDefined();
    // Sanity check: formatter is the same as the named export.
    expect(f).toBe(formatSponsorFriendResult);
  });

  it("returns the formatter for peer-list", () => {
    expect(getBClassFormatter("peer-list")).toBe(formatPeerListResult);
  });

  it("returns the formatter for relay-status", () => {
    expect(getBClassFormatter("relay-status")).toBe(formatRelayStatusResult);
  });

  it("returns undefined for non-B-class skills", () => {
    expect(getBClassFormatter("code-edit")).toBeUndefined();
    expect(getBClassFormatter("code-review")).toBeUndefined();
    expect(getBClassFormatter("doc-search")).toBeUndefined();
    expect(getBClassFormatter("bash-run")).toBeUndefined();
    expect(getBClassFormatter("plan")).toBeUndefined();
  });

  it("returns undefined for unknown skills", () => {
    expect(getBClassFormatter("unknown-skill")).toBeUndefined();
    expect(getBClassFormatter("")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 5. formatBClassResult (the public dispatch entry point)
// ---------------------------------------------------------------------------

describe("formatBClassResult", () => {
  it("formats a sponsor-friend success", () => {
    const r: BClassSponsorFriendResult = { ok: true, ownerId: "12D3Koo", attempts: 1 };
    expect(formatBClassResult("setup-sponsor-friend", r)).toBe(
      "Bonded with sponsor (12D3Koo) after 1 attempt",
    );
  });

  it("formats a peer-list result", () => {
    const r: PeerListResult = { total: 0, entries: [], text: "" };
    expect(formatBClassResult("peer-list", r)).toBe("Observed 0 peers: (none)");
  });

  it("returns undefined for non-B-class skills", () => {
    expect(
      formatBClassResult("code-edit", { kind: "text", text: "irrelevant" }),
    ).toBeUndefined();
  });

  it("returns undefined for unknown skills", () => {
    expect(formatBClassResult("unknown", {})).toBeUndefined();
  });
});
