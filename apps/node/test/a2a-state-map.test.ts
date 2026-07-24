/**
 * Phase 48D — A2A v1.0 State Map tests.
 *
 * Pins the 12→9 mapping. Every EnvoyMesh state has a deterministic
 * A2A state; every A2A state round-trips back to a valid EnvoyMesh
 * state. Idempotent on the inbound direction.
 */

import { describe, expect, it } from "vitest";
import {
  A2A_STATE_VALUES,
  fromA2AState,
  isA2ATerminal,
  TERMINAL_ENVOY_STATES,
  toA2AState,
  type EnvoyTaskLifecycleState,
} from "../src/a2a-state-map.js";

const ALL_ENVOY_STATES: EnvoyTaskLifecycleState[] = [
  "created",
  "planned",
  "discovering",
  "negotiating",
  "waiting_for_peer",
  "waiting_for_owner",
  "running",
  "partial",
  "synthesizing",
  "completed",
  "failed",
  "cancelled",
];

describe("a2a-state-map: toA2AState", () => {
  it("maps pre-execution phases to 'submitted'", () => {
    expect(toA2AState("created")).toBe("submitted");
    expect(toA2AState("planned")).toBe("submitted");
    expect(toA2AState("discovering")).toBe("submitted");
    expect(toA2AState("negotiating")).toBe("submitted");
  });

  it("maps blocking phases to 'input-required'", () => {
    expect(toA2AState("waiting_for_peer")).toBe("input-required");
    expect(toA2AState("waiting_for_owner")).toBe("input-required");
  });

  it("maps execution phases to 'working'", () => {
    expect(toA2AState("running")).toBe("working");
    expect(toA2AState("partial")).toBe("working");
    expect(toA2AState("synthesizing")).toBe("working");
  });

  it("maps terminal states 1:1", () => {
    expect(toA2AState("completed")).toBe("completed");
    expect(toA2AState("failed")).toBe("failed");
  });

  it("maps 'cancelled' (EnvoyMesh British) to 'canceled' (A2A American)", () => {
    expect(toA2AState("cancelled")).toBe("canceled");
  });

  it("passes through A2A sentinels (idempotent inbound)", () => {
    for (const v of A2A_STATE_VALUES) {
      expect(toA2AState(v)).toBe(v);
    }
  });

  it("returns 'unknown' for unrecognized input", () => {
    expect(toA2AState("not-a-real-state")).toBe("unknown");
    expect(toA2AState("")).toBe("unknown");
    expect(toA2AState("CANCELLED")).toBe("unknown"); // case-sensitive
  });

  it("covers all 12 EnvoyMesh states without leaving a hole", () => {
    const mapped = new Set(ALL_ENVOY_STATES.map(toA2AState));
    // Every mapping lands in the 9-value spec set.
    for (const v of mapped) {
      expect(A2A_STATE_VALUES).toContain(v);
    }
  });
});

describe("a2a-state-map: fromA2AState", () => {
  it("maps 'submitted' back to 'created'", () => {
    expect(fromA2AState("submitted")).toBe("created");
  });

  it("maps 'working' back to 'running'", () => {
    expect(fromA2AState("working")).toBe("running");
  });

  it("maps 'input-required' back to 'waiting_for_owner'", () => {
    expect(fromA2AState("input-required")).toBe("waiting_for_owner");
  });

  it("maps terminal states 1:1", () => {
    expect(fromA2AState("completed")).toBe("completed");
    expect(fromA2AState("failed")).toBe("failed");
    expect(fromA2AState("canceled")).toBe("cancelled");
  });

  it("maps 'rejected' to 'failed' (closest EnvoyMesh state)", () => {
    expect(fromA2AState("rejected")).toBe("failed");
  });

  it("maps 'auth-required' to 'waiting_for_owner'", () => {
    expect(fromA2AState("auth-required")).toBe("waiting_for_owner");
  });

  it("maps 'unknown' and unrecognized values to 'created'", () => {
    expect(fromA2AState("unknown")).toBe("created");
    expect(fromA2AState("not-a-real-state")).toBe("created");
  });

  it("covers all 9 A2A states", () => {
    for (const v of A2A_STATE_VALUES) {
      const back = fromA2AState(v);
      expect(ALL_ENVOY_STATES).toContain(back);
    }
  });
});

describe("a2a-state-map: isA2ATerminal", () => {
  it("true for completed / failed / canceled / rejected", () => {
    expect(isA2ATerminal("completed")).toBe(true);
    expect(isA2ATerminal("failed")).toBe(true);
    expect(isA2ATerminal("canceled")).toBe(true);
    expect(isA2ATerminal("rejected")).toBe(true);
  });

  it("false for non-terminal states", () => {
    expect(isA2ATerminal("submitted")).toBe(false);
    expect(isA2ATerminal("working")).toBe(false);
    expect(isA2ATerminal("input-required")).toBe(false);
    expect(isA2ATerminal("auth-required")).toBe(false);
    expect(isA2ATerminal("unknown")).toBe(false);
  });
});

describe("a2a-state-map: TERMINAL_ENVOY_STATES", () => {
  it("includes completed, failed, cancelled (3 of 12 states)", () => {
    expect(TERMINAL_ENVOY_STATES.size).toBe(3);
    expect(TERMINAL_ENVOY_STATES.has("completed")).toBe(true);
    expect(TERMINAL_ENVOY_STATES.has("failed")).toBe(true);
    expect(TERMINAL_ENVOY_STATES.has("cancelled")).toBe(true);
  });
});

describe("a2a-state-map: constants", () => {
  it("A2A_STATE_VALUES has exactly 9 entries matching the spec", () => {
    expect(A2A_STATE_VALUES.length).toBe(9);
    expect([...A2A_STATE_VALUES].sort()).toEqual([
      "auth-required",
      "canceled",
      "completed",
      "failed",
      "input-required",
      "rejected",
      "submitted",
      "unknown",
      "working",
    ]);
  });
});