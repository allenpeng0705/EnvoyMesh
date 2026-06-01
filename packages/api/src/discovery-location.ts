import type { DiscoveryLocation, DiscoveryLocationPrecision } from "@envoymesh/protocol";

export type { DiscoveryLocation, DiscoveryLocationPrecision };

export const GEO_TOPIC_PREFIX = "geo:" as const;

/** Geohash prefix length for nearby discovery (~5 km at 5 chars). */
export const NEARBY_GEOHASH_PRECISION = 5 as const;

const PRECISION_ORDER: DiscoveryLocationPrecision[] = [
  "hidden",
  "country",
  "region",
  "city",
  "town",
  "nearby",
];

function precisionRank(p: DiscoveryLocationPrecision): number {
  return PRECISION_ORDER.indexOf(p);
}

/** Normalize free-text place names into stable topic slugs. */
export function normalizeLocationSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export function normalizeCountryCode(code: string): string {
  return code.trim().toUpperCase();
}

/** Encode lat/lng to geohash (base32). Precision = number of characters (4 ≈ 20 km, 5 ≈ 5 km). */
export function encodeGeohash(lat: number, lng: number, precision = 5): string {
  if (precision < 1 || precision > 12) {
    throw new Error("geohash precision must be 1–12");
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    throw new Error("invalid latitude or longitude");
  }
  const base32 = "0123456789bcdefghjkmnpqrstuvwxyz";
  let minLat = -90;
  let maxLat = 90;
  let minLng = -180;
  let maxLng = 180;
  let hash = "";
  let bit = 0;
  let ch = 0;
  let even = true;

  while (hash.length < precision) {
    if (even) {
      const mid = (minLng + maxLng) / 2;
      if (lng >= mid) {
        ch = ch * 2 + 1;
        minLng = mid;
      } else {
        ch = ch * 2;
        maxLng = mid;
      }
    } else {
      const mid = (minLat + maxLat) / 2;
      if (lat >= mid) {
        ch = ch * 2 + 1;
        minLat = mid;
      } else {
        ch = ch * 2;
        maxLat = mid;
      }
    }
    even = !even;
    bit++;
    if (bit === 5) {
      hash += base32[ch];
      bit = 0;
      ch = 0;
    }
  }
  return hash;
}

/** Decode geohash to center point and approximate half-width errors (degrees). */
export function decodeGeohash(geohash: string): {
  lat: number;
  lng: number;
  errorLat: number;
  errorLng: number;
} {
  const base32 = "0123456789bcdefghjkmnpqrstuvwxyz";
  const normalized = geohash.trim().toLowerCase();
  if (!normalized) {
    throw new Error("geohash is required");
  }
  let minLat = -90;
  let maxLat = 90;
  let minLng = -180;
  let maxLng = 180;
  let even = true;
  for (const ch of normalized) {
    const idx = base32.indexOf(ch);
    if (idx < 0) {
      throw new Error("invalid geohash character");
    }
    for (let n = 4; n >= 0; n--) {
      const bit = (idx >> n) & 1;
      if (even) {
        const mid = (minLng + maxLng) / 2;
        if (bit) {
          minLng = mid;
        } else {
          maxLng = mid;
        }
      } else {
        const mid = (minLat + maxLat) / 2;
        if (bit) {
          minLat = mid;
        } else {
          maxLat = mid;
        }
      }
      even = !even;
    }
  }
  return {
    lat: (minLat + maxLat) / 2,
    lng: (minLng + maxLng) / 2,
    errorLat: (maxLat - minLat) / 2,
    errorLng: (maxLng - minLng) / 2,
  };
}

/** Adjacent geohash cell prefixes for broader nearby search (same length as input). */
export function geohashNeighborPrefixes(geohash: string): string[] {
  const normalized = geohash.trim().toLowerCase();
  if (!normalized) return [];
  const base32 = "0123456789bcdefghjkmnpqrstuvwxyz";
  const last = normalized[normalized.length - 1];
  const idx = base32.indexOf(last);
  const prefix = normalized.slice(0, -1);
  const neighbors: string[] = [normalized];
  if (idx > 0) neighbors.push(prefix + base32[idx - 1]);
  if (idx < base32.length - 1) neighbors.push(prefix + base32[idx + 1]);
  return [...new Set(neighbors)];
}

/**
 * Derive DHT capability topic strings from signed profile location + precision.
 * Topics are hierarchical: country → region → city → town; nearby adds geohash prefix.
 */
