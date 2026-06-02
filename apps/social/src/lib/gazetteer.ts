import { normalizeCountryCode, normalizeLocationSlug } from "@envoymesh/api";
import { gazetteerData } from "../data/gazetteer.js";

const rawGazetteer = gazetteerData;

export interface GazetteerRegion {
  code: string;
  cities: string[];
}

export interface GazetteerCountry {
  code: string;
  regions: GazetteerRegion[];
}

export interface GazetteerData {
  countries: GazetteerCountry[];
}

const gazetteer = rawGazetteer as GazetteerData;

export function getGazetteerCountries(): GazetteerCountry[] {
  return gazetteer.countries;
}

export function findGazetteerCountry(code: string): GazetteerCountry | undefined {
  const cc = normalizeCountryCode(code);
  return gazetteer.countries.find((country) => country.code === cc);
}

export function findGazetteerRegion(countryCode: string, regionCode: string): GazetteerRegion | undefined {
  const country = findGazetteerCountry(countryCode);
  if (!country) return undefined;
  const rc = regionCode.trim().toUpperCase();
  return country.regions.find((region) => region.code.toUpperCase() === rc);
}

export function gazetteerCountryKey(code: string): string {
  return `gazetteer.countries.${normalizeCountryCode(code)}`;
}

export function gazetteerRegionKey(countryCode: string, regionCode: string): string {
  return `gazetteer.regions.${normalizeCountryCode(countryCode)}.${regionCode.trim().toUpperCase()}`;
}

export function gazetteerCityKey(countryCode: string, regionCode: string, city: string): string {
  const cc = normalizeCountryCode(countryCode);
  const rc = regionCode.trim().toUpperCase();
  return `gazetteer.cities.${cc}-${rc}.${normalizeLocationSlug(city)}`;
}

export type TranslateFn = (key: string) => string;

export function localizeCountry(code: string, t: TranslateFn): string {
  const key = gazetteerCountryKey(code);
  const translated = t(key);
  return translated === key ? code : translated;
}

export function localizeRegion(countryCode: string, regionCode: string, t: TranslateFn): string {
  const key = gazetteerRegionKey(countryCode, regionCode);
  const translated = t(key);
  return translated === key ? regionCode : translated;
}

export function localizeCity(
  countryCode: string,
  regionCode: string,
  city: string,
  t: TranslateFn,
): string {
  const key = gazetteerCityKey(countryCode, regionCode, city);
  const translated = t(key);
  return translated === key ? city : translated;
}

/** Find a gazetteer city entry by country + canonical or localized name. */
export function findGazetteerCityEntry(
  countryCode: string,
  cityName: string,
  t?: TranslateFn,
): { regionCode: string; city: string } | null {
  const country = findGazetteerCountry(countryCode);
  if (!country) return null;
  const needle = cityName.trim().toLowerCase();
  if (!needle) return null;
  for (const region of country.regions) {
    for (const city of region.cities) {
      if (city.toLowerCase() === needle) {
        return { regionCode: region.code, city };
      }
      if (t && localizeCity(country.code, region.code, city, t).toLowerCase() === needle) {
        return { regionCode: region.code, city };
      }
    }
  }
  return null;
}

/** Localize a city when region is unknown (searches all regions in country). */
export function localizeCityForCountry(countryCode: string, city: string, t: TranslateFn): string {
  const entry = findGazetteerCityEntry(countryCode, city, t);
  if (entry) {
    return localizeCity(countryCode, entry.regionCode, entry.city, t);
  }
  return city;
}

/** Approximate map center for offline nearby picker (no tile API). */
const COUNTRY_MAP_CENTER: Record<string, { lat: number; lng: number }> = {
  US: { lat: 39.8283, lng: -98.5795 },
  CN: { lat: 35.8617, lng: 104.1954 },
  GB: { lat: 55.3781, lng: -3.436 },
  DE: { lat: 51.1657, lng: 10.4515 },
  FR: { lat: 46.2276, lng: 2.2137 },
  JP: { lat: 36.2048, lng: 138.2529 },
  KR: { lat: 35.9078, lng: 127.7669 },
};

