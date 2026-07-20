/**
 * Phase 45 — Web Content Browsing URL parser.
 *
 * Parses `envoy://{owner}/{path}` URLs into a typed structure for the
 * Browser view and the `library.read` intent. Disambiguates from the
 * existing `envoy://contact?...` pairing URI (parsed by
 * `parseEnvoyContactUri` in `envoy-contact-link.ts`).
 *
 * URL grammar (see docs/web-content-browsing-design.md §4.1):
 *
 * ```
 * envoy-URL = "envoy://" owner "/" [ path ]
 * owner     = owner-id | handle
 * owner-id  = "envoy:owner:" base64url    ; permanent cryptographic owner ID
 * handle    = "@" handle-char+             ; reserved in v1 (parser accepts, resolver rejects)
 * path      = pct-encoded-segment *( "/" pct-encoded-segment )
 * ```
 *
 * The parser accepts the `@handle` form so v2 URLs work without a parser
 * change, but `resolveEnvoyUrl()` throws `HandleRegistryNotImplemented`
 * for handles in v1.
 *
 * IMPLEMENTATION NOTE: we deliberately do NOT use the WHATWG `URL` class.
 * The owner-id form contains colons (`envoy:owner:abc123`) which the
 * WHATWG URL parser rejects as an invalid `host:port` pair. A regex-based
 * parser is more explicit, easier to audit, and handles our grammar
 * exactly without fighting the http-centric URL spec.
 */

const ENVOY_URL_PREFIX = "envoy://";
const OWNER_ID_PREFIX = "envoy:owner:";
const HANDLE_PREFIX = "@";

/**
 * Matches `envoy://{authority}/{path}` or `envoy://{authority}`.
 * Authority is everything between `envoy://` and the first `/` (or end).
 * Path is everything after the first `/`.
 *
 * The authority may contain colons (for `envoy:owner:...`) — the regex
 * captures it non-greedily up to the first slash, `?`, or `#`. Query
 * strings (used by pairing URIs) are detected separately.
 */
const ENVOY_CONTENT_URL_RE = /^envoy:\/\/([^/?#]+)(?:\/([^?#]*))?(?:[?#].*)?$/;

/** Result of parsing an envoy content URL. */
export type ParsedEnvoyUrl =
  | {
      kind: "content";
      /** The owner identifier — either `envoy:owner:...` or `@handle`. */
      owner: string;
      /** Owner form: "owner-id" (v1, resolvable) or "handle" (v2 reserved). */
      ownerForm: "owner-id" | "handle";
      /** Decoded URL path, leading slash stripped, empty string for root. */
      path: string;
      /** Raw URL string (for round-trip / display). */
      raw: string;
    }
  | {
      /** Not a content URL — likely a `envoy://contact?...` pairing URI. */
      kind: "non-content";
      raw: string;
    };

/**
 * Percent-decode a path *segment by segment*, so that encoded slashes
 * (`%2F`) do NOT become real path separators after decoding.
 *
 * Without per-segment decoding, `envoy://owner/path%2Ftraversal` would
 * decode to `path/traversal` — creating a path-injection vector. By
 * splitting on `/` first, then decoding each segment independently,
 * `%2F` within a segment decodes to `/` but the segment boundary
 * prevents it from being interpreted as a path separator by the file
 * resolver (which operates on the joined path).
 *
 * However, since decodeURIComponent("%2F") = "/", we additionally
 * double-encode %2F to %252F before decoding so it survives as a
 * literal within the segment. This is the standard defense against
 * path traversal via encoded separators.
 *
 * Malformed percent-encoding (e.g. `%ZZ`) in a segment returns that
 * segment as-is rather than throwing — this is intentional leniency
 * so `tryParseEnvoyUrl` never throws.
 */
function decodePath(path: string): string {
  if (!path) return "";
  return path
    .split("/")
    .map((segment) => {
      // Double-encode %2F (and %2f) so decodeURIComponent doesn't turn
      // it into a real slash. After decoding, %252F → %2F (literal).
      const safe = segment.replace(/%2[fF]/g, "%252F");
      try {
        return decodeURIComponent(safe);
      } catch {
        return segment;
      }
    })
    .join("/");
}

/** Discriminated parse result — never throws. */
export function tryParseEnvoyUrl(input: string): ParsedEnvoyUrl | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith(ENVOY_URL_PREFIX)) return null;

  const match = ENVOY_CONTENT_URL_RE.exec(trimmed);
  if (!match) {
    // `envoy://` with nothing after, or otherwise malformed. Treat as non-content
    // so callers can fall through to the pairing URI parser if applicable.
    return { kind: "non-content", raw: trimmed };
  }

  const authority = match[1];
  const rawPath = match[2] ?? "";

  // `envoy://contact?...` pairing URIs use `contact` as the authority.
  if (authority === "contact") {
    return { kind: "non-content", raw: trimmed };
  }

  let ownerForm: "owner-id" | "handle";
  let owner: string;
  if (authority.startsWith(OWNER_ID_PREFIX)) {
    ownerForm = "owner-id";
    owner = authority;
  } else if (authority.startsWith(HANDLE_PREFIX)) {
    ownerForm = "handle";
    owner = authority;
  } else {
    // Unknown authority (e.g. `envoy://foo/bar`) — not a content URL we recognize.
    return { kind: "non-content", raw: trimmed };
  }

  const path = decodePath(rawPath);

  return {
    kind: "content",
    owner,
    ownerForm,
    path,
    raw: trimmed,
  };
}

