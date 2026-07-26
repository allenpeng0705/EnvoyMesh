import { describe, expect, it } from "vitest";
import {
  buildAuthorContentDraftPrompt,
  defaultModeForExistingText,
  defaultTonesForSurface,
  sanitizeAuthorDraftOutput,
} from "../src/author-content-draft.js";

describe("author-content-draft", () => {
  it("defaults mode and tones by surface", () => {
    expect(defaultModeForExistingText("")).toBe("write");
    expect(defaultModeForExistingText("hello")).toBe("rewrite");
    expect(defaultTonesForSurface("bio")).toEqual(["professional", "casual", "playful"]);
    expect(defaultTonesForSurface("caption")).toEqual(["descriptive", "poetic"]);
    expect(defaultTonesForSurface("feed")).toEqual(["casual", "playful", "personal"]);
  });

  it("builds a Moments feed prompt", () => {
    const prompt = buildAuthorContentDraftPrompt({
      surface: "feed",
      mode: "write",
      tone: "casual",
      hint: "weekend hike with friends",
    });
    expect(prompt).toContain("Friend Circle");
    expect(prompt).toContain("Moments");
    expect(prompt).toContain("weekend hike with friends");
    expect(prompt).toContain("Return ONLY the drafted content");
  });

  it("builds a bio rewrite prompt with profile context", () => {
    const prompt = buildAuthorContentDraftPrompt({
      surface: "bio",
      mode: "rewrite",
      tone: "casual",
      existingText: "I like music.",
      profileContext: { displayName: "Alice", hobbies: ["music"] },
    });
    expect(prompt).toContain("profile bio");
    expect(prompt).toContain("Rewrite");
    expect(prompt).toContain("I like music.");
    expect(prompt).toContain("Alice");
    expect(prompt).toContain("Return ONLY the drafted content");
  });

  it("sanitizes fenced model output", () => {
    expect(sanitizeAuthorDraftOutput("```markdown\nHello world\n```")).toBe("Hello world");
    expect(sanitizeAuthorDraftOutput("Here's a draft:\nNice bio")).toBe("Nice bio");
  });
});
