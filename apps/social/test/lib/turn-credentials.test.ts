/**
 * Phase 42H — tests for the structured TURN credential editor helpers.
 *
 * The helpers in `lib/turn-credentials.ts` back the Settings → Network
 * → TURN servers UI. They are pure functions, so we can cover them
 * directly without rendering React.
 */

import { describe, expect, it } from "vitest";
import {
  extractTurnServers,
  isTurnUrl,
  mergeTurnServers,
  validateTurnDraft,
  type IceServerEntry,
  type TurnDraft,
} from "../../src/lib/turn-credentials.js";

const MESSAGES = { invalidUrl: "TURN URL must start with `turn:` or `turns:`", invalidTtl: "TTL must be a non-negative integer" };

function row(partial: Partial<TurnDraft>): TurnDraft {
  return {
    id: "row-1",
    urls: "",
    username: "",
    credential: "",
    ttlSeconds: 3600,
    ...partial,
  };
}

describe("isTurnUrl", () => {
  it("accepts turn: and turns: schemes", () => {
    expect(isTurnUrl("turn:turn.example.com:3478")).toBe(true);
    expect(isTurnUrl("turns:turn.example.com:5349")).toBe(true);
    expect(isTurnUrl("  TURN:turn.example.com:3478 ")).toBe(true);
    expect(isTurnUrl("turn:turn.example.com:3478?transport=udp")).toBe(true);
  });

  it("rejects stun: and other schemes", () => {
    expect(isTurnUrl("stun:stun.l.google.com:19302")).toBe(false);
    expect(isTurnUrl("http://example.com")).toBe(false);
    expect(isTurnUrl("")).toBe(false);
    expect(isTurnUrl("turn-relay.example.com")).toBe(false);
  });
});

describe("extractTurnServers", () => {
  it("returns an empty list when iceServers is missing", () => {
    expect(extractTurnServers(undefined)).toEqual([]);
  });

  it("filters out non-TURN entries and keeps STUN ones untouched in input", () => {
    const iceServers: IceServerEntry[] = [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "turn:turn.example.com:3478", username: "u", credential: "c" },
      { urls: "stun:stun.cloudflare.com:3478" },
    ];
    const draft = extractTurnServers(iceServers);
    expect(draft).toHaveLength(1);
    expect(draft[0]?.urls).toBe("turn:turn.example.com:3478");
    expect(draft[0]?.username).toBe("u");
    expect(draft[0]?.credential).toBe("c");
    expect(draft[0]?.ttlSeconds).toBe(3600);
    expect(draft[0]?.id).toMatch(/^turn-/);
    // Original STUN entries untouched
    expect(iceServers).toHaveLength(3);
  });

  it("produces unique ids across calls", () => {
    const iceServers: IceServerEntry[] = [
      { urls: "turn:a.example.com:3478" },
      { urls: "turn:b.example.com:3478" },
    ];
    const draft = extractTurnServers(iceServers);
    const ids = new Set(draft.map((r) => r.id));
    expect(ids.size).toBe(draft.length);
  });

  it("falls back to default ttlSeconds when missing", () => {
    const draft = extractTurnServers([{ urls: "turn:a.example.com:3478" }]);
    expect(draft[0]?.ttlSeconds).toBe(3600);
  });
});

