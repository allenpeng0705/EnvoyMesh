import { describe, expect, it } from "vitest";
import { parseModelThinking, stripModelThinking } from "../src/model-thinking.js";

describe("parseModelThinking", () => {
  it("extracts MiniMax think tags", () => {
    const tag = "think";
    const open = `<${tag}>`;
    const close = `</${tag}>`;
    const raw = `${open}Plan a short greeting.${close}\n\n你好！`;
    expect(parseModelThinking(raw)).toEqual({
      thinking: "Plan a short greeting.",
      visibleText: "你好！",
    });
  });

  it("extracts redacted_thinking tags", () => {
    const raw = "<think>notes</think>\n\nReply";
    expect(parseModelThinking(raw).visibleText).toBe("Reply");
    expect(parseModelThinking(raw).thinking).toBe("notes");
  });

  it("returns null thinking when absent", () => {
    expect(parseModelThinking("Hello there")).toEqual({
      thinking: null,
      visibleText: "Hello there",
    });
  });
});

describe("stripModelThinking", () => {
  it("removes think blocks from real auto-reply shape", () => {
    const raw =
      '<think>reasoning here</think>\n\n[AI Agent Draft Reply]\n\n我能帮你回答问题！';
    expect(stripModelThinking(raw)).toBe("[AI Agent Draft Reply]\n\n我能帮你回答问题！");
  });
});
