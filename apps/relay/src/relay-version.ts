/**
 * Resolved-package-versions reporter for the relay's HTTP /version endpoint.
 *
 * Reads the *actual* installed package versions from `node_modules/<pkg>/package.json`
 * (not the range declared in our own package.json). Operators rely on this
 * to verify that a redeploy actually picked up the latest build — `npm run
 * relay:build` will silently use the resolved versions from `node_modules`,
 * and a stale `package-lock.json` will pin to old versions even after a
 * clean checkout. This helper exposes the ground truth.
 *
 * Why we read each package explicitly (instead of globbing node_modules):
 *   - avoids leaking unrelated transitive packages
 *   - keeps the /version payload small and predictable
 *   - returns null (rather than throwing) when a package is missing, so
 *     a partial install produces a usable "here's what's there" report
 *     instead of a 500.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

export interface RelayVersionReport {
  /** "@envoymesh/network" package version — the umbrella that pins all libp2p deps. */
  network: string | null;
  /** "@envoymesh/protocol" — wire schema + payload constructors. */
  protocol: string | null;
  /** "@envoymesh/identity" — Ed25519 / device-cert / mandate crypto. */
  identity: string | null;
  /** "@libp2p/circuit-relay-v2" — the relay protocol itself. */
  circuitRelayV2: string | null;
  /** "@libp2p/identify" — version mismatch on this protocol is the most common
   *  cause of "Protocol selection failed" handshake errors against older peers. */
  identify: string | null;
  /** "@libp2p/kad-dht" — DHT provider-record protocol. */
  kadDht: string | null;
  /** "libp2p" — root libp2p package (composition root). */
  libp2p: string | null;
  /** Node.js runtime version — affects which transports are available. */
  node: string;
  /** Process platform + arch — affects prebuilt libp2p transport availability. */
  platform: string;
  /** ISO timestamp the relay started. */
  startedAt: string;
}

const PACKAGES_TO_REPORT = [
  "@envoymesh/network",
  "@envoymesh/protocol",
  "@envoymesh/identity",
  "@libp2p/circuit-relay-v2",
  "@libp2p/identify",
  "@libp2p/kad-dht",
  "libp2p",
] as const;

type PackageName = (typeof PACKAGES_TO_REPORT)[number];

/**
 * Read a package's resolved version from node_modules.
 * Returns null when the package isn't installed or its manifest is unreadable.
 *
 * Note: we can't `require.resolve("@libp2p/<x>/package.json")` directly because
 * modern js-libp2p packages set an `exports` map that only declares the entry
 * point — `package.json` is not an exposed subpath, and Node refuses the
 * lookup. Instead we resolve the package's entry point and walk one level up
 * to the package root, then read `<root>/package.json` directly.
 */
function readInstalledVersion(pkg: PackageName): string | null {
  try {
    const require = createRequire(import.meta.url);
    // Resolve the package's main entry, which is exposed via the exports map.
    const entryPath = require.resolve(pkg);
    // Walk up: dist/src/index.js → dist/src/ → dist/ → <package-root>/
    const packageRoot = dirname(dirname(dirname(entryPath)));
    const manifestPath = resolve(packageRoot, "package.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { version?: string };
    return typeof manifest.version === "string" ? manifest.version : null;
  } catch {
    return null;
  }
}

/**
 * Build the version report. Cached after first call — the versions don't
 * change during a process lifetime, and `/version` may be polled by
 * monitoring tools.
 */
let cachedReport: RelayVersionReport | null = null;
export function buildRelayVersionReport(startedAtIso: string): RelayVersionReport {
  if (cachedReport) return cachedReport;
  cachedReport = {
    network: readInstalledVersion("@envoymesh/network"),
    protocol: readInstalledVersion("@envoymesh/protocol"),
    identity: readInstalledVersion("@envoymesh/identity"),
    circuitRelayV2: readInstalledVersion("@libp2p/circuit-relay-v2"),
    identify: readInstalledVersion("@libp2p/identify"),
    kadDht: readInstalledVersion("@libp2p/kad-dht"),
    libp2p: readInstalledVersion("libp2p"),
    node: process.version,
    platform: `${process.platform}-${process.arch}`,
    startedAt: startedAtIso,
  };
  return cachedReport;
}

/** Reset the cache — only used by tests. */
export function resetRelayVersionReportCache(): void {
  cachedReport = null;
}

/**
 * Format the relay's protocol negotiation surface for `/protocols`.
 *
 * Lists the protocol strings the relay will advertise to inbound peers
 * (registered handlers) and the protocols the relay will use when dialing
 * outbound to other peers. Operators compare this list against what the
 * connecting peer expects — a missing entry is a smoking gun for "my
 * relay won't accept connections from this client".
 *
 * The list is hard-coded here (not derived at runtime) because the relay's
 * inbound handlers are registered in a single `mesh.start()` call whose
 * output is not exposed — and the canonical strings live in
 * `@envoymesh/network/protocols.ts`. Keep both in sync when adding a new
 * protocol.
 */
export interface RelayProtocolReport {
  /** Protocol strings the relay accepts on inbound streams. */
  inbound: string[];
  /** Protocol strings the relay uses when opening outbound streams. */
  outbound: string[];
  /** libp2p identify protocol strings — these are what the peer handshake
   *  actually negotiates; mismatches here are the #1 cause of "Protocol
   *  selection failed" against older libp2p nodes. */
  identify: {
    /** The protocol string the relay uses to dial `/libp2p/id/1.0.0`. */
    outbound: string;
    /** The protocol string the relay registers for inbound. */
    inbound: string;
  };
}

export function buildRelayProtocolReport(): RelayProtocolReport {
  // The protocol strings MUST match packages/network/src/protocols.ts.
  // Hard-coding them here keeps this file dependency-free for the /version
  // endpoint (which is called even when the mesh fails to start).
  const ENVOY_CHAT = "/envoymesh/chat/0.1.0";
  const ENVOY_MESSAGE = "/envoymesh/message/0.1.0";
  const ENVOY_DATA = "/envoymesh/data/0.1.0";
  const CLIENT_PROXY = "/envoymesh/client-proxy/0.1.0";
  const RELAY_RSRC = "/libp2p/circuit-relay-v2/hop/0.1.0";
  const RELAY_STOP = "/libp2p/circuit-relay-v2/stop/0.1.0";
  // The identify protocol uses the libp2p default prefix — see
  // node_modules/@libp2p/identify/dist/src/consts.js
  const IDENTIFY = "/libp2p/id/1.0.0";
  const IDENTIFY_PUSH = "/libp2p/id/push/1.0.0";

  return {
    inbound: [
      ENVOY_CHAT,
      ENVOY_MESSAGE,
      ENVOY_DATA,
      CLIENT_PROXY,
      RELAY_RSRC,
      RELAY_STOP,
      IDENTIFY,
      IDENTIFY_PUSH,
    ],
    outbound: [
      ENVOY_CHAT,
      ENVOY_MESSAGE,
      ENVOY_DATA,
      CLIENT_PROXY,
      IDENTIFY,
      IDENTIFY_PUSH,
    ],
    identify: {
      outbound: IDENTIFY,
      inbound: IDENTIFY,
    },
  };
}