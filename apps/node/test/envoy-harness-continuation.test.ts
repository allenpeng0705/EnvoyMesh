import { describe, expect, it } from "vitest";
import {
  appendEhIncompleteContinueCue,
  envoyHarnessContinuationPhasesForTurn,
  parseEnvoyHarnessContinuationPhases,
} from "../src/envoy-harness-continuation.js";

describe("envoy-harness-continuation", () => {
  it("defaults attended phases to 2", () => {
    expect(parseEnvoyHarnessContinuationPhases("")).toBe(2);
    expect(parseEnvoyHarnessContinuationPhases(undefined)).toBe(2);
  });

  it("clamps env parse to 0…3", () => {
    expect(parseEnvoyHarnessContinuationPhases("0")).toBe(0);
    expect(parseEnvoyHarnessContinuationPhases("3")).toBe(3);
    expect(parseEnvoyHarnessContinuationPhases("9")).toBe(2);
    expect(parseEnvoyHarnessContinuationPhases("x")).toBe(2);
  });

  it("unattended is always 0", () => {
    expect(envoyHarnessContinuationPhasesForTurn(true)).toBe(0);
    expect(envoyHarnessContinuationPhasesForTurn(false)).toBe(2);
  });

  it("appends continue cue once", () => {
    const out = appendEhIncompleteContinueCue("partial result");
    expect(out).toContain("continue");
    expect(appendEhIncompleteContinueCue(out)).toBe(out);
  });
});