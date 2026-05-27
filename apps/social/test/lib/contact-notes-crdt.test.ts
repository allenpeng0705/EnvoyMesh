/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import { createContactNotesCrdt } from "../../src/lib/contact-notes-crdt.js";

describe("contact-notes-crdt", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it("persists note and tags per contact", () => {
    const first = createContactNotesCrdt("envoy:owner:self", "envoy:owner:peer");
    first.setNote("Met at conference");
    first.addTag("research");
    first.destroy();

    const restored = createContactNotesCrdt("envoy:owner:self", "envoy:owner:peer");
    expect(restored.getNote()).toBe("Met at conference");
    expect(restored.getTags()).toEqual(["research"]);
    restored.destroy();
  });

  it("merges remote updates without echoing onLocalUpdate", () => {
    const seen: string[] = [];
    const left = createContactNotesCrdt("envoy:owner:self", "envoy:owner:peer", {
      onLocalUpdate: (update) => seen.push(update),
    });
    left.setNote("from left");
    const update = seen[0];
    expect(update).toBeTruthy();
    seen.length = 0;

    const right = createContactNotesCrdt("envoy:owner:self", "envoy:owner:peer", {
      onLocalUpdate: (u) => seen.push(u),
    });
    right.applyRemoteUpdate(update!);
    expect(right.getNote()).toBe("from left");
    expect(seen.length).toBe(0);

    left.destroy();
    right.destroy();
  });
});
