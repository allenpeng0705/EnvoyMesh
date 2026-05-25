import { describe, expect, it } from "vitest";
import { parseModelThinking, stripModelThinking } from "../src/model-thinking.js";

const OPEN = "<redacted_thinking>";
const CLOSE = "</redacted_thinking>";

describe("parseModelThinking", () => {
  it("extracts thinking and visible reply", () => {
    const raw = `${OPEN}Plan a short greeting.${CLOSE}\n\n你好！很高兴收到你的消息。`;
    expect(parseModelThinking(raw)).toEqual({
      thinking: "Plan a short greeting.",
      visibleText: "你好！很高兴收到你的消息。",
    });
  });

  it("returns null thinking when absent", () => {
    expect(parseModelThinking("Hello there")).toEqual({
      thinking: null,
      visibleText: "Hello there",
    });
  });

  it("is case-insensitive for tags", () => {
    const raw = "<REDACTED_THINKING>notes</REDACTED_THINKING>\n\nReply";
    expect(parseModelThinking(raw).visibleText).toBe("Reply");
    expect(parseModelThinking(raw).thinking).toBe("notes");
  });
});

describe("stripModelThinking", () => {
  it("removes all thinking blocks", () => {
    const raw = `${OPEN}a${CLOSE}${OPEN}b${CLOSE}\n\nHi`;
    expect(stripModelThinking(raw)).toBe("Hi");
  });
});
