import { beforeEach, describe, expect, it, vi } from "vitest";

const { callGatewayToolMock } = vi.hoisted(() => ({
  callGatewayToolMock: vi.fn(),
}));

vi.mock("openclaw/plugin-sdk/agent-harness-runtime", () => ({
  callGatewayTool: callGatewayToolMock,
}));

import { createEnvoymeshRemindTool } from "./remind-tool.js";
import { takeDueEnvoymeshReminderForTarget } from "./remind-delivery-registry.js";

describe("envoymesh remind tool", () => {
  beforeEach(() => {
    callGatewayToolMock.mockReset();
    callGatewayToolMock.mockResolvedValue({ id: "job-1" });
  });

  it("schedules reminders via cron.add with envoymesh announce delivery", async () => {
    const tool = createEnvoymeshRemindTool({
      deliveryContext: {
        channel: "envoymesh",
        to: "envoymesh:envoy:owner:test",
        accountId: "default",
      },
    });

    const result = await tool.execute("call-1", {
      action: "add",
      content: "drink water",
      time: "5m",
    });

    const addCall = callGatewayToolMock.mock.calls.at(0);
    expect(addCall?.[0]).toBe("cron.add");
    const payload = addCall?.[2] as { job?: Record<string, unknown> };
    expect(payload?.job?.sessionTarget).toBe("isolated");
    expect(payload?.job?.payload).toEqual(
      expect.objectContaining({
        kind: "agentTurn",
        lightContext: true,
        toolsAllow: [],
      }),
    );
    expect(
      (payload?.job?.payload as { message?: string } | undefined)?.message?.startsWith("ENVOYMESH_CRON:"),
    ).toBe(true);
    expect(payload?.job?.delivery).toEqual({
      mode: "announce",
      channel: "envoymesh",
      to: "envoymesh:envoy:owner:test",
      accountId: "default",
    });
    expect(result.details).toEqual(
      expect.objectContaining({ ok: true, cronResult: { id: "job-1" } }),
    );
    const due = takeDueEnvoymeshReminderForTarget("envoy:owner:test", Date.now() + 300_000);
    expect(due?.content).toBe("drink water");
  });
});
