import { describe, expect, it } from "vitest";
import {
  canAutonomousPublishMetadata,
  canAutonomousShareFile,
  DEFAULT_DOCUMENT_AUTONOMY_POLICY,
  normalizeDocumentAutonomyPolicy,
} from "../src/document-autonomy.js";

describe("document autonomy policy", () => {
  it("defaults to tier 0 proposals-only", () => {
    expect(normalizeDocumentAutonomyPolicy(undefined)).toEqual(DEFAULT_DOCUMENT_AUTONOMY_POLICY);
  });

  it("allows auto share only at tier 2 with direct bond and friends sensitivity", () => {
    const tier2 = normalizeDocumentAutonomyPolicy({ maxAutonomousShareTier: 2 });
    expect(
      canAutonomousShareFile({ policy: tier2, bondLevel: "direct", sensitivity: "friends" }),
    ).toBe(true);
    expect(
      canAutonomousShareFile({ policy: tier2, bondLevel: "direct", sensitivity: "private" }),
    ).toBe(false);
    expect(
      canAutonomousShareFile({ policy: tier2, bondLevel: "referred", sensitivity: "friends" }),
    ).toBe(false);
    expect(
      canAutonomousShareFile({ policy: DEFAULT_DOCUMENT_AUTONOMY_POLICY, bondLevel: "direct", sensitivity: "friends" }),
    ).toBe(false);
  });

  it("allows autonomous publish metadata at tier 1+", () => {
    expect(canAutonomousPublishMetadata(DEFAULT_DOCUMENT_AUTONOMY_POLICY)).toBe(false);
    expect(
      canAutonomousPublishMetadata(
        normalizeDocumentAutonomyPolicy({ maxAutonomousShareTier: 1, allowAutonomousPublish: true }),
      ),
    ).toBe(true);
  });
});
