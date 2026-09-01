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

/** Keys where zh differs from EN but locale still equals EN (leftover English). */
function stillEnglishCount(localeFlat: Record<string, string>, enF: Record<string, string>, zhF: Record<string, string>) {
  let n = 0;
  for (const [k, zhVal] of Object.entries(zhF)) {
    const enVal = enF[k];
    if (enVal == null || zhVal === enVal) continue;
    if (localeFlat[k] === enVal) n++;
  }
  return n;
}

describe("i18n locale coverage", () => {
  test("de/fr/ja/ko/it stay near zh coverage (allow proper-noun leftovers)", () => {
    const enF = flatten(en);
    const zhF = flatten(zh);
    const counts = {
      de: stillEnglishCount(flatten(de), enF, zhF),
      fr: stillEnglishCount(flatten(fr), enF, zhF),
      ja: stillEnglishCount(flatten(ja), enF, zhF),
      ko: stillEnglishCount(flatten(ko), enF, zhF),
      it: stillEnglishCount(flatten(itMessages), enF, zhF),
    };
    // Remaining equals are mostly city names / Blog / Feed / technical labels.
    expect(counts.de).toBeLessThan(180);
    expect(counts.fr).toBeLessThan(180);
    expect(counts.it).toBeLessThan(180);
    expect(counts.ja).toBeLessThan(30);
    expect(counts.ko).toBeLessThan(30);
  });
});
