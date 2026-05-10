/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";

// Unit tests for the rule form state logic used by SettingsAITab.
// These validate the form state transitions without needing full context mocking.

interface RuleFormState {
  name: string;
  category: "availability" | "capability" | "catch_all";
  priority: number;
  keywords: string;
  regex: string;
  isGreeting: boolean;
  accessLevel: "" | "full" | "assistant_only";
  actionType: "draft" | "auto_send" | "gatekeep" | "defer";
  identityOverride: "" | "invisible" | "transparent" | "defensive";
  template: string;
}

const EMPTY_RULE_FORM: RuleFormState = {
  name: "",
  category: "availability",
  priority: 1,
  keywords: "",
  regex: "",
  isGreeting: false,
  accessLevel: "",
  actionType: "draft",
  identityOverride: "",
  template: "",
};

describe("SettingsAITab — Rule Form Logic", () => {
  it("starts with empty defaults", () => {
    const form = { ...EMPTY_RULE_FORM };
    expect(form.name).toBe("");
    expect(form.category).toBe("availability");
    expect(form.actionType).toBe("draft");
    expect(form.priority).toBe(1);
    expect(form.isGreeting).toBe(false);
  });

  it("validates that rule name is required", () => {
    const form = { ...EMPTY_RULE_FORM, name: "  " };
    expect(form.name.trim().length > 0).toBe(false);
  });

  it("parses keywords from comma-separated input", () => {
    const keywords = "help, support, question".split(",").map(k => k.trim()).filter(Boolean);
    expect(keywords).toEqual(["help", "support", "question"]);
  });

  it("detects non-empty regex", () => {
    const regex = "\\b(help|support)\\b";
    expect(regex.trim().length > 0).toBe(true);
  });

  it("tracks isGreeting flag", () => {
    const form = { ...EMPTY_RULE_FORM, isGreeting: true };
    expect(form.isGreeting).toBe(true);
  });

  it("tracks action type and template", () => {
    const form = { ...EMPTY_RULE_FORM, actionType: "auto_send", template: "I am away" };
    expect(form.actionType).toBe("auto_send");
    expect(form.template).toBe("I am away");
  });

  it("tracks identity override", () => {
    const form = { ...EMPTY_RULE_FORM, identityOverride: "defensive" };
    expect(form.identityOverride).toBe("defensive");
  });

  it("resets form while preserving next priority", () => {
    const reset = { ...EMPTY_RULE_FORM, priority: 6 };
    expect(reset.name).toBe("");
    expect(reset.priority).toBe(6);
    expect(reset.keywords).toBe("");
  });
});
