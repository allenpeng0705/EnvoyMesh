import { describe, expect, it } from "vitest";
import {
  deriveLocationDiscoveryTopics,
  decodeGeohash,
  encodeGeohash,
  NEARBY_GEOHASH_PRECISION,
  formatGeoTopicLabel,
  friendMatchingGeoSearchTopics,
  friendMatchingGeoTagHashes,
  geoDiscoveryTagHashesFromProfile,
  hashDiscoveryTag,
  locationSearchTopics,
  matchGeoDiscoveryTagHashes,
  normalizeCountryCode,
  normalizeLocationSlug,
  parseGeoDiscoveryTopic,
} from "../src/discovery-location.js";

describe("discovery-location", () => {
  it("normalizes slugs and country codes", () => {
    expect(normalizeLocationSlug("San Francisco")).toBe("san-francisco");
    expect(normalizeCountryCode(" us ")).toBe("US");
  });

  it("encodes geohash at requested precision", () => {
    const gh = encodeGeohash(37.7749, -122.4194, 5);
    expect(gh).toHaveLength(5);
    expect(gh).toMatch(/^[0-9b-hjkmnp-z]+$/);
  });

  it("uses shared nearby geohash precision for advertise and search", () => {
    expect(NEARBY_GEOHASH_PRECISION).toBe(5);
    const gh = encodeGeohash(37.7749, -122.4194, NEARBY_GEOHASH_PRECISION);
    const topics = deriveLocationDiscoveryTopics({
      location: { countryCode: "US", geohash: `${gh}extra` },
      precision: "nearby",
    });
    expect(topics).toContain(`geo:geohash:${gh}`);
  });

  it("round-trips geohash encode/decode", () => {
    const gh = encodeGeohash(37.7749, -122.4194, NEARBY_GEOHASH_PRECISION);
    const decoded = decodeGeohash(gh);
    expect(decoded.lat).toBeCloseTo(37.7749, 1);
    expect(decoded.lng).toBeCloseTo(-122.4194, 1);
  });

  it("derives hierarchical geo topics by precision", () => {
    const location = {
      countryCode: "US",
      regionCode: "CA",
      city: "San Francisco",
      town: "Mission District",
      geohash: "9q8yyk8",
    };
    expect(
      deriveLocationDiscoveryTopics({ location, precision: "hidden" }),
    ).toEqual([]);
    expect(
      deriveLocationDiscoveryTopics({ location, precision: "country" }),
    ).toEqual(["geo:country:US"]);
    expect(
      deriveLocationDiscoveryTopics({ location, precision: "city" }),
    ).toEqual([
      "geo:country:US",
      "geo:region:US-ca",
      "geo:city:US-san-francisco",
    ]);
    expect(
      deriveLocationDiscoveryTopics({ location, precision: "nearby" }),
    ).toContain("geo:geohash:9q8yy");
  });

  it("builds search topics for scopes", () => {
    const location = {
      countryCode: "US",
      city: "Boston",
    };
    expect(locationSearchTopics({ location, scope: "city" })).toEqual([
      "geo:city:US-boston",
    ]);
  });

  it("expands nearby search to neighbor geohash prefixes", () => {
    const gh = encodeGeohash(42.3601, -71.0589, NEARBY_GEOHASH_PRECISION);
    const topics = locationSearchTopics({
      location: { countryCode: "US", geohash: gh },
      scope: "nearby",
    });
    expect(topics.every((topic) => topic.startsWith("geo:geohash:"))).toBe(true);
    expect(topics.some((topic) => topic === `geo:geohash:${gh}`)).toBe(true);
    expect(topics.length).toBeGreaterThan(1);
  });

  it("parses and formats geo topics", () => {
    expect(parseGeoDiscoveryTopic("geo:city:US-san-francisco")).toEqual({
      kind: "city",
      countryCode: "US",
      citySlug: "san-francisco",
    });
    expect(formatGeoTopicLabel("geo:city:US-san-francisco")).toBe("san francisco");
  });

  it("hashes geo topics for bond-scoped discovery.request", () => {
    expect(hashDiscoveryTag("geo:city:US-boston")).toBe("hash:geo:city:us-boston");
    const hashes = geoDiscoveryTagHashesFromProfile({
      location: { countryCode: "US", city: "Boston" },
      precision: "city",
    });
    expect(hashes).toContain("hash:geo:city:us-boston");
    expect(
      matchGeoDiscoveryTagHashes(["hash:geo:city:us-boston", "hash:other"], {
        discoveryLocation: { countryCode: "US", city: "Boston" },
        discoveryLocationPrecision: "city",
      }),
    ).toEqual(["hash:geo:city:us-boston"]);
  });

  it("derives friend matching geo topics from profile", () => {
    const topics = friendMatchingGeoSearchTopics({
      humanProfile: {
        discoveryLocation: { countryCode: "US", city: "Boston" },
        discoveryLocationPrecision: "city",
      },
    });
    expect(topics).toEqual(["geo:city:US-boston"]);
    expect(
      friendMatchingGeoTagHashes({
        humanProfile: {
          discoveryLocation: { countryCode: "US", city: "Boston" },
          discoveryLocationPrecision: "city",
        },
      }),
    ).toContain("hash:geo:city:us-boston");
  });
});
