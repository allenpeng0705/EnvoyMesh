import { describe, expect, it } from "vitest";
import {
  agentNetworkRoleLabel,
  draftToAgentNetworkRoleId,
} from "../../src/lib/agent-network-role-label.js";

describe("draftToAgentNetworkRoleId", () => {
  it("accepts well-known roles", () => {
    expect(draftToAgentNetworkRoleId("Programmer")).toBe("programmer");
  });

  it("normalizes free text to custom:<slug>", () => {
    expect(draftToAgentNetworkRoleId("QA Lead")).toBe("custom:qa_lead");
    expect(draftToAgentNetworkRoleId("custom:qa_lead")).toBe("custom:qa_lead");
  });

  it("rejects empty / invalid drafts", () => {
    expect(draftToAgentNetworkRoleId("")).toBeNull();
    expect(draftToAgentNetworkRoleId("!!!")).toBeNull();
  });
});

describe("agentNetworkRoleLabel", () => {
  const t = (key: string, fallback?: string) =>
    key === "settings.agentNetwork.membership.role_programmer" ? "Programmer" : (fallback ?? key);

  it("localizes well-known roles", () => {
    expect(agentNetworkRoleLabel("programmer", t)).toBe("Programmer");
  });

  it("strips custom: and humanizes underscores", () => {
    expect(agentNetworkRoleLabel("custom:qa_lead", t)).toBe("qa lead");
  });
});
