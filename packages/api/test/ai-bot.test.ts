import { describe, expect, it } from "vitest";
import {
  buildAiBotPrompt,
  normalizeAiBotDefinition,
  normalizeAiBotDescription,
  normalizeAiBotPersonality,
} from "../src/ai-bot.js";

describe("buildAiBotPrompt", () => {
  it("frames the model as the character, not a helper about them", () => {
    const prompt = buildAiBotPrompt({
      botName: "Luna",
      systemPrompt: "Luna is my girlfriend. She loves music and travel.",
      userText: "Miss you",
    });

    expect(prompt).toContain("You are Luna.");
    expect(prompt).toContain("first person as Luna");
    expect(prompt).toContain("Character notes from the user");
    expect(prompt).toContain("Luna is my girlfriend");
    expect(prompt).toMatch(/Human: Miss you/);
    expect(prompt).toMatch(/Luna:\s*$/);
    expect(prompt).not.toMatch(/^User:/m);
  });

  it("includes prior conversation history when provided", () => {
    const prompt = buildAiBotPrompt({
      botName: "Luna",
      systemPrompt: "You are Luna.",
      conversationHistory: "Human: hi\n\nLuna: hey love",
      userText: "how was your day?",
    });

    expect(prompt).toContain("--- Conversation so far ---");
    expect(prompt).toContain("Human: hi");
    expect(prompt).toContain("Luna: hey love");
    expect(prompt).toContain("Human: how was your day?");
  });
});

describe("normalizeAiBotPersonality", () => {
  it("rewrites third-person bios into first person and prepends You are {name}", () => {
    const out = normalizeAiBotPersonality(
      "Luna",
      "Luna is my girlfriend. She loves music and travelling.",
    );
    expect(out).toContain("You are Luna.");
    expect(out).toContain("You are my girlfriend.");
    expect(out).toContain("You love music and travelling.");
    expect(out).not.toMatch(/\bLuna is\b/i);
  });

  it("strips assistant openers but keeps role phrasing", () => {
    const stripped = normalizeAiBotPersonality(
      "Luna",
      "You are a helpful AI assistant. You are warm and witty.",
    );
    expect(stripped.toLowerCase()).not.toContain("ai assistant");
    expect(stripped).toContain("You are Luna.");
    expect(stripped).toContain("You are warm and witty.");

    const librarian = normalizeAiBotPersonality(
      "Luna",
      "You are a helpful librarian who loves rare books.",
    );
    expect(librarian).toContain("You are Luna.");
    expect(librarian).toContain("You are a helpful librarian who loves rare books.");
  });
});

describe("normalizeAiBotDescription", () => {
  it("keeps a short user blurb and truncates long ones", () => {
    expect(normalizeAiBotDescription("Luna", "My girlfriend · music")).toBe(
      "My girlfriend · music",
    );
    const long = "x".repeat(120);
    const truncated = normalizeAiBotDescription("Luna", long);
    expect(truncated!.length).toBeLessThanOrEqual(80);
    expect(truncated!.endsWith("…")).toBe(true);
  });

  it("derives a one-liner from personality when description is empty", () => {
    const derived = normalizeAiBotDescription(
      "Luna",
      "",
      "You are Luna.\nYou are my girlfriend. You love music.",
    );
    expect(derived).toBe("You are my girlfriend.");
  });
});

describe("normalizeAiBotDefinition", () => {
  it("normalizes name, personality, and description together", () => {
    const bot = normalizeAiBotDefinition({
      id: "luna",
      name: "  Luna  ",
      systemPrompt: "Luna is my girlfriend. She loves music.",
      enabled: true,
    });
    expect(bot.name).toBe("Luna");
    expect(bot.systemPrompt).toContain("You are Luna.");
    expect(bot.systemPrompt).toContain("You are my girlfriend.");
    expect(bot.description).toBeTruthy();
  });
});
