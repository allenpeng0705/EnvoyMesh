import { describe, expect, it } from "vitest";
import {
  OWNER_AGENT_TOOL_ALLOWLIST,
  OWNER_AGENT_WAVE1_TOOL_NAMES,
  findOwnerAgentTool,
  filterOwnerAgentTools,
  isOwnerAgentToolAllowed,
} from "../src/owner-agent-tool-allowlist.js";

const allPosturesOn = {
  socialProxy: true,
  documentAcquisition: true,
  capabilityProvider: true,
  trustMode: true,
};

describe("OWNER_AGENT_WAVE1_TOOL_NAMES (Phase 69A)", () => {
  it("every wave-1 name is on the allowlist", () => {
    const names = new Set(OWNER_AGENT_TOOL_ALLOWLIST.map((t) => t.name));
    for (const name of OWNER_AGENT_WAVE1_TOOL_NAMES) {
      expect(names.has(name), `missing allowlist entry: ${name}`).toBe(true);
    }
  });

  it("resolves OpenClaw legacy aliases to allowlisted tools", () => {
    expect(findOwnerAgentTool("mesh.send_hello")?.name).toBe("bond.send_hello");
    expect(findOwnerAgentTool("mesh.task_propose")?.name).toBe("mesh.task.propose");
    expect(isOwnerAgentToolAllowed("mesh.send_hello", allPosturesOn)).toBe(true);
    expect(isOwnerAgentToolAllowed("mesh.task_propose", allPosturesOn)).toBe(true);
  });

  it("gates social proxy job on posture", () => {
    expect(
      isOwnerAgentToolAllowed("owner.run_social_proxy_pass", {
        ...allPosturesOn,
        socialProxy: false,
      }),
    ).toBe(false);
    expect(isOwnerAgentToolAllowed("owner.run_social_proxy_pass", allPosturesOn)).toBe(true);
  });

  it("filterOwnerAgentTools includes discover_cluster without trust mode", () => {
    const tools = filterOwnerAgentTools({
      socialProxy: false,
      documentAcquisition: false,
      capabilityProvider: false,
      trustMode: false,
    });
    const names = tools.map((t) => t.name);
    expect(names).toContain("mesh.discover_cluster");
    expect(names).toContain("bond.send_hello");
    expect(names).toContain("mesh.intelligence_report");
    expect(names).not.toContain("mesh.intro.run_autopilot");
  });
});
