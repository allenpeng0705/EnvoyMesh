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
  makeTurnId,
  mergeTurnServers,
  presetById,
  TURN_PRESETS,
  validateTurnDraft,
  type IceServerEntry,
  type TurnDraft,
} from "../../src/lib/turn-credentials.js";

const MESSAGES = {
  invalidUrl: "TURN URL must start with `turn:` or `turns:`",
  missingCredentials: "TURN entries need both username and credential",
};

function row(partial: Partial<TurnDraft>): TurnDraft {
  return {
    id: "row-1",
    urls: "",
    username: "",
    credential: "",
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

describe("TURN_PRESETS", () => {
  it("exposes Twilio, Cloudflare, and self-hosted coturn presets", () => {
    expect(TURN_PRESETS.map((p) => p.id)).toEqual(["twilio", "cloudflare", "coturn"]);
    for (const preset of TURN_PRESETS) {
      expect(preset.urls.startsWith("turn:")).toBe(true);
      expect(preset.label.length).toBeGreaterThan(0);
    }
  });

  it("presets are retrievable by id", () => {
    expect(presetById("twilio")?.urls).toContain("twilio.com");
    expect(presetById("cloudflare")?.urls).toContain("cloudflare.com");
    expect(presetById("coturn")?.urls).toContain("{your-server}");
    expect(presetById("unknown")).toBeUndefined();
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
});

describe("mergeTurnServers", () => {
  it("drops empty draft rows but preserves valid ones", () => {
    const draft = [
      row({ id: "a", urls: "" }),
      row({ id: "b", urls: "turn:b.example.com:3478", username: "u", credential: "c" }),
    ];
    const out = mergeTurnServers(undefined, draft);
    expect(out).toEqual([
      { urls: "turn:b.example.com:3478", username: "u", credential: "c" },
    ]);
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

  it("drops rows that have a turn: URL but no credentials (broken TURN)", () => {
    // The previous version stripped empty credentials silently, which
    // saved a TURN entry that every WebRTC stack rejects. Now such
    // rows are dropped entirely (validateTurnDraft should have caught
    // this before save).
    const draft = [row({ urls: "turn:turn.example.com:3478", username: "", credential: "" })];
    const out = mergeTurnServers(undefined, draft);
    expect(out).toEqual([]);
  });

  it("trims whitespace", () => {
    const draft = [
      row({ urls: "  turn:turn.example.com:3478  ", username: "  u  ", credential: "  c  " }),
    ];
    const out = mergeTurnServers(undefined, draft);
    expect(out).toEqual([
      { urls: "turn:turn.example.com:3478", username: "u", credential: "c" },
    ]);
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

  it("flags missing credentials on a turn: row (was silently allowed)", () => {
    const draft = [row({ urls: "turn:turn.example.com:3478", username: "u", credential: "" })];
    const err = validateTurnDraft(draft, MESSAGES);
    expect(err?.code).toBe("missingCredentials");
    expect(err?.message).toMatch(/both username and credential/);
    expect(err?.rowId).toBe("row-1");
  });

  it("flags missing username when credential is set", () => {
    const draft = [row({ urls: "turn:turn.example.com:3478", username: "", credential: "c" })];
    const err = validateTurnDraft(draft, MESSAGES);
    expect(err?.code).toBe("missingCredentials");
  });

  it("accepts valid TURN rows", () => {
    const draft = [
      row({ id: "r1", urls: "turn:turn.example.com:3478", username: "u", credential: "c" }),
      row({ id: "r2", urls: "turns:turn.example.com:5349", username: "u2", credential: "c2" }),
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
  it("returns unique ids with a turn- prefix", () => {
    const ids = new Set(Array.from({ length: 50 }, () => makeTurnId()));
    expect(ids.size).toBe(50);
    for (const id of ids) expect(id).toMatch(/^turn-/);
  });
});