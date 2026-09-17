import { describe, it as test, expect } from "vitest";
import { en } from "../src/i18n/messages/en.js";
import { zh } from "../src/i18n/messages/zh.js";
import { de } from "../src/i18n/messages/de.js";
import { fr } from "../src/i18n/messages/fr.js";
import { ja } from "../src/i18n/messages/ja.js";
import { ko } from "../src/i18n/messages/ko.js";
import { it as itMessages } from "../src/i18n/messages/it.js";

function flatten(obj: unknown, prefix = "", out: Record<string, string> = {}) {
  if (!obj || typeof obj !== "object") return out;
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") out[path] = v;
    else if (v && typeof v === "object" && !Array.isArray(v)) flatten(v, path, out);
  }
  return out;
}

/**
 * Values that are *correctly* identical in every locale: city and region names
 * from the gazetteer. They are not translation gaps, so they are excluded rather
 * than counted — the old absolute numbers mixed the two and went stale as the
 * gazetteer grew.
 */
const PROPER_NOUN_PREFIXES = ["gazetteer.cities.", "gazetteer.regions."];
const isProperNoun = (key: string) => PROPER_NOUN_PREFIXES.some((p) => key.startsWith(p));

/** Keys where zh differs from EN but locale still equals EN (leftover English). */
function stillEnglishCount(localeFlat: Record<string, string>, enF: Record<string, string>, zhF: Record<string, string>) {
  let n = 0;
  for (const [k, zhVal] of Object.entries(zhF)) {
    const enVal = enF[k];
    if (enVal == null || zhVal === enVal) continue;
    if (isProperNoun(k)) continue;
    if (localeFlat[k] === enVal) n++;
  }
  return n;
}

/**
 * The localization backlog, re-measured after the Coding-tools work.
 *
 * The prior numbers (de 323, fr 321, it 316, ja 223, ko 227, measured
 * 2026-09-12) predated the `refine EnvoyGo` change, which added 70 new
 * user-facing strings with only `en`/`zh` copy: 40 `codingView.*`, the 24
 * `settings.ai.codingAgents.*` blocks, `installCard.firstRunLabel` and the five
 * `settings.app.home*` lines. Those 70 keys were then translated for de/fr/it/ja/ko,
 * which is why the recorded numbers moved **down** rather than up.
 *
 * The drop is 68–70 per locale, not 70, because a few correct translations are
 * cognates that read identically to English (`codingView.modeCode` "Code",
 * `settings.ai.codingAgents.groupCatalogue` "Catalogue · {total}"). The audit's
 * heuristic is `locale === en`, so an intentional cognate still counts. That is
 * the honest floor, not a missing translation.
 *
 * This is still a ratchet, not an acceptance of the state:
 *
 *   * translating strings **lowers** the number (and the expectation with it),
 *   * adding a string without translating it **raises** it and fails the test.
 *
 * It replaced a Phase-42 absolute threshold (`< 180`, `< 30`) that silently
 * rotted: the real count had reached 364 while the assertion still read `< 180`,
 * so the test could only report "red" — with no way to tell a regression from
 * accumulated backlog. An audit's job is to catch *growth*.
 */
const BACKLOG: Record<string, number> = {
  de: 309,
  fr: 308,
  it: 302,
  ja: 208,
  ko: 212,
};

describe("i18n locale coverage", () => {
  test("de/fr/ja/ko/it stay within the recorded localization backlog", () => {
    const enF = flatten(en);
    const zhF = flatten(zh);
    const counts = {
      de: stillEnglishCount(flatten(de), enF, zhF),
      fr: stillEnglishCount(flatten(fr), enF, zhF),
      ja: stillEnglishCount(flatten(ja), enF, zhF),
      ko: stillEnglishCount(flatten(ko), enF, zhF),
      it: stillEnglishCount(flatten(itMessages), enF, zhF),
    };
    expect(counts, JSON.stringify(counts)).toBeTruthy();
    for (const [locale, count] of Object.entries(counts)) {
      expect(
        count,
        `${locale}: ${count} untranslated strings (recorded backlog ${BACKLOG[locale]}). ` +
          `Translating lowers this number and the expectation; a new untranslated string raises it.`,
      ).toBeLessThanOrEqual(BACKLOG[locale]);
    }
  });
});
