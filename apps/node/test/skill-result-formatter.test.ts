/**
 * Phase 8 / v1.2 — unit tests for the
 * skill-result-formatter.
 *
 * **What this covers:** the bridge between
 * envoy-harness's structured `AgentResult` and
 * the Tauri chat surface's string reply. The
 * formatter is the host-side adapter that
 * converts typed `ContentBlock[]` to a chat
 * string.
 *
 * **v1.2 rules (Q2 of the v1.2 sub-plan):**
 * - `text` first block → return text.
 * - Multiple text blocks → joined with `\n\n`.
 * - `structured` first block → throws
 *   `StructuredResultError` (B-class).
 * - `file` / `image` first block → vault-path
 *   summary.
 * - Empty content → `""`.
 */
import { describe, expect, it } from "vitest";

import {
  formatSkillResult,
  StructuredResultError,
} from "../src/skill-result-formatter.js";
import type { SignedAgentResult } from "@envoymesh/protocol";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal `SignedAgentResult` for testing.
 * The signature field is empty; tests don't verify
 * signatures (the verifier does, in another test
 * file).
 */
function makeResult(
  content: SignedAgentResult["content"],
  skillId: string = "test-skill",
): SignedAgentResult {
  return {
    skillId,
    runtime: "envoy-harness",
    peerId: "test-node",
    correlationId: "test-corr",
    content,
    citations: [],
    metrics: {
      durationMs: 100,
      costUsd: 0.001,
    },
    completedAt: new Date().toISOString(),
    signature: "test-signature",
  };
}

// ---------------------------------------------------------------------------
// 1. text first block
// ---------------------------------------------------------------------------

describe("formatSkillResult — text first block", () => {
  it("returns the text of a single text block", () => {
    const result = makeResult([
      { kind: "text", text: "Hello, world!" },
    ]);
    expect(formatSkillResult(result)).toBe("Hello, world!");
  });

  it("joins multiple text blocks with \\n\\n", () => {
    const result = makeResult([
      { kind: "text", text: "First paragraph." },
      { kind: "text", text: "Second paragraph." },
      { kind: "text", text: "Third paragraph." },
    ]);
    expect(formatSkillResult(result)).toBe(
      "First paragraph.\n\nSecond paragraph.\n\nThird paragraph.",
    );
  });

  it("preserves text block mimeType (does not modify the text)", () => {
    const result = makeResult([
      {
        kind: "text",
        text: "```\nconsole.log('hi')\n```",
        mimeType: "text/markdown",
      },
    ]);
    expect(formatSkillResult(result)).toBe("```\nconsole.log('hi')\n```");
  });

  it("filters out non-text blocks (text first + structured later → returns just the text)", () => {
    // Per the v1.2 contract, the FIRST block
    // determines the path. If the first is text
    // but later blocks are structured, we just
    // return the joined text blocks. v1.2 doesn't
    // try to handle the trailing structured
    // blocks (v1.3+ formatter).
    const result = makeResult([
      { kind: "text", text: "Here's the summary." },
      { kind: "structured", schemaRef: "envoymesh://peer-list/v1", data: {} },
    ]);
    expect(formatSkillResult(result)).toBe("Here's the summary.");
  });
});

// ---------------------------------------------------------------------------
// 2. structured first block (B-class) → throws
// ---------------------------------------------------------------------------

describe("formatSkillResult — structured first block (B-class)", () => {
  it("throws StructuredResultError with the skillId and schemaRef", () => {
    const result = makeResult(
      [
        {
          kind: "structured",
          schemaRef: "envoymesh://sponsor-bond/v1",
          data: { sponsorPeerId: "12D3Koo..." },
        },
      ],
      "setup-sponsor-friend",
    );
    expect(() => formatSkillResult(result)).toThrow(StructuredResultError);
    try {
      formatSkillResult(result);
    } catch (err) {
      expect(err).toBeInstanceOf(StructuredResultError);
      const e = err as StructuredResultError;
      expect(e.skillId).toBe("setup-sponsor-friend");
      expect(e.schemaRef).toBe("envoymesh://sponsor-bond/v1");
      expect(e.name).toBe("StructuredResultError");
    }
  });

  it("throws even when later blocks are text (first-block contract)", () => {
    // The v1.2 contract: the FIRST block
    // determines the path. A structured first
    // block is a B-class signal; trailing text
    // doesn't change that.
    const result = makeResult(
      [
        {
          kind: "structured",
          schemaRef: "envoymesh://relay-status/v1",
          data: { relays: [] },
        },
        { kind: "text", text: "See structured data above." },
      ],
      "relay-status",
    );
    expect(() => formatSkillResult(result)).toThrow(StructuredResultError);
  });
});

// ---------------------------------------------------------------------------
// 3. file / image first block
// ---------------------------------------------------------------------------

describe("formatSkillResult — file / image first block", () => {
  it("returns vault path summary for a file block", () => {
    const result = makeResult([
      {
        kind: "file",
        vaultPath: "vault/notes/draft.md",
        contentHash: "Qm123...",
        displayName: "Draft Notes",
        mimeType: "text/markdown",
      },
    ]);
    expect(formatSkillResult(result)).toBe(
      "Saved to vault: vault/notes/draft.md",
    );
  });

  it("returns vault path summary for an image block", () => {
    const result = makeResult([
      {
        kind: "image",
        vaultPath: "vault/photos/avatar.png",
        contentHash: "Qm456...",
        mimeType: "image/png",
        altText: "User avatar",
      },
    ]);
    expect(formatSkillResult(result)).toBe(
      "Saved image to vault: vault/photos/avatar.png",
    );
  });
});

// ---------------------------------------------------------------------------
// 4. Empty content
// ---------------------------------------------------------------------------

describe("formatSkillResult — empty content", () => {
  it("returns empty string for an empty content array", () => {
    const result = makeResult([]);
    expect(formatSkillResult(result)).toBe("");
  });
});
