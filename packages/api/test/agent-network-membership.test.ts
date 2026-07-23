import { describe, expect, it } from "vitest";
import {
  AGENT_NETWORK_WORKER_CAPABILITY,
  isAgentNetworkWorker,
  withAgentNetworkMembership,
} from "../src/agent-network-membership.js";

describe("agent-network-membership", () => {
  it("defaults private — task.execute alone is not network membership", () => {
    expect(isAgentNetworkWorker(["message.send", "task.execute"])).toBe(false);
  });

  it("opts in when capability-provider is present", () => {
    expect(
      isAgentNetworkWorker(["task.execute", AGENT_NETWORK_WORKER_CAPABILITY]),
    ).toBe(true);
  });

  it("withAgentNetworkMembership adds and strips without duplicating", () => {
    const base = ["message.send", "task.execute"];
    expect(withAgentNetworkMembership(base, true)).toEqual([
      "message.send",
      "task.execute",
      AGENT_NETWORK_WORKER_CAPABILITY,
    ]);
    expect(
      withAgentNetworkMembership(
        ["task.execute", AGENT_NETWORK_WORKER_CAPABILITY, AGENT_NETWORK_WORKER_CAPABILITY],
        true,
      ),
    ).toEqual(["task.execute", AGENT_NETWORK_WORKER_CAPABILITY]);
    expect(
      withAgentNetworkMembership(["task.execute", AGENT_NETWORK_WORKER_CAPABILITY], false),
    ).toEqual(["task.execute"]);
  });
});
