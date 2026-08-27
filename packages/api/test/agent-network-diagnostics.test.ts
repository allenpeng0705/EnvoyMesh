import { describe, expect, it } from "vitest";
import {
  createAgentNetworkSimulationId,
  redactAgentNetworkDiagnosticsJson,
} from "../src/agent-network-diagnostics.js";

describe("agent-network-diagnostics helpers", () => {
  it("redacts long envoy peer ids", () => {
    const json = redactAgentNetworkDiagnosticsJson({
      peerId: "envoy_agent_abcdefghijklmnopqrstuvwxyz0123456789",
    });
    expect(json).toContain("…");
    expect(json).not.toContain("0123456789");
  });

  it("creates simulation ids", () => {
    expect(createAgentNetworkSimulationId().startsWith("an_sim_")).toBe(true);
  });
});
