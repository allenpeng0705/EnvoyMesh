import { describe, expect, it } from "vitest";
import {
  AGENT_NETWORK_WORKER_MEMBERSHIP,
  isAgentNetworkMember,
  normalizeAgentCardMembership,
  withAgentNetworkMembership,
} from "../src/agent-network-membership.js";

describe("agent-network-membership", () => {
  it("defaults private — task.execute alone is not network membership", () => {
    expect(isAgentNetworkMember(["message.send", "task.execute"])).toBe(false);
  });

  it("opts in when agent-network-worker membership is present", () => {
    expect(
      isAgentNetworkMember(["task.execute", AGENT_NETWORK_WORKER_MEMBERSHIP]),
    ).toBe(true);
  });

  it("treats legacy capability-provider as agent-network-worker", () => {
    expect(isAgentNetworkMember(["task.execute", "capability-provider"])).toBe(true);
    expect(normalizeAgentCardMembership(["capability-provider", "task.execute"])).toEqual([
      AGENT_NETWORK_WORKER_MEMBERSHIP,
      "task.execute",
    ]);
  });

  it("is safe when membership is missing", () => {
    expect(isAgentNetworkMember(undefined)).toBe(false);
    expect(normalizeAgentCardMembership(undefined)).toEqual([]);
  });

  it("withAgentNetworkMembership adds and strips without duplicating", () => {
    const base = ["message.send", "task.execute"];
    expect(withAgentNetworkMembership(base, true)).toEqual([
      "message.send",
      "task.execute",
      AGENT_NETWORK_WORKER_MEMBERSHIP,
    ]);
    expect(
      withAgentNetworkMembership(
        ["task.execute", AGENT_NETWORK_WORKER_MEMBERSHIP, AGENT_NETWORK_WORKER_MEMBERSHIP],
        true,
      ),
    ).toEqual(["task.execute", AGENT_NETWORK_WORKER_MEMBERSHIP]);
    expect(
      withAgentNetworkMembership(["task.execute", AGENT_NETWORK_WORKER_MEMBERSHIP], false),
    ).toEqual(["task.execute"]);
  });
});