/** Thrown when a handle-form URL is resolved in v1 (registry not implemented). */
export class HandleRegistryNotImplementedError extends Error {
  constructor(handle: string) {
    super(
      `Handle URLs (envoy://${handle}/...) require a handle registry that is not implemented in v1. ` +
        `Use the owner-id form: envoy://envoy:owner:<base64>/...`,
    );
    this.name = "HandleRegistryNotImplementedError";
  }
}

/** Thrown when an envoy URL is malformed. */
export class InvalidEnvoyUrlError extends Error {
  constructor(reason: string, input?: string) {
    super(`Invalid envoy URL: ${reason}${input ? ` (input: ${input})` : ""}`);
    this.name = "InvalidEnvoyUrlError";
  }
}

/**
 * Parse an envoy content URL, throwing on invalid input.
 *
 * Accepts both owner-id and handle forms (the handle form parses but
 * `resolveEnvoyUrl` will reject it). Use `tryParseEnvoyUrl` for
 * non-throwing disambiguation between content URLs and pairing URIs.
 */
export function parseEnvoyUrl(input: string): {
  owner: string;
  ownerForm: "owner-id" | "handle";
  path: string;
  raw: string;
} {
  const parsed = tryParseEnvoyUrl(input);
  if (!parsed) {
    throw new InvalidEnvoyUrlError("not an envoy URL", input);
  }
  if (parsed.kind !== "content") {
    throw new InvalidEnvoyUrlError(
      "not a content URL (authority is not an owner-id or handle)",
      input,
    );
  }
  const { kind: _kind, ...rest } = parsed;
  return rest;
}

/**
 * Resolve a parsed envoy content URL to the components needed to issue
 * a `library.read` request: the target owner ID and the path.
 *
 * In v1, only the owner-id form resolves. Handle-form URLs throw
 * `HandleRegistryNotImplementedError` — the parser still accepts them
 * so v2 URLs work without a parser change once a registry exists.
 */
export function resolveEnvoyUrl(
  input: string | ReturnType<typeof parseEnvoyUrl>,
): {
  targetOwnerId: string;
  path: string;
} {
  const parsed = typeof input === "string" ? parseEnvoyUrl(input) : input;
  if (parsed.ownerForm === "handle") {
    throw new HandleRegistryNotImplementedError(parsed.owner);
  }
  return {
    targetOwnerId: parsed.owner,
    path: parsed.path,
  };
}

/**
 * Build an envoy content URL from an owner ID and path.
 *
 * The path is percent-encoded automatically (using `encodeURIComponent`
 * per segment, preserving `/` as the path separator). Empty path
 * produces the owner root URL.
 */
export function buildEnvoyUrl(ownerId: string, path?: string): string {
  if (!ownerId) {
    throw new InvalidEnvoyUrlError("ownerId is required");
  }
  if (!ownerId.startsWith(OWNER_ID_PREFIX) && !ownerId.startsWith(HANDLE_PREFIX)) {
    throw new InvalidEnvoyUrlError(
      `ownerId must start with "${OWNER_ID_PREFIX}" or "${HANDLE_PREFIX}"`,
      ownerId,
    );
  }
  const trimmedPath = (path ?? "").trim();
  if (!trimmedPath) {
    return `envoy://${ownerId}/`;
  }
  // Percent-encode each segment so `/` survives as a path separator.
  const encodedPath = trimmedPath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `envoy://${ownerId}/${encodedPath}`;
}

/** Type guard: does the input string look like an envoy content URL (not a pairing URI)? */
export function isEnvoyContentUrl(input: string): boolean {
  const parsed = tryParseEnvoyUrl(input);
  return parsed?.kind === "content";
}

/** Type guard: does the input string look like an envoy pairing URI? */
export function isEnvoyContactUri(input: string): boolean {
  const trimmed = input.trim();
  if (!trimmed.startsWith(ENVOY_URL_PREFIX)) return false;
  // Pairing URIs have `contact` as the authority (before any `/`, `?`, or `#`).
  const afterScheme = trimmed.slice(ENVOY_URL_PREFIX.length);
  let authorityEnd = afterScheme.length;
  for (let i = 0; i < afterScheme.length; i++) {
    const c = afterScheme[i];
    if (c === "/" || c === "?" || c === "#") {
      authorityEnd = i;
      break;
    }
  }
  const authority = afterScheme.slice(0, authorityEnd);
  return authority === "contact";
}
