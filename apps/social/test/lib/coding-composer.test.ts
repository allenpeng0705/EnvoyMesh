/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from "vitest";
import { codingComposerCapabilities } from "../../src/lib/coding-composer-capabilities.js";
import {
  shapeCodingComposerPrompt,
  fastToggleSlash,
} from "../../src/lib/coding-composer-prompt.js";
import {
  codingComposerSessionKey,
  loadCodingComposerPrefs,
  saveCodingComposerPrefs,
} from "../../src/lib/coding-composer-state.js";

describe("codingComposerCapabilities", () => {
  it("enables attach and modes for Envoy, Pi, and Tier B", () => {
    expect(codingComposerCapabilities("envoy-harness").attach).toBe(true);
    expect(codingComposerCapabilities("pi").attach).toBe(true);
    expect(codingComposerCapabilities("codex").attach).toBe(true);
  });

  it("gates fast/plan/thinking for Codex and Claude Code", () => {
    const codex = codingComposerCapabilities("codex");
    expect(codex.fast).toBe(true);
    expect(codex.planSlash).toBe(true);
    expect(codex.thinking).toBe(true);

    const pi = codingComposerCapabilities("pi");
    expect(pi.fast).toBe(false);
    expect(pi.planSlash).toBe(false);
  });
});

describe("shapeCodingComposerPrompt", () => {
  const caps = codingComposerCapabilities("opencode");

  it("prefixes Ask mode", () => {
    const out = shapeCodingComposerPrompt(
      "why?",
      { mode: "ask", fast: false, thinking: "off" },
      caps,
    );
    expect(out).toContain("[Mode: Ask]");
    expect(out).toContain("why?");
  });

  it("uses /plan when planSlash is available", () => {
    const out = shapeCodingComposerPrompt(
      "refactor auth",
      { mode: "plan", fast: false, thinking: "off" },
      codingComposerCapabilities("codex"),
    );
    expect(out).toBe("/plan refactor auth");
  });

  it("leaves Code mode body unchanged", () => {
    expect(
      shapeCodingComposerPrompt(
        "fix it",
        { mode: "code", fast: false, thinking: "off" },
        caps,
      ),
    ).toBe("fix it");
  });
});

describe("fastToggleSlash", () => {
  it("emits on/off", () => {
    expect(fastToggleSlash(true)).toBe("/fast on");
    expect(fastToggleSlash(false)).toBe("/fast off");
  });
});

describe("codingComposerPrefs storage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("persists mode and fast per session key", () => {
    const key = codingComposerSessionKey({ kind: "ext", id: "ext:1" });
    saveCodingComposerPrefs(key, { mode: "plan", fast: true });
    const loaded = loadCodingComposerPrefs(key);
    expect(loaded.mode).toBe("plan");
    expect(loaded.fast).toBe(true);
  });
});
