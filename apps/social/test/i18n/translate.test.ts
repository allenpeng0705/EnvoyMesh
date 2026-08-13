import { describe, expect, it } from "vitest";
import { translate } from "../../src/i18n/translate.js";
import { MESSAGES } from "../../src/i18n/messages/index.js";

describe("i18n translate", () => {
  it("resolves nested keys in English", () => {
    expect(translate(MESSAGES.en, "nav.social")).toBe("Social");
    expect(translate(MESSAGES.en, "nav.terminal")).toBe("Terminal");
    expect(translate(MESSAGES.en, "nav.knowledge")).toBe("Knowledge");
    expect(translate(MESSAGES.en, "nav.inbox")).toBe("Inbox");
  });

  it("interpolates parameters", () => {
    expect(translate(MESSAGES.en, "nav.contacts", { count: 3 })).toBe("Contacts (3)");
    expect(translate(MESSAGES.en, "nav.discover")).toBe("Discover");
  });

  it("falls back to English for missing keys in other locales", () => {
    expect(translate(MESSAGES.zh, "nav.social")).toBe("社交");
  });

  it("returns key when missing everywhere", () => {
    expect(translate(MESSAGES.en, "missing.key")).toBe("missing.key");
  });
});

describe("locale message parity", () => {
  it("all locales define nav.social and social/explore hub labels", () => {
    for (const locale of Object.keys(MESSAGES)) {
      const messages = MESSAGES[locale as keyof typeof MESSAGES];
      expect(translate(messages, "nav.social").length).toBeGreaterThan(0);
      expect(translate(messages, "nav.terminal").length).toBeGreaterThan(0);
      expect(translate(messages, "nav.knowledge").length).toBeGreaterThan(0);
      expect(translate(messages, "nav.inbox").length).toBeGreaterThan(0);
      expect(translate(messages, "social.tabChats").length).toBeGreaterThan(0);
      expect(translate(messages, "social.tabDiscover").length).toBeGreaterThan(0);
      expect(translate(messages, "social.tabExplore").length).toBeGreaterThan(0);
    }
  });

  it("Knowledge Setup rag keys resolve (not raw key paths)", () => {
    const keys = [
      "settings.ai.rag.sectionGeneral",
      "settings.ai.rag.sectionEmbedding",
      "settings.ai.rag.sectionContext",
      "settings.ai.rag.sectionIndex",
      "settings.ai.rag.sectionPaths",
      "settings.ai.rag.sectionExternal",
      "settings.ai.rag.embeddingIndependentBanner",
      "settings.ai.rag.testEmbedding",
      "settings.ai.rag.indexStateReady",
      "settings.ai.rag.indexMetricTracked",
    ] as const;
    for (const locale of Object.keys(MESSAGES)) {
      const messages = MESSAGES[locale as keyof typeof MESSAGES];
      for (const key of keys) {
        const value = translate(messages, key);
        expect(value, `${locale}:${key}`).not.toBe(key);
        expect(value.length).toBeGreaterThan(0);
      }
    }
  });
});
