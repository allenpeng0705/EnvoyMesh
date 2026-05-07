import { describe, expect, it } from "vitest";
import {
  TriggerStore,
  createTrigger,
  isCronMatch,
  shouldFireTimeTrigger,
  shouldFireEventTrigger,
  shouldFireTopicTrigger,
  buildListTriggersTool,
  buildAddTriggerTool,
  buildRemoveTriggerTool,
  buildUpdateTriggerTool,
  type TimeCondition,
  type EventCondition,
  type TopicCondition,
} from "../src/trigger-store.js";

describe("createTrigger", () => {
  it("creates a time trigger", () => {
    const condition: TimeCondition = { type: "time", cron: "0 9 * * *" };
    const action = { type: "send_chat", targetContactOwnerId: "alice", messageTemplate: "Good morning!" };
    const trigger = createTrigger("Morning check-in", "time", condition, action);

    expect(trigger.id).toBeDefined();
    expect(trigger.name).toBe("Morning check-in");
    expect(trigger.triggerType).toBe("time");
    expect(trigger.enabled).toBe(true);
    expect(trigger.status).toBe("active");
    expect(trigger.firesToday).toBe(0);
  });

  it("creates an event trigger", () => {
    const condition: EventCondition = { type: "event", eventType: "escalation_detected" };
    const action = { type: "notify_owner" };
    const trigger = createTrigger("Escalation alert", "event", condition, action, "agent");

    expect(trigger.createdBy).toBe("agent");
    expect(trigger.condition.eventType).toBe("escalation_detected");
  });

  it("creates a topic trigger", () => {
    const condition: TopicCondition = { type: "topic", keywords: ["urgent", "help"], matchAll: true };
    const action = { type: "follow_up", targetContactOwnerId: "support" };
    const trigger = createTrigger("Urgent keywords", "topic", condition, action);

    expect(trigger.triggerType).toBe("topic");
    expect((trigger.condition as TopicCondition).keywords).toContain("urgent");
  });
});

describe("isCronMatch", () => {
  it("matches wildcard minute", () => {
    const date = new Date("2026-05-07T09:15:00Z");
    expect(isCronMatch("* * * * *", date)).toBe(true);
  });

  it("matches specific minute", () => {
    const date = new Date("2026-05-07T09:00:00Z");
    expect(isCronMatch("0 * * * *", date)).toBe(true);
  });

  it("does not match wrong minute", () => {
    const date = new Date("2026-05-07T09:15:00Z");
    expect(isCronMatch("0 * * * *", date)).toBe(false);
  });

  it("matches specific hour and minute", () => {
    const date = new Date("2026-05-07T09:00:00Z");
    expect(isCronMatch("0 9 * * *", date)).toBe(true);
  });

  it("matches weekday", () => {
    const date = new Date("2026-05-07T09:00:00Z"); // Thursday
    expect(isCronMatch("0 9 * * 4", date)).toBe(true);
  });

  it("does not match wrong weekday", () => {
    const date = new Date("2026-05-08T09:00:00Z"); // Friday
    expect(isCronMatch("0 9 * * 4", date)).toBe(false);
  });

  it("returns false for invalid cron", () => {
    const date = new Date("2026-05-07T09:00:00Z");
    expect(isCronMatch("invalid", date)).toBe(false);
    expect(isCronMatch("1 2 3 4 5 6", date)).toBe(false);
  });
});

describe("shouldFireTimeTrigger", () => {
  it("returns false for disabled trigger", () => {
    const trigger = createTrigger("Test", "time", { type: "time", cron: "0 9 * * *" }, { type: "notify_owner" });
    trigger.enabled = false;

    expect(shouldFireTimeTrigger(trigger, new Date())).toBe(false);
  });

  it("returns false when max fires reached", () => {
    const trigger = createTrigger("Test", "time", { type: "time", cron: "0 9 * * *" }, { type: "notify_owner" });
    trigger.firesToday = trigger.maxFiresPerDay;

    expect(shouldFireTimeTrigger(trigger, new Date())).toBe(false);
  });

  it("returns true when cron matches", () => {
    const trigger = createTrigger("Test", "time", { type: "time", cron: "0 9 * * *" }, { type: "notify_owner" });
    const date = new Date("2026-05-07T09:00:00Z");

    expect(shouldFireTimeTrigger(trigger, date)).toBe(true);
  });

  it("returns true for one-time trigger", () => {
    const trigger = createTrigger("Test", "time", { type: "time", at: "2026-05-07T08:00:00Z" }, { type: "notify_owner" });
    const date = new Date("2026-05-07T09:00:00Z");

    expect(shouldFireTimeTrigger(trigger, date)).toBe(true);
  });
});

