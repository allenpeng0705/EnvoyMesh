/**
 * Tests for the bundled sponsor-friend loader — the file shipped with
 * the Tauri desktop bundle that gives fresh installs a working
 * sponsor to auto-bond to (the build-time Allen Peng in the DMG).
 *
 * Covers:
 *   - loadBundledSponsorFriendParsed: parses the contactUri + join token
 *     in one call, returns multiaddrs + parsed link
 *   - backfillBundledSponsorPeerAddresses: merges the bundled
 *     multiaddrs into the local peer directory record so manual dials
 *     from the contact list work without waiting for DHT/relay
 *     discovery
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  backfillBundledSponsorPeerAddresses,
  loadBundledSponsorFriendParsed,
  resetBundledSponsorFriendCache,
} from "../src/bundled-sponsor-friend-loader.js";

// Real-shape bundled config (matches apps/tauri/src-tauri/resources/node/bundled-sponsor-friend.json
// in production but with synthetic multiaddrs + a synthetic join token). The
// loader cares about: (1) `contactUri` parses cleanly, (2) the embedded
// `join` token decodes to a WanJoinInviteV1 with `targetMultiaddrs`.
const SPONSOR_PEER_ID = "12D3KooWSyntheticSponsorPeerId";
const SPONSOR_OWNER_ID = "envoy:owner:SyntheticSponsorOwnerId";
const SPONSOR_DISPLAY_NAME = "Synthetic Sponsor";
const SPONSOR_LAN_ADDR = "/ip4/192.168.1.50/tcp/64589/p2p/" + SPONSOR_PEER_ID;
const SPONSOR_CIRCUIT_ADDR =
  "/ip4/47.93.11.212/tcp/4001/p2p/12D3KooWRelay/p2p-circuit/p2p/" + SPONSOR_PEER_ID;

// Minimal WanJoinInviteV1 — base64url(JSON.stringify({...})). We construct
// it once and reuse across tests.
const SPONSOR_INVITE = {
  v: 1,
  createdAt: "2026-07-11T00:00:00.000Z",
  expiresAt: "2027-07-11T00:00:00.000Z",
  targetPeerId: SPONSOR_PEER_ID,
  targetMultiaddrs: [SPONSOR_LAN_ADDR, SPONSOR_CIRCUIT_ADDR],
  bootstrapPeers: [],
  bootstrapPresets: ["public-libp2p"],
};
const SPONSOR_JOIN_TOKEN = Buffer.from(
  JSON.stringify(SPONSOR_INVITE),
  "utf8",
).toString("base64url");

const SPONSOR_CONTACT_URI = `envoy://contact?v=1&peerId=${SPONSOR_PEER_ID}&ownerId=${encodeURIComponent(SPONSOR_OWNER_ID)}&name=${encodeURIComponent(SPONSOR_DISPLAY_NAME)}&join=${SPONSOR_JOIN_TOKEN}`;

const bundledConfigJson = JSON.stringify({
  version: "0.1",
  enabled: true,
  contactUri: SPONSOR_CONTACT_URI,
  helloMessage: "Hello!",
});

let tmpDir: string;
let savedEnvPath: string | undefined;
let savedEnvJson: string | undefined;

beforeEach(() => {
  // Pin the loader to the test's tmp file via the env var override.
  // The loader's `nodeBundleDir` arg also works, but the env var has
  // higher priority (it's checked before the candidates list) and
  // short-circuits the import.meta.url parent traversal that would
  // otherwise pick up any stray `bundled-sponsor-friend.json` sitting
  // at the repo root from a previous build.
  savedEnvPath = process.env.ENVOYMESH_BUNDLED_SPONSOR_FRIEND_PATH;
  savedEnvJson = process.env.ENVOYMESH_BUNDLED_SPONSOR_FRIEND_JSON;
  resetBundledSponsorFriendCache();
  tmpDir = mkdtempSync(join(tmpdir(), "bundled-sponsor-test-"));
  writeFileSync(join(tmpDir, "bundled-sponsor-friend.json"), bundledConfigJson);
  process.env.ENVOYMESH_BUNDLED_SPONSOR_FRIEND_PATH = join(
    tmpDir,
    "bundled-sponsor-friend.json",
  );
  delete process.env.ENVOYMESH_BUNDLED_SPONSOR_FRIEND_JSON;
});

afterEach(() => {
  resetBundledSponsorFriendCache();
  if (savedEnvPath === undefined) {
    delete process.env.ENVOYMESH_BUNDLED_SPONSOR_FRIEND_PATH;
  } else {
    process.env.ENVOYMESH_BUNDLED_SPONSOR_FRIEND_PATH = savedEnvPath;
  }
  if (savedEnvJson === undefined) {
    delete process.env.ENVOYMESH_BUNDLED_SPONSOR_FRIEND_JSON;
  } else {
    process.env.ENVOYMESH_BUNDLED_SPONSOR_FRIEND_JSON = savedEnvJson;
  }
  if (tmpDir) {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

describe("loadBundledSponsorFriendParsed", () => {
  it("parses the contactUri and decodes the join token in one call", async () => {
    const parsed = await loadBundledSponsorFriendParsed(tmpDir);
    expect(parsed).not.toBeNull();
    expect(parsed!.link.peerId).toBe(SPONSOR_PEER_ID);
    expect(parsed!.link.ownerId).toBe(SPONSOR_OWNER_ID);
    expect(parsed!.link.displayName).toBe(SPONSOR_DISPLAY_NAME);
    expect(parsed!.multiaddrs).toEqual([SPONSOR_LAN_ADDR, SPONSOR_CIRCUIT_ADDR]);
  });

  it("returns null when the bundled config has no contactUri", async () => {
    writeFileSync(
      join(tmpDir, "bundled-sponsor-friend.json"),
      JSON.stringify({ version: "0.1", enabled: true }),
    );
    resetBundledSponsorFriendCache();
    const parsed = await loadBundledSponsorFriendParsed(tmpDir);
    expect(parsed).toBeNull();
  });

  it("returns null when the bundled contactUri is malformed", async () => {
    writeFileSync(
      join(tmpDir, "bundled-sponsor-friend.json"),
      JSON.stringify({
        version: "0.1",
        contactUri: "not a valid envoy://contact URI",
      }),
    );
    resetBundledSponsorFriendCache();
    const parsed = await loadBundledSponsorFriendParsed(tmpDir);
    expect(parsed).toBeNull();
  });

  it("returns empty multiaddrs when the contactUri has no join token", async () => {
    const contactUriNoJoin = `envoy://contact?v=1&peerId=${SPONSOR_PEER_ID}&ownerId=${encodeURIComponent(SPONSOR_OWNER_ID)}&name=${encodeURIComponent(SPONSOR_DISPLAY_NAME)}`;
    writeFileSync(
      join(tmpDir, "bundled-sponsor-friend.json"),
      JSON.stringify({
        version: "0.1",
        enabled: true,
        contactUri: contactUriNoJoin,
      }),
    );
    // The env var override must be re-pointed at the new file so the
    // loader reads the test's override instead of the beforeEach one.
    process.env.ENVOYMESH_BUNDLED_SPONSOR_FRIEND_PATH = join(
      tmpDir,
      "bundled-sponsor-friend.json",
    );
    resetBundledSponsorFriendCache();

    const parsed = await loadBundledSponsorFriendParsed(tmpDir);
    expect(parsed).not.toBeNull();
    expect(parsed!.link.peerId).toBe(SPONSOR_PEER_ID);
    expect(parsed!.multiaddrs).toEqual([]);
  });
});

describe("backfillBundledSponsorPeerAddresses", () => {
  it("merges bundled multiaddrs into the peer record's listenAddrs", async () => {
    const existingRecord = {
      version: "0.1" as const,
      peerId: SPONSOR_PEER_ID,
      ownerId: SPONSOR_OWNER_ID,
      deviceId: "test-device",
      lastSeenAt: new Date().toISOString(),
      listenAddrs: [],
    };
    const mockPeerDirectoryStore = {
      mergeListenAddrsForPeerId: vi.fn().mockResolvedValue(undefined),
    };

    await backfillBundledSponsorPeerAddresses(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockPeerDirectoryStore as any,
      tmpDir,
    );

    expect(mockPeerDirectoryStore.mergeListenAddrsForPeerId).toHaveBeenCalledTimes(
      1,
    );
    expect(mockPeerDirectoryStore.mergeListenAddrsForPeerId).toHaveBeenCalledWith(
      SPONSOR_PEER_ID,
      // WAN backfill strips RFC1918 — circuit only.
      [SPONSOR_CIRCUIT_ADDR],
    );
  });

  it("keeps LAN addrs when includePrivateLan is true (lan-fast fleet)", async () => {
    const mockPeerDirectoryStore = {
      mergeListenAddrsForPeerId: vi.fn().mockResolvedValue(undefined),
    };
    await backfillBundledSponsorPeerAddresses(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockPeerDirectoryStore as any,
      tmpDir,
      { includePrivateLan: true },
    );
    expect(mockPeerDirectoryStore.mergeListenAddrsForPeerId).toHaveBeenCalledWith(
      SPONSOR_PEER_ID,
      [SPONSOR_LAN_ADDR, SPONSOR_CIRCUIT_ADDR],
    );
  });

  it("selectBundledSponsorBackfillAddrs drops private LAN by default", async () => {
    const { selectBundledSponsorBackfillAddrs } = await import(
      "../src/bundled-sponsor-friend-loader.js"
    );
    expect(
      selectBundledSponsorBackfillAddrs(
        [SPONSOR_CIRCUIT_ADDR],
        [SPONSOR_LAN_ADDR, "/ip4/1.2.3.4/tcp/4001/p2p/12D3KooWRelay"],
      ),
    ).toEqual([
      SPONSOR_CIRCUIT_ADDR,
      "/ip4/1.2.3.4/tcp/4001/p2p/12D3KooWRelay",
    ]);
  });

  it("is a no-op when the bundled config has no contactUri", async () => {
    writeFileSync(
      join(tmpDir, "bundled-sponsor-friend.json"),
      JSON.stringify({ version: "0.1" }),
    );
    resetBundledSponsorFriendCache();

    const mockPeerDirectoryStore = {
      mergeListenAddrsForPeerId: vi.fn().mockResolvedValue(undefined),
    };

    await backfillBundledSponsorPeerAddresses(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockPeerDirectoryStore as any,
      tmpDir,
    );

    expect(mockPeerDirectoryStore.mergeListenAddrsForPeerId).not.toHaveBeenCalled();
  });

  it("is a no-op when the bundled config has no join token (no multiaddrs)", async () => {
    const contactUriNoJoin = `envoy://contact?v=1&peerId=${SPONSOR_PEER_ID}&ownerId=${encodeURIComponent(SPONSOR_OWNER_ID)}`;
    writeFileSync(
      join(tmpDir, "bundled-sponsor-friend.json"),
      JSON.stringify({ version: "0.1", contactUri: contactUriNoJoin }),
    );
    resetBundledSponsorFriendCache();

    const mockPeerDirectoryStore = {
      mergeListenAddrsForPeerId: vi.fn().mockResolvedValue(undefined),
    };

    await backfillBundledSponsorPeerAddresses(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockPeerDirectoryStore as any,
      tmpDir,
    );

    expect(mockPeerDirectoryStore.mergeListenAddrsForPeerId).not.toHaveBeenCalled();
  });

  it("swallows peer-dir errors so a misbehaving store doesn't break the flow", async () => {
    const mockPeerDirectoryStore = {
      mergeListenAddrsForPeerId: vi
        .fn()
        .mockRejectedValue(new Error("peer dir not ready")),
    };

    // Should not throw.
    await expect(
      backfillBundledSponsorPeerAddresses(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mockPeerDirectoryStore as any,
        tmpDir,
      ),
    ).resolves.toBeUndefined();
  });
});
