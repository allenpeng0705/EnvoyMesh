import { describe, expect, it } from "vitest";
import { formatDelay, isCronExpression, parseRelativeTime, prepareRemindCronAction } from "./remind-logic.js";

describe("envoymesh remind-logic", () => {
  it("parses relative delays", () => {
    expect(parseRelativeTime("5m")).toBe(300_000);
    expect(parseRelativeTime("90s")).toBe(90_000);
  });

  it("builds isolated announce cron job for one-shot reminder", () => {
    const plan = prepareRemindCronAction(
      { action: "add", content: "drink water", time: "5m" },
      { fallbackTo: "envoy:owner:test", fallbackAccountId: "default" },
    );
    expect(plan.ok).toBe(true);
    if (!plan.ok || plan.cronAction.action !== "add") {
      throw new Error("expected add plan");
    }
    expect(plan.cronAction.job.sessionTarget).toBe("isolated");
    expect(plan.cronAction.job.payload.kind).toBe("agentTurn");
    expect(plan.cronAction.job.delivery).toEqual({
      mode: "announce",
      channel: "envoymesh",
      to: "envoymesh:envoy:owner:test",
      accountId: "default",
    });
  });

  it("rejects delays under 30 seconds", () => {
    const plan = prepareRemindCronAction(
      { action: "add", content: "ping", time: "10s" },
      { fallbackTo: "envoy:owner:test" },
    );
    expect(plan.ok).toBe(false);
  });

  it("detects cron expressions", () => {
    expect(isCronExpression("0 8 * * *")).toBe(true);
    expect(formatDelay(300_000)).toBe("5m");
  });
});