export function mapCenterForCountry(countryCode: string): { lat: number; lng: number } | null {
  const cc = normalizeCountryCode(countryCode);
  return COUNTRY_MAP_CENTER[cc] ?? null;
}

function matchesQuery(label: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return label.toLowerCase().includes(q);
}

export function searchGazetteerCountries(query: string, t: TranslateFn): GazetteerCountry[] {
  return gazetteer.countries.filter((country) =>
    matchesQuery(localizeCountry(country.code, t), query)
    || matchesQuery(country.code, query),
  );
}

export function searchGazetteerRegions(
  countryCode: string,
  query: string,
  t: TranslateFn,
): GazetteerRegion[] {
  const country = findGazetteerCountry(countryCode);
  if (!country) return [];
  return country.regions.filter(
    (region) =>
      matchesQuery(localizeRegion(country.code, region.code, t), query)
      || matchesQuery(region.code, query),
  );
}

export function searchGazetteerCities(
  countryCode: string,
  regionCode: string,
  query: string,
  t: TranslateFn,
): string[] {
  const region = findGazetteerRegion(countryCode, regionCode);
  if (!region) return [];
  return region.cities.filter((city) =>
    matchesQuery(localizeCity(countryCode, regionCode, city, t), query)
    || matchesQuery(city, query),
  );
}

export function resolveCountrySelection(input: string, t: TranslateFn): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (/^[A-Za-z]{2}$/.test(trimmed)) {
    const code = normalizeCountryCode(trimmed);
    return findGazetteerCountry(code) ? code : null;
  }
  const match = gazetteer.countries.find(
    (country) =>
      country.code === normalizeCountryCode(trimmed)
      || localizeCountry(country.code, t).toLowerCase() === trimmed.toLowerCase(),
  );
  return match?.code ?? null;
}

export function resolveRegionSelection(
  countryCode: string,
  input: string,
  t: TranslateFn,
): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const country = findGazetteerCountry(countryCode);
  if (!country) return trimmed.toUpperCase();
  const match = country.regions.find(
    (region) =>
      region.code.toUpperCase() === trimmed.toUpperCase()
      || localizeRegion(country.code, region.code, t).toLowerCase() === trimmed.toLowerCase(),
  );
  return match?.code ?? trimmed.toUpperCase();
}

export function resolveCitySelection(
  countryCode: string,
  regionCode: string,
  input: string,
  t: TranslateFn,
): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const region = findGazetteerRegion(countryCode, regionCode);
  if (!region) return trimmed;
  const match = region.cities.find(
    (city) =>
      city.toLowerCase() === trimmed.toLowerCase()
      || localizeCity(countryCode, regionCode, city, t).toLowerCase() === trimmed.toLowerCase(),
  );
  return match ?? trimmed;
}

export function formatLocalizedLocation(input: {
  countryCode?: string;
  regionCode?: string;
  city?: string;
  town?: string;
  t: TranslateFn;
}): string {
  const parts: string[] = [];
  if (input.town?.trim()) parts.push(input.town.trim());
  if (input.city?.trim() && input.countryCode?.trim()) {
    parts.push(
      input.regionCode?.trim()
        ? localizeCity(input.countryCode, input.regionCode, input.city, input.t)
        : localizeCityForCountry(input.countryCode, input.city, input.t),
    );
  } else if (input.city?.trim()) {
    parts.push(input.city.trim());
  }
  if (input.regionCode?.trim() && input.countryCode?.trim()) {
    parts.push(localizeRegion(input.countryCode, input.regionCode, input.t));
  } else if (input.regionCode?.trim()) {
    parts.push(input.regionCode.trim());
  }
  if (input.countryCode?.trim()) {
    parts.push(localizeCountry(input.countryCode, input.t));
  }
  return parts.join(", ");
}