export function deriveLocationDiscoveryTopics(input: {
  location?: DiscoveryLocation | null;
  precision?: DiscoveryLocationPrecision | null;
  /** Geohash length for `nearby` (default 5 ≈ ~5 km). */
  nearbyGeohashLength?: number;
}): string[] {
  const precision = input.precision ?? "hidden";
  if (precision === "hidden" || !input.location) {
    return [];
  }
  const loc = input.location;
  const cc = normalizeCountryCode(loc.countryCode);
  const topics: string[] = [];
  const rank = precisionRank(precision);

  if (rank >= precisionRank("country")) {
    topics.push(`${GEO_TOPIC_PREFIX}country:${cc}`);
  }
  if (rank >= precisionRank("region") && loc.regionCode?.trim()) {
    const regionSlug = normalizeLocationSlug(loc.regionCode);
    if (regionSlug) topics.push(`${GEO_TOPIC_PREFIX}region:${cc}-${regionSlug}`);
  }
  if (rank >= precisionRank("city") && loc.city?.trim()) {
    const citySlug = normalizeLocationSlug(loc.city);
    if (citySlug) topics.push(`${GEO_TOPIC_PREFIX}city:${cc}-${citySlug}`);
  }
  if (rank >= precisionRank("town") && loc.town?.trim()) {
    const townSlug = normalizeLocationSlug(loc.town);
    if (townSlug) topics.push(`${GEO_TOPIC_PREFIX}town:${cc}-${townSlug}`);
  }
  if (rank >= precisionRank("nearby") && loc.geohash?.trim()) {
    const len = input.nearbyGeohashLength ?? NEARBY_GEOHASH_PRECISION;
    const gh = loc.geohash.trim().toLowerCase().slice(0, len);
    if (gh.length >= 4) {
      topics.push(`${GEO_TOPIC_PREFIX}geohash:${gh}`);
    }
  }

  return [...new Set(topics)];
}

/** Hash a discovery tag for bond-scoped `discovery.request` (cleartext geo topics stay on DHT only). */
export function hashDiscoveryTag(tag: string): string {
  return `hash:${tag.trim().toLowerCase()}`;
}

/** Hash cleartext geo capability topics for wire-safe multi-hop discovery. */
export function hashGeoDiscoveryTopics(topics: string[]): string[] {
  return [...new Set(topics.map((topic) => hashDiscoveryTag(topic)))];
}

/** Hashed geo tags advertised implicitly from a human profile location + precision. */
export function geoDiscoveryTagHashesFromProfile(input: {
  location?: DiscoveryLocation | null;
  precision?: DiscoveryLocationPrecision | null;
}): string[] {
  return hashGeoDiscoveryTopics(
    deriveLocationDiscoveryTopics({
      location: input.location,
      precision: input.precision,
    }),
  );
}

/** Return requested tag hashes that match this profile's geo tags (case-insensitive). */
export function matchGeoDiscoveryTagHashes(
  requestedTagHashes: string[],
  profile: {
    discoveryLocation?: DiscoveryLocation | null;
    discoveryLocationPrecision?: DiscoveryLocationPrecision | null;
  },
): string[] {
  if (requestedTagHashes.length === 0) {
    return [];
  }
  const own = new Set(
    geoDiscoveryTagHashesFromProfile({
      location: profile.discoveryLocation,
      precision: profile.discoveryLocationPrecision,
    }),
  );
  return requestedTagHashes.filter((hash) => own.has(hash.trim().toLowerCase()));
}

export type FriendMatchingGeoScope = Exclude<DiscoveryLocationPrecision, "hidden">;

/** Resolve location + scope for Trust-mode geo matching (signed prefs override profile). */
export function resolveFriendMatchingGeoInput(input: {
  matchingLocation?: DiscoveryLocation | null;
  matchingLocationScope?: FriendMatchingGeoScope | null;
  humanProfile?: {
    discoveryLocation?: DiscoveryLocation | null;
    discoveryLocationPrecision?: DiscoveryLocationPrecision | null;
  } | null;
}): { location: DiscoveryLocation; precision: FriendMatchingGeoScope } | null {
  const location = input.matchingLocation ?? input.humanProfile?.discoveryLocation;
  if (!location?.countryCode) {
    return null;
  }
  const precision =
    input.matchingLocationScope ??
    input.humanProfile?.discoveryLocationPrecision ??
    (input.matchingLocation ? ("city" as const) : undefined);
  if (!precision || precision === "hidden") {
    return null;
  }
  return { location, precision };
}

/** DHT topics to query for Trust-mode friend matching geography. */
export function friendMatchingGeoSearchTopics(input: {
  matchingLocation?: DiscoveryLocation | null;
  matchingLocationScope?: FriendMatchingGeoScope | null;
  humanProfile?: {
    discoveryLocation?: DiscoveryLocation | null;
    discoveryLocationPrecision?: DiscoveryLocationPrecision | null;
  } | null;
  nearbyGeohashLength?: number;
}): string[] {
  const resolved = resolveFriendMatchingGeoInput(input);
  if (!resolved) {
    return [];
  }
  const scope =
    resolved.precision === "country" ||
    resolved.precision === "region" ||
    resolved.precision === "city" ||
    resolved.precision === "town" ||
    resolved.precision === "nearby"
      ? resolved.precision
      : "city";
  return locationSearchTopics({
    location: resolved.location,
    scope,
    nearbyGeohashLength: input.nearbyGeohashLength,
  });
}

