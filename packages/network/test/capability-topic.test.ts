import { describe, expect, it } from "vitest";
import { CAPABILITY_TOPIC_NAMESPACE, cidForCapabilityTopic } from "../src/capability-topic.js";

describe("cidForCapabilityTopic", () => {
  it("is deterministic for the same topic string", async () => {
    const a = await cidForCapabilityTopic("task.execute");
    const b = await cidForCapabilityTopic("task.execute");
    expect(a.toString()).toBe(b.toString());
  });

  it("changes when the topic changes", async () => {
    const a = await cidForCapabilityTopic("a");
    const b = await cidForCapabilityTopic("b");
    expect(a.equals(b)).toBe(false);
  });

  it("includes the namespace prefix in the preimage", async () => {
    const withNs = await cidForCapabilityTopic("x");
    const raw = await cidForCapabilityTopic(`${CAPABILITY_TOPIC_NAMESPACE}x`);
    expect(withNs.equals(raw)).toBe(false);
  });

  it("rejects empty topics", async () => {
    await expect(cidForCapabilityTopic("")).rejects.toThrow(/non-empty/);
    await expect(cidForCapabilityTopic("   ")).rejects.toThrow(/non-empty/);
  });
});