describe("shouldFireEventTrigger", () => {
  it("returns true for matching event", () => {
    const trigger = createTrigger("Test", "event", { type: "event", eventType: "message_received" }, { type: "notify_owner" });

    expect(shouldFireEventTrigger(trigger, "message_received")).toBe(true);
  });

  it("returns false for non-matching event", () => {
    const trigger = createTrigger("Test", "event", { type: "event", eventType: "message_received" }, { type: "notify_owner" });

    expect(shouldFireEventTrigger(trigger, "contact_online")).toBe(false);
  });

  it("returns false for non-matching contact", () => {
    const trigger = createTrigger("Test", "event", { type: "event", eventType: "message_received", contactOwnerId: "alice" }, { type: "notify_owner" });

    expect(shouldFireEventTrigger(trigger, "message_received", { contactOwnerId: "bob" })).toBe(false);
  });

  it("returns true for matching contact and event", () => {
    const trigger = createTrigger("Test", "event", { type: "event", eventType: "message_received", contactOwnerId: "alice" }, { type: "notify_owner" });

    expect(shouldFireEventTrigger(trigger, "message_received", { contactOwnerId: "alice" })).toBe(true);
  });
});

describe("shouldFireTopicTrigger", () => {
  it("returns true when content matches any keyword (OR)", () => {
    const trigger = createTrigger("Test", "topic", { type: "topic", keywords: ["urgent", "help"], matchAll: false }, { type: "notify_owner" });

    expect(shouldFireTopicTrigger(trigger, "I need help please")).toBe(true);
  });

  it("returns true when content matches all keywords (AND)", () => {
    const trigger = createTrigger("Test", "topic", { type: "topic", keywords: ["urgent", "help"], matchAll: true }, { type: "notify_owner" });

    expect(shouldFireTopicTrigger(trigger, "This is urgent and I need help")).toBe(true);
  });

  it("returns false when content missing keyword (AND)", () => {
    const trigger = createTrigger("Test", "topic", { type: "topic", keywords: ["urgent", "help"], matchAll: true }, { type: "notify_owner" });

    expect(shouldFireTopicTrigger(trigger, "I need help")).toBe(false);
  });

  it("is case insensitive", () => {
    const trigger = createTrigger("Test", "topic", { type: "topic", keywords: ["URGENT"], matchAll: false }, { type: "notify_owner" });

    expect(shouldFireTopicTrigger(trigger, "this is urgent!")).toBe(true);
  });
});