/** Hashed geo tags for bond-scoped `discovery.request` / broadcast search. */
export function friendMatchingGeoTagHashes(input: {
  matchingLocation?: DiscoveryLocation | null;
  matchingLocationScope?: FriendMatchingGeoScope | null;
  humanProfile?: {
    discoveryLocation?: DiscoveryLocation | null;
    discoveryLocationPrecision?: DiscoveryLocationPrecision | null;
  } | null;
  nearbyGeohashLength?: number;
}): string[] {
  return hashGeoDiscoveryTopics(friendMatchingGeoSearchTopics(input));
}

/** Topics to query when searching for peers in the same place as `location`. */
export function locationSearchTopics(input: {
  location: DiscoveryLocation;
  scope: "country" | "region" | "city" | "town" | "nearby";
  nearbyGeohashLength?: number;
}): string[] {
  const cc = normalizeCountryCode(input.location.countryCode);
  switch (input.scope) {
    case "country":
      return [`${GEO_TOPIC_PREFIX}country:${cc}`];
    case "region": {
      const regionSlug = normalizeLocationSlug(input.location.regionCode ?? "");
      return regionSlug
        ? [`${GEO_TOPIC_PREFIX}region:${cc}-${regionSlug}`]
        : [`${GEO_TOPIC_PREFIX}country:${cc}`];
    }
    case "city": {
      const citySlug = normalizeLocationSlug(input.location.city ?? "");
      return citySlug
        ? [`${GEO_TOPIC_PREFIX}city:${cc}-${citySlug}`]
        : deriveLocationDiscoveryTopics({ location: input.location, precision: "region" });
    }
    case "town": {
      const townSlug = normalizeLocationSlug(input.location.town ?? "");
      return townSlug
        ? [`${GEO_TOPIC_PREFIX}town:${cc}-${townSlug}`]
        : locationSearchTopics({ location: input.location, scope: "city" });
    }
    case "nearby": {
      const gh = input.location.geohash?.trim().toLowerCase();
      if (!gh) return [];
      const len = input.nearbyGeohashLength ?? NEARBY_GEOHASH_PRECISION;
      const prefix = gh.slice(0, len);
      return geohashNeighborPrefixes(prefix).map((p) => `${GEO_TOPIC_PREFIX}geohash:${p}`);
    }
    default:
      return [];
  }
}

export type ParsedGeoTopic =
  | { kind: "country"; countryCode: string }
  | { kind: "region"; countryCode: string; regionSlug: string }
  | { kind: "city"; countryCode: string; citySlug: string }
  | { kind: "town"; countryCode: string; townSlug: string }
  | { kind: "geohash"; geohash: string };

export function parseGeoDiscoveryTopic(topic: string): ParsedGeoTopic | null {
  const t = topic.trim();
  if (!t.startsWith(GEO_TOPIC_PREFIX)) return null;
  const rest = t.slice(GEO_TOPIC_PREFIX.length);
  const [kind, value] = rest.split(":", 2);
  if (!kind || !value) return null;
  switch (kind) {
    case "country":
      return { kind: "country", countryCode: value.toUpperCase() };
    case "region": {
      const [cc, ...slugParts] = value.split("-");
      if (!cc || slugParts.length === 0) return null;
      return { kind: "region", countryCode: cc.toUpperCase(), regionSlug: slugParts.join("-") };
    }
    case "city": {
      const [cc, ...slugParts] = value.split("-");
      if (!cc || slugParts.length === 0) return null;
      return { kind: "city", countryCode: cc.toUpperCase(), citySlug: slugParts.join("-") };
    }
    case "town": {
      const [cc, ...slugParts] = value.split("-");
      if (!cc || slugParts.length === 0) return null;
      return { kind: "town", countryCode: cc.toUpperCase(), townSlug: slugParts.join("-") };
    }
    case "geohash":
      return { kind: "geohash", geohash: value.toLowerCase() };
    default:
      return null;
  }
}

/** Human-readable label for a geo topic (UI badges). */
export function formatGeoTopicLabel(topic: string): string {
  const parsed = parseGeoDiscoveryTopic(topic);
  if (!parsed) return topic;
  switch (parsed.kind) {
    case "country":
      return parsed.countryCode;
    case "region":
      return parsed.regionSlug.replace(/-/g, " ");
    case "city":
      return parsed.citySlug.replace(/-/g, " ");
    case "town":
      return parsed.townSlug.replace(/-/g, " ");
    case "geohash":
      return `~${parsed.geohash}`;
    default:
      return topic;
  }
}
