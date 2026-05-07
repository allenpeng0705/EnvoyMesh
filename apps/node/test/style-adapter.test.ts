import { describe, expect, it } from "vitest";
import {
  StyleAdapter,
  createEmptyStyleProfile,
  analyzeTextStyle,
  mergeStyleProfile,
  applyStyleAdaptation,
  buildSetStyleTool,
  buildGetStyleTool,
  buildSetContactDisclosureTool,
  buildGetContactDisclosureTool,
  DEFAULT_DISCLOSURE_MESSAGE,
  type StyleProfile,
  type ContactDisclosure,
} from "../src/style-adapter.js";

describe("createEmptyStyleProfile", () => {
  it("creates profile with defaults", () => {
    const profile = createEmptyStyleProfile();
    expect(profile.tone).toBe("neutral");
    expect(profile.sentenceLength).toBe(15);
    expect(profile.vocabulary).toEqual([]);
    expect(profile.commonPhrases).toEqual([]);
    expect(profile.emojiUsage).toBe(0.1);
    expect(profile.exclamationUsage).toBe(0.1);
    expect(profile.questionFrequency).toBe(0.2);
  });
});

describe("analyzeTextStyle", () => {
  it("extracts formal tone", () => {
    const result = analyzeTextStyle("I would therefore appreciate your response regarding this matter.");
    expect(result.tone).toBe("formal");
  });

  it("extracts casual tone", () => {
    const result = analyzeTextStyle("Hey, gonna grab some stuff later, gonna be cool!");
    expect(result.tone).toBe("casual");
  });

  it("calculates sentence length", () => {
    const result = analyzeTextStyle("Short sentence.");
    expect(result.sentenceLength).toBeLessThan(15);
  });

  it("calculates emoji usage", () => {
    const result = analyzeTextStyle("Hello! 😊 How are you? 😀");
    expect(result.emojiUsage).toBeGreaterThan(0);
  });

  it("calculates exclamation usage", () => {
    const result = analyzeTextStyle("Wow! Amazing! Incredible!");
    expect(result.exclamationUsage).toBeGreaterThan(0);
  });

  it("calculates question frequency", () => {
    const result = analyzeTextStyle("How are you? What is this? Why?");
    expect(result.questionFrequency).toBeGreaterThan(0.5);
  });
});

describe("mergeStyleProfile", () => {
  it("blends sentence lengths with EMA", () => {
    const existing: StyleProfile = {
      ...createEmptyStyleProfile(),
      sentenceLength: 20,
    };
    const analysis = { sentenceLength: 10 };
    const merged = mergeStyleProfile(existing, analysis);
    // 20 * 0.7 + 10 * 0.3 = 14 + 3 = 17
    expect(merged.sentenceLength).toBeCloseTo(17, 0);
  });

  it("merges vocabulary", () => {
    const existing: StyleProfile = {
      ...createEmptyStyleProfile(),
      vocabulary: ["foo", "bar"],
    };
    const analysis = { vocabulary: ["bar", "baz"] };
    const merged = mergeStyleProfile(existing, analysis);
    expect(merged.vocabulary).toContain("foo");
    expect(merged.vocabulary).toContain("bar");
    expect(merged.vocabulary).toContain("baz");
  });

  it("updates timestamp", async () => {
    const existing = createEmptyStyleProfile();
    // Wait a ms to ensure different timestamp
    await new Promise((r) => setTimeout(r, 1));
    const merged = mergeStyleProfile(existing, { sentenceLength: 10 });
    expect(merged.updatedAt).not.toBe(existing.updatedAt);
  });
});

describe("applyStyleAdaptation", () => {
  it("adds greeting pattern for greeting context", () => {
    const profile = createEmptyStyleProfile();
    profile.greetingPatterns = ["Hello", "Hey"];
    const result = applyStyleAdaptation("there!", profile, "greeting");
    expect(result).toMatch(/^(Hello|Hey),/);
  });

  it("adds signoff pattern for farewell context", () => {
    const profile = createEmptyStyleProfile();
    profile.signoffPatterns = ["Best", "Thanks"];
    const result = applyStyleAdaptation("Talk later", profile, "farewell");
    // Result could end with either "Best" or "Thanks"
    expect(result).toMatch(/(Best|Thanks)$/);
  });

  it("adds exclamation based on usage", () => {
    const profile = createEmptyStyleProfile();
    profile.exclamationUsage = 0.9;
    profile.emojiUsage = 0;
    const result = applyStyleAdaptation("This is great.", profile);
    expect(result).toContain("!");
  });

  it("adds emoji based on usage", () => {
    const profile = createEmptyStyleProfile();
    profile.emojiUsage = 1.0; // Always add emoji
    profile.exclamationUsage = 0;
    const result = applyStyleAdaptation("Hello there", profile);
    // Check if emoji was added - one of the emojis from the list
    const emojis = ["👍", "😊", "🙂", "✨", "💪"];
    const hasEmoji = emojis.some((e) => result.includes(e));
    expect(hasEmoji).toBe(true);
  });
});

