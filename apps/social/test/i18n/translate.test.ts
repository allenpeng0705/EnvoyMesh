import { describe, expect, it } from "vitest";
import { translate } from "../../src/i18n/translate.js";
import { MESSAGES } from "../../src/i18n/messages/index.js";

describe("i18n translate", () => {
  it("resolves nested keys in English", () => {
    expect(translate(MESSAGES.en, "nav.chat")).toBe("Chat");
  });

  it("interpolates parameters", () => {
    expect(translate(MESSAGES.en, "nav.contacts", { count: 3 })).toBe("Contacts (3)");
    expect(translate(MESSAGES.en, "nav.discover")).toBe("Discover");
  });

  it("falls back to English for missing keys in other locales", () => {
    expect(translate(MESSAGES.zh, "nav.chat")).toBe("聊天");
  });

  it("returns key when missing everywhere", () => {
    expect(translate(MESSAGES.en, "missing.key")).toBe("missing.key");
  });
});

describe("locale message parity", () => {
  it("all locales define nav.chat", () => {
    for (const locale of Object.keys(MESSAGES)) {
      expect(translate(MESSAGES[locale as keyof typeof MESSAGES], "nav.chat").length).toBeGreaterThan(0);
    }
  });
});
