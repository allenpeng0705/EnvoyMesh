import { describe, it, expect } from "vitest";
import { buildMessageStacks, stackPosition } from "../../src/lib/chat-message-stack.js";

describe("buildMessageStacks", () => {
  it("groups consecutive same-side items", () => {
    const items = ["a", "a", "b", "b", "b", "a"];
    const stacks = buildMessageStacks(items, (x, y) => x === y);
    expect(stacks).toEqual([["a", "a"], ["b", "b", "b"], ["a"]]);
  });

  it("returns empty for no items", () => {
    expect(buildMessageStacks([], () => true)).toEqual([]);
  });
});

describe("stackPosition", () => {
  it("labels positions in a three-bubble stack", () => {
    expect(stackPosition(0, 3)).toBe("first");
    expect(stackPosition(1, 3)).toBe("middle");
    expect(stackPosition(2, 3)).toBe("last");
  });

  it("single bubble", () => {
    expect(stackPosition(0, 1)).toBe("single");
  });
});
