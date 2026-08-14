import { describe, expect, it } from "vitest";
import { de } from "../../src/i18n/messages/de.js";
import { en } from "../../src/i18n/messages/en.js";
import { fr } from "../../src/i18n/messages/fr.js";
import { it as itMessages } from "../../src/i18n/messages/it.js";
import { ja } from "../../src/i18n/messages/ja.js";
import { ko } from "../../src/i18n/messages/ko.js";
import { zh } from "../../src/i18n/messages/zh.js";

describe("Feed/Blog locale coverage", () => {
  const locales = { en, zh, de, fr, it: itMessages, ja, ko } as const;

  it("exposes content.tabFeed / tabBlog for every locale", () => {
    for (const [name, messages] of Object.entries(locales)) {
      expect(messages.content.tabFeed, `${name}.content.tabFeed`).toBeTruthy();
      expect(messages.content.tabBlog, `${name}.content.tabBlog`).toBeTruthy();
      expect(messages.feed.title, `${name}.feed.title`).toBeTruthy();
      expect(messages.blog.title, `${name}.blog.title`).toBeTruthy();
      expect(messages.engagement.starTitle, `${name}.engagement.starTitle`).toBeTruthy();
    }
  });

  it("does not leave de/fr/it/ja/ko Feed tabs on English defaults", () => {
    expect(de.content.tabFeed).toBe("Feed");
    expect(fr.content.tabFeed).toBe("Fil");
    expect(itMessages.content.tabFeed).toBe("Feed");
    expect(ja.content.tabFeed).toBe("フィード");
    expect(ko.content.tabFeed).toBe("피드");
    expect(zh.content.tabFeed).toBe("朋友圈");

    expect(de.feed.lede).not.toBe(en.feed.lede);
    expect(fr.feed.lede).not.toBe(en.feed.lede);
    expect(ja.feed.lede).not.toBe(en.feed.lede);
    expect(ko.feed.lede).not.toBe(en.feed.lede);
    expect(de.blog.lede).not.toBe(en.blog.lede);
    expect(fr.blog.publish).not.toBe(en.blog.publish);
  });
});
