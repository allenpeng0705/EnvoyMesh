/**
 * Phase 8 / v1.3 — unit tests for the
 * skill-result-formatter.
 *
 * **What this covers:** the dispatch logic in
 * `formatSkillResult`:
 * - `text` first block → join text blocks (v1.2
 *   unchanged).
 * - `structured` first block → dispatch to the
 *   per-skill B-class formatter (v1.3 new), or
 *   return `undefined` on silent fall-through
 *   (Q6).
 * - `tool-call` blocks formatted before `tool-result`
 *   when in a B-class result (Q5 narrow).
 * - `file` / `image` first block → vault-path
 *   summary (v1.2 unchanged).
 * - Empty content → `""` (v1.2 unchanged).
 *
 * **Per-skill formatter tests:** the B-class
 * formatters themselves are tested in
 * `b-class-result-formatters.test.ts`. This file
 * tests the dispatch logic.
 */
import { describe, expect, it, vi } from "vitest";

import { formatSkillResult } from "../src/skill-result-formatter.js";
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

/** Helper to build a `tool-result` structured block
 *  with a JSON-stringified payload. */
function toolResultBlock(payload: unknown): {
  kind: "structured";
  schemaRef: "envoymesh://tool-result/v1";
  data: { toolCallId: string; content: string; isError: boolean };
} {
  return {
    kind: "structured",
    schemaRef: "envoymesh://tool-result/v1",
    data: {
      toolCallId: "tc-1",
      content: JSON.stringify(payload),
      isError: false,
    },
  };
}

/** Helper to build a `tool-call` structured block. */
function toolCallBlock(
  name: string,
  args: Record<string, unknown> = {},
): {
  kind: "structured";
  schemaRef: "envoymesh://tool-call/v1";
  data: { id: string; name: string; args: Record<string, unknown> };
} {
  return {
    kind: "structured",
    schemaRef: "envoymesh://tool-call/v1",
    data: {
      id: "tc-1",
      name,
      args,
    },
  };
}

// ---------------------------------------------------------------------------
// 1. text first block (v1.2 unchanged)
// ---------------------------------------------------------------------------

describe("formatSkillResult — text first block", () => {
  it("returns the text of a single text block", () => {
    const result = makeResult([{ kind: "text", text: "Hello, world!" }]);
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
    // The first-block contract: if the first is text
    // but later blocks are structured, we just
    // return the joined text blocks. v1.3 doesn't
    // try to handle the trailing structured
    // blocks (v1.3 only formats structured as
    // FIRST block; trailing structured is
    // dropped).
    const result = makeResult([
      { kind: "text", text: "Here's the summary." },
      { kind: "structured", schemaRef: "envoymesh://peer-list/v1", data: {} },
    ]);
    expect(formatSkillResult(result)).toBe("Here's the summary.");
  });
});

// ---------------------------------------------------------------------------
// 2. structured first block — B-class dispatch (v1.3 NEW)
// ---------------------------------------------------------------------------

describe("formatSkillResult — B-class structured first block (v1.3)", () => {
  it("dispatches a setup-sponsor-friend tool-result to the per-skill formatter", () => {
    const result = makeResult(
      [toolResultBlock({ ok: true, ownerId: "12D3Koo", attempts: 1 })],
      "setup-sponsor-friend",
    );
    const out = formatSkillResult(result);
    expect(out).toBe(
      "Bonded with sponsor (12D3Koo) after 1 attempt",
    );
  });

  it("dispatches a peer-list tool-result to the per-skill formatter", () => {
    const result = makeResult(
      [toolResultBlock({ total: 0, entries: [], text: "" })],
      "peer-list",
    );
    expect(formatSkillResult(result)).toBe("Observed 0 peers: (none)");
  });

  it("dispatches a relay-status tool-result to the per-skill formatter", () => {
    const result = makeResult(
      [toolResultBlock({ text: "", json: "", snapshot: null })],
      "relay-status",
    );
    expect(formatSkillResult(result)).toBe("Relay: not running");
  });

  it("prepends a tool-call summary before the tool-result (Q5 narrow)", () => {
    // The B-class chat reply has 2 paragraphs separated
    // by `\n\n`:
    // - paragraph 1: "Sponsor: called `sponsor_friend` (force=true)"
    // - paragraph 2: the tool-result (verbose, multi-line;
    //   has its own internal `\n\n` between the user-readable
    //   block and the debug details block).
    const result = makeResult(
      [
        toolCallBlock("sponsor_friend", { force: true }),
        toolResultBlock({
          ok: false,
          reason: "auto-exhausted",
          lastErrorKind: "network-unreachable",
          attempts: 5,
        }),
      ],
      "setup-sponsor-friend",
    );
    const out = formatSkillResult(result);
    expect(out).toBeDefined();
    // Split by `\n\n` — the tool-call is paragraph 1.
    // The tool-result spans paragraphs 2+ (it has an
    // internal `\n\n` between the user-readable block
    // and the debug details block).
    const toolCallParagraph = out!.split("\n\n")[0];
    expect(toolCallParagraph).toBe(
      'Sponsor: called `sponsor_friend` (force=true)',
    );
    // The user-readable headline is in paragraph 2.
    expect(out).toContain("Couldn't set up the sponsor bond.");
    expect(out).toContain("Your relay is unreachable. The network kept dropping.");
    // The debug details block is at the bottom.
    expect(out).toContain("[debug details:]");
    expect(out).toContain("lastErrorKind: network-unreachable");
  });

  it("formats the tool-call without args as `<Name>: called `<tool>``", () => {
    const result = makeResult(
      [
        toolCallBlock("list_peers"),
        toolResultBlock({ total: 0, entries: [], text: "" }),
      ],
      "peer-list",
    );
    const out = formatSkillResult(result);
    expect(out).toBeDefined();
    const lines = out!.split("\n\n");
    expect(lines[0]).toBe('Peers: called `list_peers`');
  });

  it("formats tool-call args as `key=value`", () => {
    const result = makeResult(
      [
        toolCallBlock("relay_status", { verbose: true }),
        toolResultBlock({ text: "", json: "", snapshot: null }),
      ],
      "relay-status",
    );
    const out = formatSkillResult(result);
    expect(out).toBeDefined();
    expect(out!.split("\n\n")[0]).toBe(
      'Relay: called `relay_status` (verbose=true)',
    );
  });
});

