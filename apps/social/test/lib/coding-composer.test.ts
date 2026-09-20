/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  codingComposerCapabilities,
  workingModeFromAgentMode,
} from "../../src/lib/coding-composer-capabilities.js";
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
  it("publishes EH modes + permissions", () => {
    const eh = codingComposerCapabilities("envoy-harness");
    expect(eh.agentModes.map((m) => m.id)).toEqual([
      "default",
      "plan",
      "review",
    ]);
    expect(eh.canSetMode).toBe(true);
    expect(eh.permissions).toBe(true);
    expect(eh.workingMode).toBe(false);
  });

  it("enables Pi permissions without native modes", () => {
    const pi = codingComposerCapabilities("pi");
    expect(pi.permissions).toBe(true);
    expect(pi.agentModes).toEqual([]);
    expect(pi.workingMode).toBe(true);
  });

  it("shows no Permissions control for a sidecar the coding run path cannot gate", () => {
    const codex = codingComposerCapabilities("codex");
    // The control is *absent*, not drawn with two values that change nothing: a sidecar backend
    // never reads `permissionPolicy`, so a select here would be the lie this table prevents.
    expect(codex.permissions).toBe(false);
    expect(codex.permissionDisabledReason).toMatch(/would change nothing/);
    expect(codex.permissionFullDisabledReason).toBeUndefined();
    expect(codex.agentModes.some((m) => m.id === "agent")).toBe(true);
    expect(codex.canSetMode).toBe(false);
  });

  it("gives a catalog ACP agent the full Permissions control, Ask included", () => {
    const gemini = codingComposerCapabilities("gemini");
    // The Mesh dock ships now (`coding:permission` → `codingRespondToPermission`), so "Ask every
    // time" is answerable instead of cancelling the tool — nothing here may disable it again
    // without also removing the dock.
    expect(gemini.permissions).toBe(true);
    expect(gemini.permissionAskDisabledReason).toBeUndefined();
    expect(gemini.permissionDisabledReason).toBeUndefined();
    expect(gemini.permissionFullDisabledReason).toBeUndefined();
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
  it("uses agent mode Review prefix for EH", () => {
    const caps = codingComposerCapabilities("envoy-harness");
    const out = shapeCodingComposerPrompt(
      "look over auth",
      {
        mode: "code",
        fast: false,
        thinking: "off",
        agentModeId: "review",
      },
      caps,
    );
    expect(out).toContain("[Mode: Review]");
    expect(workingModeFromAgentMode(caps, "plan")).toBe("plan");
  });

  it("uses /plan when planSlash is available", () => {
    const out = shapeCodingComposerPrompt(
      "refactor auth",
      { mode: "plan", fast: false, thinking: "off" },
      codingComposerCapabilities("codex"),
    );
    expect(out).toBe("/plan refactor auth");
  });

  it("leaves Code mode body unchanged for catalog without agentModes", () => {
    const caps = codingComposerCapabilities("gemini");
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

  it("persists mode, permissions, and agentModeId", () => {
    const key = codingComposerSessionKey({ kind: "ext", id: "ext:1" });
    saveCodingComposerPrefs(key, {
      mode: "plan",
      fast: true,
      permissionPolicy: "always-confirm",
      agentModeId: "agent",
    });
    const loaded = loadCodingComposerPrefs(key);
    expect(loaded.mode).toBe("plan");
    expect(loaded.fast).toBe(true);
    expect(loaded.permissionPolicy).toBe("always-confirm");
    expect(loaded.agentModeId).toBe("agent");
  });
});
