import { describe, expect, it } from "vitest";
import {
  clampKnowledgeSyndicationSensitivity,
  resolveKnowledgeSyndicationSensitivity,
  syndicationSensitivityToKnowledgeAccess,
} from "../src/knowledge-syndication.js";

describe("knowledge-syndication", () => {
  it("clamps allowed sensitivity to owner ceiling", () => {
    expect(clampKnowledgeSyndicationSensitivity("private", "friends")).toBe("friends");
    expect(clampKnowledgeSyndicationSensitivity("public", "friends")).toBe("public");
    expect(clampKnowledgeSyndicationSensitivity("friends", undefined)).toBe("friends");
  });

  it("maps syndication sensitivity to knowledge access tier", () => {
    expect(syndicationSensitivityToKnowledgeAccess("public")).toBe("public");
    expect(syndicationSensitivityToKnowledgeAccess("friends")).toBe("professional");
    expect(syndicationSensitivityToKnowledgeAccess("private")).toBe("personal");
  });

  it("applies global then per-contact ceilings", () => {
    expect(resolveKnowledgeSyndicationSensitivity("private", "friends", "public")).toBe("public");
    expect(resolveKnowledgeSyndicationSensitivity("friends", "private", "friends")).toBe("friends");
  });
});