describe("mergeTurnServers", () => {
  it("drops empty draft rows but preserves valid ones", () => {
    const draft = [
      row({ id: "a", urls: "" }),
      row({ id: "b", urls: "turn:b.example.com:3478" }),
    ];
    const out = mergeTurnServers(undefined, draft);
    expect(out).toEqual([{ urls: "turn:b.example.com:3478" }]);
  });

  it("preserves existing STUN entries", () => {
    const iceServers: IceServerEntry[] = [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun.cloudflare.com:3478" },
    ];
    const draft = [row({ urls: "turn:turn.example.com:3478", username: "u", credential: "c" })];
    const out = mergeTurnServers(iceServers, draft);
    expect(out).toEqual([
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun.cloudflare.com:3478" },
      { urls: "turn:turn.example.com:3478", username: "u", credential: "c" },
    ]);
  });

  it("replaces stale TURN entries with the draft", () => {
    const iceServers: IceServerEntry[] = [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "turn:old.example.com:3478", username: "old", credential: "old" },
    ];
    const draft = [row({ urls: "turn:new.example.com:3478", username: "new", credential: "new" })];
    const out = mergeTurnServers(iceServers, draft);
    expect(out).toEqual([
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "turn:new.example.com:3478", username: "new", credential: "new" },
    ]);
  });

  it("strips empty username/credential from output", () => {
    const draft = [row({ urls: "turn:turn.example.com:3478", username: "", credential: "" })];
    const out = mergeTurnServers(undefined, draft);
    expect(out).toEqual([{ urls: "turn:turn.example.com:3478" }]);
    expect(out[0]).not.toHaveProperty("username");
    expect(out[0]).not.toHaveProperty("credential");
  });

  it("trims whitespace", () => {
    const draft = [row({ urls: "  turn:turn.example.com:3478  ", username: "  u  " })];
    const out = mergeTurnServers(undefined, draft);
    expect(out).toEqual([{ urls: "turn:turn.example.com:3478", username: "u" }]);
  });

  it("returns STUN-only list when draft is empty", () => {
    const iceServers: IceServerEntry[] = [
      { urls: "stun:stun.l.google.com:19302" },
    ];
    const out = mergeTurnServers(iceServers, []);
    expect(out).toEqual([{ urls: "stun:stun.l.google.com:19302" }]);
  });
});

describe("validateTurnDraft", () => {
  it("returns null for an empty draft", () => {
    expect(validateTurnDraft([], MESSAGES)).toBeNull();
  });

  it("returns null for a draft with only blank rows", () => {
    const draft = [row({ urls: "" }), row({ urls: "   " })];
    expect(validateTurnDraft(draft, MESSAGES)).toBeNull();
  });

  it("flags invalid TURN URLs", () => {
    const draft = [row({ urls: "stun:stun.l.google.com:19302" })];
    const err = validateTurnDraft(draft, MESSAGES);
    expect(err?.code).toBe("invalidUrl");
    expect(err?.message).toMatch(/TURN URL must start/);
    expect(err?.rowId).toBe("row-1");
  });

  it("flags negative ttlSeconds", () => {
    const draft = [row({ urls: "turn:turn.example.com:3478", ttlSeconds: -5 })];
    const err = validateTurnDraft(draft, MESSAGES);
    expect(err?.code).toBe("invalidTtl");
    expect(err?.rowId).toBe("row-1");
  });

  it("flags non-finite ttlSeconds", () => {
    const draft = [row({ urls: "turn:turn.example.com:3478", ttlSeconds: Number.NaN })];
    const err = validateTurnDraft(draft, MESSAGES);
    expect(err?.code).toBe("invalidTtl");
  });

  it("accepts ttlSeconds = 0 (rotate on every call)", () => {
    const draft = [row({ urls: "turn:turn.example.com:3478", ttlSeconds: 0 })];
    expect(validateTurnDraft(draft, MESSAGES)).toBeNull();
  });

  it("accepts valid TURN rows", () => {
    const draft = [
      row({ id: "r1", urls: "turn:turn.example.com:3478", username: "u", credential: "c", ttlSeconds: 600 }),
      row({ id: "r2", urls: "turns:turn.example.com:5349" }),
    ];
    expect(validateTurnDraft(draft, MESSAGES)).toBeNull();
  });

  it("skips blank rows even if a later row is invalid", () => {
    const draft = [
      row({ id: "blank", urls: "" }),
      row({ id: "bad", urls: "stun:stun.l.google.com:19302" }),
    ];
    const err = validateTurnDraft(draft, MESSAGES);
    expect(err?.rowId).toBe("bad");
  });
});

describe("makeTurnId", () => {
  it("returns unique ids with a turn- prefix", async () => {
    const { makeTurnId } = await import("../../src/lib/turn-credentials.js");
    const ids = new Set(Array.from({ length: 50 }, () => makeTurnId()));
    expect(ids.size).toBe(50);
    for (const id of ids) expect(id).toMatch(/^turn-/);
  });
});