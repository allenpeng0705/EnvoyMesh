import { describe, expect, it } from "vitest";
import { en } from "../../src/i18n/messages/en.js";
import { translate } from "../../src/i18n/translate.js";
import {
  formatLocalizedLocation,
  localizeCity,
  localizeCityForCountry,
  localizeCountry,
  mapCenterForCountry,
  resolveCitySelection,
  resolveCountrySelection,
  searchGazetteerCountries,
} from "../../src/lib/gazetteer.js";

const t = (key: string) => translate(en, key);

describe("gazetteer", () => {
  it("lists countries and resolves selection by localized label", () => {
    expect(searchGazetteerCountries("", t).length).toBeGreaterThan(0);
    expect(resolveCountrySelection("United States", t)).toBe("US");
    expect(resolveCountrySelection("XX", t)).toBeNull();
    expect(localizeCountry("CN", t)).toBe("China");
  });

  it("resolves canonical city names from localized input", () => {
    expect(resolveCitySelection("CN", "SH", "Shanghai", t)).toBe("Shanghai");
    expect(localizeCity("CN", "SH", "Shanghai", t)).toBe("Shanghai");
  });

  it("formats localized location strings", () => {
    const formatted = formatLocalizedLocation({
      countryCode: "CN",
      regionCode: "SH",
      city: "Shanghai",
      t,
    });
    expect(formatted).toContain("Shanghai");
    expect(formatted).toContain("China");
  });

  it("localizes city without region when country is known", () => {
    expect(localizeCityForCountry("CN", "Beijing", t)).toBe("Beijing");
    const formatted = formatLocalizedLocation({
      countryCode: "CN",
      city: "Beijing",
      t,
    });
    expect(formatted).toContain("Beijing");
    expect(formatted).toContain("China");
  });

  it("returns country map center for offline picker", () => {
    expect(mapCenterForCountry("CN")?.lat).toBeGreaterThan(30);
    expect(mapCenterForCountry("XX")).toBeNull();
  });
});
