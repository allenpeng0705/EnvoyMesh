import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  decodeWanJoinInviteV1,
  parseEnvoyContactUri,
  parseEnvoyJoinUri,
  parseSetupSponsorFriendConfig,
  type SetupSponsorFriendConfig,
} from "@envoymesh/api";
import { isPrivateLanTcpDialHint } from "@envoymesh/network";
import type { LocalPeerDirectoryStore } from "@envoymesh/local-store";

const BUNDLED_FILENAME = "bundled-sponsor-friend.json";

let cachedBundled: SetupSponsorFriendConfig | null | undefined;

function parseBundledJson(raw: string): SetupSponsorFriendConfig | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parseSetupSponsorFriendConfig(parsed) ?? null;
  } catch {
    return null;
  }
}

/**
 * Read sponsor friend defaults shipped with the node bundle (or env
 * override). Async by contract: the first call reads from disk
 * (`readFile`), subsequent calls hit the module-level `cachedBundled`
 * cache. The async signature is kept (not split into a sync variant)
 * because the cache is per-process, not per-call, and the cost of
 * a single `await` at the call site is negligible compared to the
 * value of a single API surface.
 */
export async function loadBundledSponsorFriendConfig(
  nodeBundleDir?: string,
): Promise<SetupSponsorFriendConfig | null> {
  if (cachedBundled !== undefined) {
    return cachedBundled;
  }

  const envJson = process.env.ENVOYMESH_BUNDLED_SPONSOR_FRIEND_JSON?.trim();
  if (envJson) {
    cachedBundled = parseBundledJson(envJson);
    return cachedBundled;
  }

  const envPath = process.env.ENVOYMESH_BUNDLED_SPONSOR_FRIEND_PATH?.trim();
  if (envPath) {
    try {
      const raw = await readFile(envPath, "utf8");
      cachedBundled = parseBundledJson(raw);
      return cachedBundled;
    } catch {
      cachedBundled = null;
      return null;
    }
  }

  const candidates: string[] = [];
  if (nodeBundleDir?.trim()) {
    candidates.push(join(nodeBundleDir.trim(), BUNDLED_FILENAME));
  }
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    candidates.push(join(here, "..", "..", "..", BUNDLED_FILENAME));
    candidates.push(join(here, "..", BUNDLED_FILENAME));
  } catch {
    // import.meta.url unavailable in some test runners
  }

  for (const path of candidates) {
    try {
      const raw = await readFile(path, "utf8");
      const parsed = parseBundledJson(raw);
      if (parsed) {
        cachedBundled = parsed;
        return parsed;
      }
    } catch {
      // try next candidate
    }
  }

  cachedBundled = null;
  return null;
}

/** Test helper — reset module cache. */
export function resetBundledSponsorFriendCache(): void {
  cachedBundled = undefined;
}

/**
 * Result of a one-shot parse of the bundled sponsor-friend config.
 * Returned so the call site (smart address-filter picker) doesn't
 * have to re-parse the `contactUri` just to look up the peer
 * directory by `peerId`. `multiaddrs` comes from the WAN join
 * invite's `targetMultiaddrs` field (the actual set of dialable
 * addresses the sponsor advertised on its QR code).
 */
export type BundledSponsorFriendParsed = {
  /** Sponsor multiaddrs from the join token's `targetMultiaddrs`. */
  multiaddrs: string[];
  /** Sponsor bootstrap peers from the join token's `bootstrapPeers`.
   *  WAN invites strip RFC1918 from this list at mint time. Older
   *  bundles may still carry LAN addrs; the dial picker may see them
   *  (via `_gatherSponsorMultiaddrs`) and select `"all"` with
   *  circuit-first ordering so same-LAN can fall back without
   *  poisoning wan-default dials. */
  bootstrapPeers: string[];
  /** Parsed `contactUri` — used to look up the peer directory by
   *  `peerId` without re-parsing. */
  link: ReturnType<typeof parseEnvoyContactUri>;
};

/**
 * Parse the bundled sponsor-friend config once, returning both the
 * sponsor's known multiaddrs and the parsed contactUri. The URI is
 * the source of truth for the sponsor's libp2p reachability — it's
 * the same URI the local node would put on its own QR code. The URI
 * may carry addresses in two places:
 *   1. The `peerId` query param (just the libp2p peer ID, not an addr).
 *   2. The base64-encoded `join` token, which decodes to a WAN join
 *      invite payload whose `targetMultiaddrs` field is the actual
 *      set of dialable multiaddrs the sponsor advertised.
 *
 * Returns `null` if the bundled config has no contactUri or the URI
 * can't be parsed. The smart address-filter picker falls back to the
 * local profile default in that case.
 */
