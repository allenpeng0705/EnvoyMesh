/**
 * Isolation tests for one-shot JSON parsing — Cursor vs MiniMax preferences
 * must not steal each other's fields.
 */
import { describe, expect, it } from "vitest";
import {
  extractContentBlocks,
  extractOneShotAssistantText,
} from "../src/ext-agent-adapter/parse-one-shot-json.js";

describe("extractOneShotAssistantText", () => {
  describe("Cursor preference (flat-first)", () => {
    it("reads result before content blocks", () => {
      const raw = JSON.stringify({
        result: "cursor result wins",
        content: [{ type: "text", text: "should not win" }],
      });
      expect(
        extractOneShotAssistantText(raw, {
          flatKeys: ["result", "text", "response", "output"],
          prefer: "flat-first",
        }),
      ).toBe("cursor result wins");
    });

    it("falls back to content blocks when flat keys are absent", () => {
      const raw = JSON.stringify({
        content: [{ type: "text", text: "from blocks" }],
      });
      expect(
        extractOneShotAssistantText(raw, {
          flatKeys: ["result", "text"],
          prefer: "flat-first",
        }),
      ).toBe("from blocks");
    });

    it("picks the last NDJSON object with text", () => {
      const raw = [
        JSON.stringify({ type: "system", text: "" }),
        JSON.stringify({ result: "first" }),
        JSON.stringify({ result: "final answer" }),
      ].join("\n");
      expect(
        extractOneShotAssistantText(raw, {
          flatKeys: ["result", "text"],
          prefer: "flat-first",
          ndjson: true,
        }),
      ).toBe("final answer");
    });
  });

  describe("MiniMax preference (content-first)", () => {
    it("reads Messages API content[].text (live mmx 1.x shape)", () => {
      const raw = JSON.stringify({
        id: "06cc5309146f1d85b765ae48fe138e33",
        type: "message",
        role: "assistant",
        model: "MiniMax-M3",
        content: [{ text: "Hello! How can I help you today?", type: "text" }],
        usage: { input_tokens: 36, output_tokens: 10 },
        stop_reason: "end_turn",
      });
      expect(
        extractOneShotAssistantText(raw, {
          flatKeys: ["text", "response", "output", "message"],
          prefer: "content-first",
        }),
      ).toBe("Hello! How can I help you today?");
    });

    it("prefers content blocks over a misleading flat message type string", () => {
      // `type: "message"` must not be read as assistant text via flatKeys.
      const raw = JSON.stringify({
        type: "message",
        content: [{ type: "text", text: "real reply" }],
      });
      expect(
        extractOneShotAssistantText(raw, {
          flatKeys: ["text", "response", "output", "message"],
          prefer: "content-first",
        }),
      ).toBe("real reply");
    });

    it("falls back to flat text for older mmx shapes", () => {
      const raw = JSON.stringify({
        text: "legacy flat text",
        session_id: "s1",
        model: "MiniMax-M2.7",
      });
      expect(
        extractOneShotAssistantText(raw, {
          flatKeys: ["text", "response", "output", "message"],
          prefer: "content-first",
        }),
      ).toBe("legacy flat text");
    });

    it("joins multiple text content blocks", () => {
      const raw = JSON.stringify({
        content: [
          { type: "text", text: "part one" },
          { type: "tool_use", id: "t1" },
          { type: "text", text: "part two" },
        ],
      });
      expect(
        extractOneShotAssistantText(raw, {
          prefer: "content-first",
          flatKeys: ["text"],
        }),
      ).toBe("part one\npart two");
    });
  });

  describe("safety", () => {
    it("returns null for plain text (caller keeps raw)", () => {
      expect(extractOneShotAssistantText("just plain text")).toBeNull();
    });

    it("returns null for empty / non-object JSON", () => {
      expect(extractOneShotAssistantText("")).toBeNull();
      expect(extractOneShotAssistantText("[1,2,3]")).toBeNull();
      expect(extractOneShotAssistantText("{not-json")).toBeNull();
    });

    it("skips tool_use-only content arrays", () => {
      expect(
        extractContentBlocks([{ type: "tool_use", id: "x" }]),
      ).toBeNull();
    });
  });
});
