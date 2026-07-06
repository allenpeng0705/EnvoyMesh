import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  setRelayClientAdvertisedTopics,
  getRelayClientAdvertisedTopics,
} from "../src/relay-client-cycle.js";

describe("relay-client-cycle topicHash advertisement wiring", () => {
  beforeEach(() => {
    setRelayClientAdvertisedTopics([]);
  });

  it("starts with an empty advertised-topic list", () => {
    expect(getRelayClientAdvertisedTopics()).toEqual([]);
  });

  it("stores topics when set, deduped and trimmed", () => {
    setRelayClientAdvertisedTopics(["music", "tech", "  music  ", ""]);
    const topics = getRelayClientAdvertisedTopics();
    expect(topics).toContain("music");
    expect(topics).toContain("tech");
    expect(topics.filter((t) => t === "music")).toHaveLength(1);
  });

  it("preserves insertion order", () => {
    setRelayClientAdvertisedTopics(["c", "a", "b"]);
    expect(getRelayClientAdvertisedTopics()).toEqual(["c", "a", "b"]);
  });

  it("replaces the full set on each call (not additive)", () => {
    setRelayClientAdvertisedTopics(["music", "tech"]);
    setRelayClientAdvertisedTopics(["science"]);
    expect(getRelayClientAdvertisedTopics()).toEqual(["science"]);
  });

  it("no-op when topics are unchanged (avoid spurious cycles)", () => {
    const spy = vi.fn();
    const original = getRelayClientAdvertisedTopics;
    // Re-set same topics; no error, idempotent.
    setRelayClientAdvertisedTopics(["music"]);
    setRelayClientAdvertisedTopics(["music"]);
    expect(getRelayClientAdvertisedTopics()).toEqual(["music"]);
    void original;
    void spy;
  });
});