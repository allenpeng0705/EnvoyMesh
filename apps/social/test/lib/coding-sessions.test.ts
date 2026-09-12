/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  EH_CHAT_PLACEHOLDER_TITLE,
  codingHarnessLabel,
} from "@envoymesh/api";
import {
  createCodingExtSession,
  getCodingExtSession,
  maybeAutoTitleCodingExtSession,
  shouldAutoSetCodingExtTitle,
} from "../../src/lib/coding-sessions.js";

describe("coding-sessions auto-title", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("creates with New workspace placeholder", () => {
    const s = createCodingExtSession({
      harness: "opencode",
      cwd: "/tmp/demo",
    });
    expect(s.title).toBe(EH_CHAT_PLACEHOLDER_TITLE);
    expect(shouldAutoSetCodingExtTitle(s.title, s.harness)).toBe(true);
  });

  it("sets title from first prompt", () => {
    const s = createCodingExtSession({
      harness: "opencode",
      cwd: "/tmp/demo",
    });
    const next = maybeAutoTitleCodingExtSession(
      s.id,
      "Fix the login bug\nmore detail",
    );
    expect(next).toBe("Fix the login bug");
    expect(getCodingExtSession(s.id)?.title).toBe("Fix the login bug");
  });

  it("does not overwrite a custom title", () => {
    const s = createCodingExtSession({
      harness: "opencode",
      cwd: "/tmp/demo",
      title: "My custom title",
    });
    expect(
      maybeAutoTitleCodingExtSession(s.id, "Another prompt"),
    ).toBeNull();
    expect(getCodingExtSession(s.id)?.title).toBe("My custom title");
  });

  it("treats harness label as placeholder", () => {
    const label = codingHarnessLabel("opencode");
    expect(shouldAutoSetCodingExtTitle(label, "opencode")).toBe(true);
  });
});