describe("TriggerStore", () => {
  describe("CRUD operations", () => {
    it("adds and retrieves trigger", () => {
      const store = new TriggerStore();
      const trigger = createTrigger("Test", "time", { type: "time", cron: "0 9 * * *" }, { type: "notify_owner" });
      store.addTrigger(trigger);

      const retrieved = store.getTrigger(trigger.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe("Test");
    });

    it("removes trigger", () => {
      const store = new TriggerStore();
      const trigger = createTrigger("Test", "time", { type: "time", cron: "0 9 * * *" }, { type: "notify_owner" });
      store.addTrigger(trigger);

      const removed = store.removeTrigger(trigger.id);
      expect(removed).toBe(true);
      expect(store.getTrigger(trigger.id)).toBeUndefined();
    });

    it("updates trigger", () => {
      const store = new TriggerStore();
      const trigger = createTrigger("Test", "time", { type: "time", cron: "0 9 * * *" }, { type: "notify_owner" });
      store.addTrigger(trigger);

      store.updateTrigger(trigger.id, { name: "Updated", enabled: false });
      const updated = store.getTrigger(trigger.id);
      expect(updated?.name).toBe("Updated");
      expect(updated?.enabled).toBe(false);
    });

    it("lists all triggers", () => {
      const store = new TriggerStore();
      store.addTrigger(createTrigger("T1", "time", { type: "time", cron: "0 9 * * *" }, { type: "notify_owner" }));
      store.addTrigger(createTrigger("T2", "event", { type: "event", eventType: "message_received" }, { type: "notify_owner" }));

      const all = store.listTriggers();
      expect(all).toHaveLength(2);
    });

    it("filters by type", () => {
      const store = new TriggerStore();
      store.addTrigger(createTrigger("T1", "time", { type: "time", cron: "0 9 * * *" }, { type: "notify_owner" }));
      store.addTrigger(createTrigger("T2", "event", { type: "event", eventType: "message_received" }, { type: "notify_owner" }));

      const timeTriggers = store.listTriggersByType("time");
      expect(timeTriggers).toHaveLength(1);
      expect(timeTriggers[0].name).toBe("T1");
    });
  });

  describe("time trigger checking", () => {
    it("finds triggers that should fire", () => {
      const store = new TriggerStore();
      store.addTrigger(createTrigger("Morning", "time", { type: "time", cron: "0 9 * * *" }, { type: "notify_owner" }));

      const date = new Date("2026-05-07T09:00:00Z");
      const toFire = store.checkTimeTriggers(date);
      expect(toFire).toHaveLength(1);
      expect(toFire[0].name).toBe("Morning");
    });
  });

  describe("topic trigger checking", () => {
    it("finds matching topic triggers", () => {
      const store = new TriggerStore();
      store.addTrigger(createTrigger("Urgent", "topic", { type: "topic", keywords: ["urgent"], matchAll: false }, { type: "notify_owner" }));

      const matches = store.checkTopicTriggers("This is urgent!");
      expect(matches).toHaveLength(1);
    });
  });

  describe("recordFire", () => {
    it("increments fire count", () => {
      const store = new TriggerStore();
      const trigger = createTrigger("Test", "time", { type: "time", cron: "0 9 * * *" }, { type: "notify_owner" });
      store.addTrigger(trigger);

      store.recordFire(trigger.id);
      const updated = store.getTrigger(trigger.id);
      expect(updated?.firesToday).toBe(1);
      expect(updated?.lastFiredAt).toBeDefined();
    });

    it("records error", () => {
      const store = new TriggerStore();
      const trigger = createTrigger("Test", "time", { type: "time", cron: "0 9 * * *" }, { type: "notify_owner" });
      store.addTrigger(trigger);

      store.recordFire(trigger.id, "Failed to send");
      const updated = store.getTrigger(trigger.id);
      expect(updated?.lastError).toBe("Failed to send");
      expect(updated?.status).toBe("error");
    });
  });
});

describe("buildListTriggersTool", () => {
  it("lists all triggers", async () => {
    const store = new TriggerStore();
    store.addTrigger(createTrigger("T1", "time", { type: "time", cron: "0 9 * * *" }, { type: "notify_owner" }));
    const tool = buildListTriggersTool(store);

    const result = await tool({});
    expect(result.ok).toBe(true);
    expect(result.count).toBe(1);
  });

  it("filters by type", async () => {
    const store = new TriggerStore();
    store.addTrigger(createTrigger("T1", "time", { type: "time", cron: "0 9 * * *" }, { type: "notify_owner" }));
    store.addTrigger(createTrigger("T2", "event", { type: "event", eventType: "message_received" }, { type: "notify_owner" }));
    const tool = buildListTriggersTool(store);

    const result = await tool({ type: "time" });
    expect(result.count).toBe(1);
    expect(result.triggers[0].name).toBe("T1");
  });
});

describe("buildAddTriggerTool", () => {
  it("adds a trigger", async () => {
    const store = new TriggerStore();
    const tool = buildAddTriggerTool(store);

    const result = await tool({
      name: "Morning check-in",
      triggerType: "time",
      condition: { type: "time", cron: "0 9 * * *" },
      action: { type: "notify_owner" },
    });

    expect(result.ok).toBe(true);
    expect(result.trigger?.name).toBe("Morning check-in");
  });

  it("returns error for missing name", async () => {
    const store = new TriggerStore();
    const tool = buildAddTriggerTool(store);

    const result = await tool({
      triggerType: "time",
      condition: { type: "time", cron: "0 9 * * *" },
      action: { type: "notify_owner" },
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("name");
  });

  it("returns error for invalid triggerType", async () => {
    const store = new TriggerStore();
    const tool = buildAddTriggerTool(store);

    const result = await tool({
      name: "Test",
      triggerType: "invalid",
      condition: { type: "time", cron: "0 9 * * *" },
      action: { type: "notify_owner" },
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("triggerType");
  });
});

describe("buildRemoveTriggerTool", () => {
  it("removes a trigger", async () => {
    const store = new TriggerStore();
    const trigger = createTrigger("Test", "time", { type: "time", cron: "0 9 * * *" }, { type: "notify_owner" });
    store.addTrigger(trigger);
    const tool = buildRemoveTriggerTool(store);

    const result = await tool({ triggerId: trigger.id });
    expect(result.ok).toBe(true);
    expect(store.getTrigger(trigger.id)).toBeUndefined();
  });

  it("returns error for missing triggerId", async () => {
    const store = new TriggerStore();
    const tool = buildRemoveTriggerTool(store);

    const result = await tool({});
    expect(result.ok).toBe(false);
    expect(result.error).toContain("triggerId");
  });

  it("returns error for non-existent trigger", async () => {
    const store = new TriggerStore();
    const tool = buildRemoveTriggerTool(store);

    const result = await tool({ triggerId: "non-existent" });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("not found");
  });
});

describe("buildUpdateTriggerTool", () => {
  it("updates a trigger", async () => {
    const store = new TriggerStore();
    const trigger = createTrigger("Test", "time", { type: "time", cron: "0 9 * * *" }, { type: "notify_owner" });
    store.addTrigger(trigger);
    const tool = buildUpdateTriggerTool(store);

    const result = await tool({ triggerId: trigger.id, name: "Updated name", enabled: false });
    expect(result.ok).toBe(true);
    expect(result.trigger?.name).toBe("Updated name");
    expect(result.trigger?.enabled).toBe(false);
  });

  it("returns error for missing triggerId", async () => {
    const store = new TriggerStore();
    const tool = buildUpdateTriggerTool(store);

    const result = await tool({ enabled: false });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("triggerId");
  });

  it("returns error for non-existent trigger", async () => {
    const store = new TriggerStore();
    const tool = buildUpdateTriggerTool(store);

    const result = await tool({ triggerId: "non-existent", enabled: false });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("not found");
  });
});