export async function loadBundledSponsorFriendParsed(
  nodeBundleDir?: string,
): Promise<BundledSponsorFriendParsed | null> {
  const bundled = await loadBundledSponsorFriendConfig(nodeBundleDir);
  if (!bundled?.contactUri) return null;
  try {
    const link = parseEnvoyContactUri(bundled.contactUri);
    if (!link.joinToken) {
      return { multiaddrs: [], bootstrapPeers: [], link };
    }
    const rawToken = parseEnvoyJoinUri(link.joinToken);
    const invite = decodeWanJoinInviteV1(rawToken);
    return { multiaddrs: invite.targetMultiaddrs ?? [], bootstrapPeers: invite.bootstrapPeers ?? [], link };
  } catch {
    // Malformed URI — treat as no known addrs; the smart picker
    // will fall back to the local profile default rather than crash.
    return null;
  }
}

/**
 * Addresses safe to merge into the peer directory for **WAN** installer
 * packages. Keeps circuits + publicly routable TCP; drops RFC1918 /
 * link-local / CGNAT so `pickAddressFilterForPeer` does not see stale
 * home-LAN addrs and force `"all"` dial order on a remote network.
 *
 * Pass `includePrivateLan: true` only for explicit lan-fast / same-LAN
 * fleet builds that intentionally ship LAN dial targets.
 */
export function selectBundledSponsorBackfillAddrs(
  multiaddrs: readonly string[],
  bootstrapPeers: readonly string[],
  opts?: { includePrivateLan?: boolean },
): string[] {
  const includePrivateLan = opts?.includePrivateLan === true;
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of [...multiaddrs, ...bootstrapPeers]) {
    const addr = raw.trim();
    if (!addr || seen.has(addr)) continue;
    // Bare peer ids (no /ip4/…) are not dial hints — skip.
    if (!addr.includes("/")) continue;
    if (!includePrivateLan && isPrivateLanTcpDialHint(addr)) continue;
    seen.add(addr);
    out.push(addr);
  }
  return out;
}

/**
 * Backfill the bundled sponsor's known multiaddrs into the local peer
 * directory record. The bundled contactUri is the source of truth for
 * the sponsor's libp2p reachability, but on a fresh install the peer
 * directory record for the sponsor is typically empty (`listenAddrs:
 * []`) because the sponsor never came inbound over chat/mDNS. Merging
 * the bundled addresses makes manual dials from the contact list work
 * (dial hints are computed from the peer record) without waiting for
 * a full DHT sync or relay lookup.
 *
 * Idempotent: `mergeListenAddrsForPeerId` is a no-op when the
 * addresses are already present, so calling this on every bundled
 * identity read is safe. Best-effort: errors (peer dir not ready,
 * malformed bundled config) are silently caught so a missing bundled
 * config never breaks the surrounding search / auto-bond flow.
 *
 * By default RFC1918 bootstrap peers from the join token are **not**
 * merged (WAN production packages). Set `includePrivateLan: true` for
 * lan-fast fleet installs.
 */
export async function backfillBundledSponsorPeerAddresses(
  peerDirectoryStore: LocalPeerDirectoryStore,
  nodeBundleDir?: string,
  opts?: { includePrivateLan?: boolean },
): Promise<void> {
  const parsed = await loadBundledSponsorFriendParsed(nodeBundleDir);
  if (!parsed) return;
  const peerId = parsed.link.peerId;
  if (!peerId || (parsed.multiaddrs.length === 0 && parsed.bootstrapPeers.length === 0)) return;
  const allAddrs = selectBundledSponsorBackfillAddrs(
    parsed.multiaddrs,
    parsed.bootstrapPeers,
    opts,
  );
  if (allAddrs.length === 0) return;
  try {
    await peerDirectoryStore.mergeListenAddrsForPeerId(
      peerId,
      allAddrs,
    );
  } catch {
    // Peer dir might not be ready, or merged addresses might be
    // rejected for an edge case. Either way, the backfill is a
    // nice-to-have; the smart picker still has the bundled
    // addresses in memory.
  }
}

export { BUNDLED_FILENAME };
