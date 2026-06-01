import { describe, expect, it } from "vitest";
import { de, en, fr, it as itLocale, ja, ko, zh } from "../../src/i18n/messages/index.js";
import { translate } from "../../src/i18n/translate.js";
import { localizeCountry, localizeCity } from "../../src/lib/gazetteer.js";

describe("gazetteer locale overrides", () => {
  it.each([
    ["ko", ko, "KR", "대한민국", "CN", "BJ", "Beijing", "베이징"],
    ["ja", ja, "JP", "日本", "JP", "13", "Tokyo", "東京"],
    ["fr", fr, "FR", "France", "FR", "IDF", "Paris", "Paris"],
    ["de", de, "DE", "Deutschland", "DE", "BE", "Berlin", "Berlin"],
    ["it", itLocale, "FR", "Francia", "FR", "IDF", "Paris", "Parigi"],
    ["zh", zh, "CN", "中国", "CN", "BJ", "Beijing", "北京"],
  ] as const)(
    "translates countries and cities for %s",
    (_locale, messages, cc, countryLabel, rCc, rCode, city, cityLabel) => {
      const t = (key: string) => translate(messages, key);
      expect(localizeCountry(cc, t)).toBe(countryLabel);
      expect(localizeCity(rCc, rCode, city, t)).toBe(cityLabel);
      expect(translate(messages, "profileAbout.pickOnMap")).not.toBe(translate(en, "profileAbout.pickOnMap"));
    },
  );
});
