import { describe, expect, it } from "vitest";
import {
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
});