// ---------------------------------------------------------------------------
// 3. structured first block — silent fall-through (Q6)
// ---------------------------------------------------------------------------

describe("formatSkillResult — silent fall-through (Q6)", () => {
  it("returns undefined for an unknown schemaRef", () => {
    const result = makeResult(
      [
        {
          kind: "structured",
          schemaRef: "envoymesh://unknown/v1",
          data: {},
        },
      ],
      "setup-sponsor-friend",
    );
    expect(formatSkillResult(result)).toBeUndefined();
  });

  it("returns undefined for a non-B-class skillId (e.g. code-edit)", () => {
    const result = makeResult(
      [toolResultBlock({ kind: "text", text: "ignored" })],
      "code-edit",
    );
    expect(formatSkillResult(result)).toBeUndefined();
  });

  it("returns undefined for malformed tool-result data.content (graceful fail)", () => {
    const result = makeResult(
      [
        {
          kind: "structured",
          schemaRef: "envoymesh://tool-result/v1",
          data: { toolCallId: "tc-1", content: "not valid json {{", isError: false },
        },
      ],
      "setup-sponsor-friend",
    );
    expect(formatSkillResult(result)).toBeUndefined();
  });

  it("logs a console.debug line on silent fall-through (so owners can diagnose)", () => {
    // The debug log is silent in production (no
    // console.debug output by default). In
    // dev/staging with verbose logging, the
    // owner sees which skillId + schemaRef
    // didn't have a formatter.
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => undefined);
    try {
      const result = makeResult(
        [
          {
            kind: "structured",
            schemaRef: "envoymesh://unknown/v1",
            data: {},
          },
        ],
        "test-skill",
      );
      formatSkillResult(result);
      expect(debugSpy).toHaveBeenCalled();
      const firstCall = debugSpy.mock.calls[0];
      expect(String(firstCall?.[0] ?? "")).toContain("test-skill");
      expect(String(firstCall?.[0] ?? "")).toContain("envoymesh://unknown/v1");
    } finally {
      debugSpy.mockRestore();
    }
  });

  it("does NOT log on a successful B-class format (no noise)", () => {
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => undefined);
    try {
      const result = makeResult(
        [toolResultBlock({ ok: true, ownerId: "12D3Koo", attempts: 1 })],
        "setup-sponsor-friend",
      );
      formatSkillResult(result);
      // The successful B-class path doesn't log.
      expect(debugSpy).not.toHaveBeenCalled();
    } finally {
      debugSpy.mockRestore();
    }
  });
});

// ---------------------------------------------------------------------------
// 4. structured first block — tool-call only (no tool-result)
// ---------------------------------------------------------------------------

describe("formatSkillResult — tool-call only (no tool-result)", () => {
  it("formats the tool-call alone when there's no tool-result", () => {
    // Rare case: the model called a tool but the
    // result doesn't include the tool's response
    // (e.g. the result was truncated). The
    // formatter still produces a chat line.
    const result = makeResult(
      [toolCallBlock("sponsor_friend", { force: true })],
      "setup-sponsor-friend",
    );
    const out = formatSkillResult(result);
    expect(out).toBe('Sponsor: called `sponsor_friend` (force=true)');
  });

  it("returns undefined for a tool-call with a malformed data shape", () => {
    const result = makeResult(
      [
        {
          kind: "structured",
          schemaRef: "envoymesh://tool-call/v1",
          data: "not an object",
        },
      ],
      "setup-sponsor-friend",
    );
    expect(formatSkillResult(result)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 5. file / image first block (v1.2 unchanged)
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
// 6. Empty content (v1.2 unchanged)
// ---------------------------------------------------------------------------

describe("formatSkillResult — empty content", () => {
  it("returns empty string for an empty content array", () => {
    const result = makeResult([]);
    expect(formatSkillResult(result)).toBe("");
  });
});
