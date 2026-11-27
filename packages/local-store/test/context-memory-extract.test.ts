import { describe, expect, it } from "vitest";
import {
  buildContextMemoryExtractPrompt,
  extractDurableFactsFromTurn,
  isTransientFactSnippet,
  mergeExtractedFacts,
  parseLlmExtractedFacts,
  parseMemoryMdSeedLines,
  shouldTryLlmFactExtract,
} from "../src/context-memory-extract.js";

describe("context-memory-extract", () => {
  it("isTransientFactSnippet catches denial and want/need", () => {
    expect(isTransientFactSnippet("I never said that about you")).toBe(true);
    expect(isTransientFactSnippet("I always forget passwords")).toBe(true);
    expect(isTransientFactSnippet("I want pizza tonight")).toBe(true);
    expect(isTransientFactSnippet("I prefer dark mode")).toBe(false);
  });

  it("extractDurableFactsFromTurn covers en/zh durable cues", () => {
    expect(extractDurableFactsFromTurn({ userText: "I always use dark mode" }).length).toBeGreaterThan(
      0,
    );
    expect(
      extractDurableFactsFromTurn({ userText: "My timezone is Asia/Shanghai" }).some((f) =>
        /shanghai/i.test(f),
      ),
    ).toBe(true);
    expect(
      extractDurableFactsFromTurn({ userText: "请记住我的名字是小明" }).some((f) => /小明/.test(f)),
    ).toBe(true);
    expect(
      extractDurableFactsFromTurn({ userText: "我喜欢简洁清晰的回答风格" }).length,
    ).toBeGreaterThan(0);
    expect(extractDurableFactsFromTurn({ userText: "" })).toEqual([]);
  });

  it("parseLlmExtractedFacts handles fences, objects, and junk", () => {
    expect(parseLlmExtractedFacts('```json\n["User prefers tea"]\n```')).toEqual([
      "User prefers tea",
    ]);
    expect(parseLlmExtractedFacts('Here you go: ["A durable preference about fonts"]')).toEqual([
      "A durable preference about fonts",
    ]);
    expect(parseLlmExtractedFacts("not json at all")).toEqual([]);
    expect(parseLlmExtractedFacts('{"facts":[]}')).toEqual([]);
    expect(parseLlmExtractedFacts('["short", "User prefers dark mode theme"]')).toEqual([
      "User prefers dark mode theme",
    ]);
    expect(parseLlmExtractedFacts(null)).toEqual([]);
  });

  it("mergeExtractedFacts dedupes and keeps short CJK", () => {
    expect(mergeExtractedFacts(["我喜欢简洁"], ["我喜欢简洁", "User timezone is UTC"])).toEqual([
      "我喜欢简洁",
      "User timezone is UTC",
    ]);
    expect(mergeExtractedFacts(["ab"], ["cd"])).toEqual([]);
  });

  it("shouldTryLlmFactExtract cost gates", () => {
    expect(
      shouldTryLlmFactExtract({ userText: "short", heuristicFacts: [] }),
    ).toBe(false);
    expect(
      shouldTryLlmFactExtract({
        userText: "I prefer dark mode in every application I open daily",
        heuristicFacts: ["I prefer dark mode in every application I open daily"],
      }),
    ).toBe(false);
    expect(
      shouldTryLlmFactExtract({
        userText:
          "For production we stick with Docker Compose across every service rather than Kubernetes.",
        heuristicFacts: [],
      }),
    ).toBe(true);
    expect(
      shouldTryLlmFactExtract({
        userText: "What is the capital of France today?",
        heuristicFacts: [],
      }),
    ).toBe(false);
  });

  it("buildContextMemoryExtractPrompt asks for JSON array", () => {
    const prompt = buildContextMemoryExtractPrompt({
      userText: "I like tea",
      assistantText: "Noted.",
    });
    expect(prompt).toMatch(/JSON array/i);
    expect(prompt).toContain("USER:");
    expect(prompt).toContain("ASSISTANT:");
  });

  it("parseMemoryMdSeedLines filters noise", () => {
    expect(
      parseMemoryMdSeedLines("# Title\n\n- Keep this durable line please\n- x\nMEMORY.md\n"),
    ).toEqual(["Keep this durable line please"]);
  });
});
