/** @vitest-environment jsdom */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { createContactComposeDraftCrdt } from "../../src/lib/contact-compose-draft-crdt.js";

describe("contact-compose-draft-crdt", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("persists compose text per contact", () => {
    const draft = createContactComposeDraftCrdt("envoy:owner:self", "envoy:owner:peer");
    draft.setPlainText("hello peer");
    draft.destroy();

    const restored = createContactComposeDraftCrdt("envoy:owner:self", "envoy:owner:peer");
    expect(restored.getPlainText()).toBe("hello peer");
    restored.destroy();
  });

  it("isolates drafts by contact", () => {
    const a = createContactComposeDraftCrdt("envoy:owner:self", "envoy:owner:a");
    a.setPlainText("for a");
    a.destroy();
    const b = createContactComposeDraftCrdt("envoy:owner:self", "envoy:owner:b");
    expect(b.getPlainText()).toBe("");
    b.destroy();
  });

  it("skipWireSync clears locally without onLocalUpdate", () => {
    const updates: string[] = [];
    const draft = createContactComposeDraftCrdt("envoy:owner:self", "envoy:owner:peer", {
      onLocalUpdate: () => {
        updates.push("sync");
      },
    });
    draft.setPlainText("typed");
    expect(updates.length).toBe(1);
    draft.setPlainText("", { skipWireSync: true });
    expect(draft.getPlainText()).toBe("");
    expect(updates.length).toBe(1);
    draft.destroy();
  });
});
