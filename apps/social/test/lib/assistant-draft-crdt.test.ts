/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import { createAssistantDraftCrdt } from "../../src/lib/assistant-draft-crdt.js";

describe("assistant-draft-crdt", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it("persists compose text per owner across instances", () => {
    const first = createAssistantDraftCrdt("envoy:owner:test");
    first.setPlainText("Hello draft");
    first.destroy();

    const second = createAssistantDraftCrdt("envoy:owner:test");
    expect(second.getPlainText()).toBe("Hello draft");
    second.destroy();
  });

  it("isolates drafts by owner id", () => {
    const a = createAssistantDraftCrdt("envoy:owner:a");
    a.setPlainText("A text");
    a.destroy();

    const b = createAssistantDraftCrdt("envoy:owner:b");
    expect(b.getPlainText()).toBe("");
    b.destroy();
  });

  it("applies remote updates without echoing to onLocalUpdate", () => {
    const seen: string[] = [];
    const draft = createAssistantDraftCrdt("envoy:owner:sync", {
      onLocalUpdate: (u) => seen.push(u),
    });
    draft.setPlainText("local");
    const remote = draft.encodeFullStateBase64();
    seen.length = 0;
    draft.applyRemoteUpdate(remote);
    expect(draft.getPlainText()).toBe("local");
    expect(seen.length).toBe(0);
    draft.destroy();
  });
});
