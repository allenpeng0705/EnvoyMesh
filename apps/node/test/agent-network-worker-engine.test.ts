import { describe, expect, it } from "vitest";
import {
  AGENT_NETWORK_WORKER_ENGINES,
  coerceAgentNetworkWorkerEngine,
  DEFAULT_AGENT_NETWORK_WORKER_ENGINE,
} from "../src/agent-network-worker-engine.js";

describe("coerceAgentNetworkWorkerEngine", () => {
  it("defaults to openclaw", () => {
    expect(coerceAgentNetworkWorkerEngine(undefined)).toBe("openclaw");
    expect(coerceAgentNetworkWorkerEngine("nope")).toBe("openclaw");
    expect(DEFAULT_AGENT_NETWORK_WORKER_ENGINE).toBe("openclaw");
  });

  it("accepts ext", () => {
    expect(coerceAgentNetworkWorkerEngine("ext")).toBe("ext");
  });

  it("accepts envoy-harness (Phase 8)", () => {
    // Phase 8 — the picker learns the new runtime. Old builds would
    // coerce to openclaw; new builds preserve the literal so the
    // persisted config round-trips.
    expect(coerceAgentNetworkWorkerEngine("envoy-harness")).toBe("envoy-harness");
    expect(AGENT_NETWORK_WORKER_ENGINES).toContain("envoy-harness");
  });
});