describe("StyleAdapter", () => {
  describe("learnFromMessage", () => {
    it("learns from owner messages", () => {
      const adapter = new StyleAdapter();
      adapter.learnFromMessage(true, "Hello, how are you doing today?");
      const profile = adapter.getOwnerProfile();
      expect(profile).not.toBeNull();
    });

    it("ignores contact messages", () => {
      const adapter = new StyleAdapter();
      adapter.learnFromMessage(false, "I am the contact speaking");
      expect(adapter.getOwnerProfile()).toBeNull();
    });
  });

  describe("disclosure management", () => {
    it("creates default disclosure", () => {
      const adapter = new StyleAdapter();
      const disclosure = adapter.getOrCreateDisclosure("contact-123");
      expect(disclosure.contactOwnerId).toBe("contact-123");
      expect(disclosure.discloseAgent).toBe(false);
      expect(disclosure.disclosureMessage).toBe(DEFAULT_DISCLOSURE_MESSAGE);
    });

    it("updates disclosure", () => {
      const adapter = new StyleAdapter();
      adapter.updateDisclosure({
        contactOwnerId: "contact-123",
        discloseAgent: true,
        disclosureMessage: "Custom message",
      });
      const disclosure = adapter.getOrCreateDisclosure("contact-123");
      expect(disclosure.discloseAgent).toBe(true);
      expect(disclosure.disclosureMessage).toBe("Custom message");
    });

    it("lists all disclosures", () => {
      const adapter = new StyleAdapter();
      adapter.updateDisclosure({ contactOwnerId: "c1", discloseAgent: true });
      adapter.updateDisclosure({ contactOwnerId: "c2", discloseAgent: false });
      const all = adapter.listDisclosures();
      expect(all).toHaveLength(2);
    });

    it("shouldDiscloseToContact returns correct value", () => {
      const adapter = new StyleAdapter();
      adapter.updateDisclosure({ contactOwnerId: "c1", discloseAgent: true });
      adapter.updateDisclosure({ contactOwnerId: "c2", discloseAgent: false });
      expect(adapter.shouldDiscloseToContact("c1")).toBe(true);
      expect(adapter.shouldDiscloseToContact("c2")).toBe(false);
    });
  });

  describe("adapt", () => {
    it("does not adapt owner messages", () => {
      const adapter = new StyleAdapter();
      const result = adapter.adapt("Hello!", "contact-123", true);
      expect(result.adaptedText).toBe("Hello!");
      expect(result.wasAdapted).toBe(false);
    });

    it("adapts contact messages when not disclosing", () => {
      const adapter = new StyleAdapter();
      const profile = createEmptyStyleProfile();
      profile.greetingPatterns = ["Hello"];
      adapter.setOwnerProfile(profile);
      adapter.updateDisclosure({ contactOwnerId: "contact-123", discloseAgent: false });

      const result = adapter.adapt("there!", "contact-123", false, "greeting");
      expect(result.adaptedText).toMatch(/^Hello,/);
    });

    it("does not adapt when disclosing", () => {
      const adapter = new StyleAdapter();
      adapter.updateDisclosure({ contactOwnerId: "contact-123", discloseAgent: true });

      const result = adapter.adapt("Hello!", "contact-123", false);
      expect(result.adaptedText).toBe("Hello!");
      expect(result.wasAdapted).toBe(false);
      expect(result.disclosureApplied).toBe(true);
    });
  });
});

describe("buildSetStyleTool", () => {
  it("sets tone", async () => {
    const adapter = new StyleAdapter();
    const tool = buildSetStyleTool(adapter);

    const result = await tool({ tone: "casual" });
    expect(result.ok).toBe(true);
    expect(result.profile?.tone).toBe("casual");
  });

  it("sets vocabulary", async () => {
    const adapter = new StyleAdapter();
    const tool = buildSetStyleTool(adapter);

    const result = await tool({ vocabulary: ["hello", "world"] });
    expect(result.ok).toBe(true);
    expect(result.profile?.vocabulary).toContain("hello");
  });

  it("returns error for invalid tone", async () => {
    const adapter = new StyleAdapter();
    const tool = buildSetStyleTool(adapter);

    const result = await tool({ tone: "invalid" });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Invalid tone");
  });
});

describe("buildGetStyleTool", () => {
  it("returns current profile", async () => {
    const adapter = new StyleAdapter();
    const profile = createEmptyStyleProfile();
    profile.tone = "formal";
    adapter.setOwnerProfile(profile);
    const tool = buildGetStyleTool(adapter);

    const result = await tool({});
    expect(result.ok).toBe(true);
    expect(result.profile?.tone).toBe("formal");
  });
});

describe("buildSetContactDisclosureTool", () => {
  it("sets disclosure", async () => {
    const adapter = new StyleAdapter();
    const tool = buildSetContactDisclosureTool(adapter);

    const result = await tool({
      contactOwnerId: "contact-123",
      discloseAgent: true,
      disclosureMessage: "Custom",
    });

    expect(result.ok).toBe(true);
    expect(result.disclosure?.discloseAgent).toBe(true);
    expect(result.disclosure?.disclosureMessage).toBe("Custom");
  });

  it("returns error when contactOwnerId missing", async () => {
    const adapter = new StyleAdapter();
    const tool = buildSetContactDisclosureTool(adapter);

    const result = await tool({ discloseAgent: true });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("contactOwnerId");
  });
});

describe("buildGetContactDisclosureTool", () => {
  it("returns disclosure for contact", async () => {
    const adapter = new StyleAdapter();
    adapter.updateDisclosure({ contactOwnerId: "contact-123", discloseAgent: true });
    const tool = buildGetContactDisclosureTool(adapter);

    const result = await tool({ contactOwnerId: "contact-123" });
    expect(result.ok).toBe(true);
    expect(result.disclosure?.discloseAgent).toBe(true);
  });

  it("returns error when contactOwnerId missing", async () => {
    const adapter = new StyleAdapter();
    const tool = buildGetContactDisclosureTool(adapter);

    const result = await tool({});
    expect(result.ok).toBe(false);
    expect(result.error).toContain("contactOwnerId");
  });
});
