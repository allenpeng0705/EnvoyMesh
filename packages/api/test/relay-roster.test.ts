import { describe, expect, it } from "vitest";
import {
  generateEd25519KeyPair,
  signCanonicalPayload,
} from "@envoymesh/identity";
import {
  DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDR,
  DEFAULT_ENVOY_US_RELAY_BOOTSTRAP_ADDR,
  parseRelayRosterDocument,
  relayRosterForSigning,
  selectActiveRelayTargets,
  verifyRelayRosterDocument,
  type RelayRosterDocument,
  type UnsignedRelayRosterDocument,
} from "@envoymesh/api";

describe("selectActiveRelayTargets", () => {
  const eu =
    "/dns4/eu.example.com/tcp/4001/p2p/12D3KooWEUEUEUEUEUEUEUEUEUEUEUEUEUEUEUEUEUEUEUEUEUEU";
  const apac =
    "/dns4/apac.example.com/tcp/4001/p2p/12D3KooWAPACAPACAPACAPACAPACAPACAPACAPACAPACAPACAPAC";

  const roster: UnsignedRelayRosterDocument = {
    v: 1,
    issuedAt: "2026-08-28T00:00:00.000Z",
    expiresAt: "2099-01-01T00:00:00.000Z",
    fleetId: "test",
    maxActiveTargets: 4,
    relays: [
      {
        id: "cn",
        peerId: "12D3KooWLNR4WYWHBswe8ux5zWsy6cuGywnYPJbdbaAbbpmJMjbo",
        multiaddrs: [DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDR],
        region: "asia",
        role: "hub",
        priority: 100,
        enabled: true,
      },
      {
        id: "us",
        peerId: "12D3KooWAWiVSpsCjpjauz83ijLugxwScRJi89N4PA1VQ1Czsncb",
        multiaddrs: [DEFAULT_ENVOY_US_RELAY_BOOTSTRAP_ADDR],
        region: "us",
        role: "hub",
        priority: 90,
        enabled: true,
      },
      {
        id: "eu",
        peerId: "12D3KooWEUEUEUEUEUEUEUEUEUEUEUEUEUEUEUEUEUEUEUEUEUEU",
        multiaddrs: [eu],
        region: "eu",
        role: "regional",
        priority: 80,
        enabled: true,
      },
      {
        id: "apac",
        peerId: "12D3KooWAPACAPACAPACAPACAPACAPACAPACAPACAPACAPACAPAC",
        multiaddrs: [apac],
        region: "asia",
        role: "regional",
        priority: 70,
        enabled: true,
      },
      {
        id: "spare",
        peerId: "12D3KooWSPARESPARESPARESPARESPARESPARESPARESPARESPARE",
        multiaddrs: [
          "/dns4/spare.example.com/tcp/4001/p2p/12D3KooWSPARESPARESPARESPARESPARESPARESPARESPARESPARE",
        ],
        region: "us",
        role: "spare",
        priority: 10,
        enabled: true,
      },
    ],
  };

  it("caps at maxActiveTargets and prefers hubs then region", () => {
    const addrs = selectActiveRelayTargets({
      roster,
      preferredRegion: "eu",
      maxActive: 4,
    });
    expect(addrs.length).toBe(4);
    expect(addrs[0]).toBe(DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDR);
    expect(addrs[1]).toBe(DEFAULT_ENVOY_US_RELAY_BOOTSTRAP_ADDR);
    expect(addrs).toContain(eu);
  });

  it("keeps pinned addrs first", () => {
    const pin =
      "/ip4/203.0.113.9/tcp/4001/p2p/12D3KooWPINPINPINPINPINPINPINPINPINPINPINPINPINPINPIN";
    const addrs = selectActiveRelayTargets({
      roster,
      pinnedAddrs: [pin],
      maxActive: 3,
    });
    expect(addrs[0]).toBe(pin);
    expect(addrs.length).toBe(3);
  });

  it("falls back to community hubs when roster empty", () => {
    const addrs = selectActiveRelayTargets({ roster: null });
    expect(addrs).toEqual([
      DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDR,
      DEFAULT_ENVOY_US_RELAY_BOOTSTRAP_ADDR,
    ]);
  });
});

describe("relayRosterHttpUrlFromMultiaddr / collectRelayRosterHttpUrls", () => {
  it("builds HTTP roster URLs from community and extra multiaddrs", async () => {
    const { relayRosterHttpUrlFromMultiaddr, collectRelayRosterHttpUrls, defaultCommunityRelayRosterHttpUrls } =
      await import("@envoymesh/api");
    expect(relayRosterHttpUrlFromMultiaddr(DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDR)).toBe(
      "http://47.93.11.212:15432/relay-roster.json",
    );
    expect(relayRosterHttpUrlFromMultiaddr("/ip4/127.0.0.1/tcp/4001/p2p/12D3KooWLOCAL")).toBeNull();
    const urls = collectRelayRosterHttpUrls({
      multiaddrs: [
        "/dns4/eu.example.com/tcp/4001/p2p/12D3KooWEUEUEUEUEUEUEUEUEUEUEUEUEUEUEUEUEUEUEUEUEUEU",
      ],
    });
    expect(urls).toContain("http://47.93.11.212:15432/relay-roster.json");
    expect(urls).toContain("http://47.251.91.97:15432/relay-roster.json");
    expect(urls).toContain("http://eu.example.com:15432/relay-roster.json");
    expect(defaultCommunityRelayRosterHttpUrls().length).toBeGreaterThanOrEqual(2);
  });
});

describe("acceptRelayRosterDocument", () => {
  it("accepts unsigned roster from a known relay host", async () => {
    const { acceptRelayRosterDocument, coerceRelayRosterDocument } = await import("@envoymesh/api");
    const doc = coerceRelayRosterDocument({
      v: 1,
      issuedAt: "2026-08-28T00:00:00.000Z",
      expiresAt: "2099-01-01T00:00:00.000Z",
      fleetId: "test",
      maxActiveTargets: 4,
      relays: [
        {
          id: "cn",
          peerId: "12D3KooWLNR4WYWHBswe8ux5zWsy6cuGywnYPJbdbaAbbpmJMjbo",
          multiaddrs: [DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDR],
          role: "hub",
          priority: 100,
          enabled: true,
        },
      ],
    });
    expect(acceptRelayRosterDocument({ doc, trustPublicKeyPems: [], fromKnownRelayHost: true }).ok).toBe(
      true,
    );
    expect(acceptRelayRosterDocument({ doc, trustPublicKeyPems: [], fromKnownRelayHost: false }).ok).toBe(
      false,
    );
  });
});

describe("upsertRelayRosterEntry / isRelayRosterNewer", () => {
  it("replaces by peerId and bumps issuedAt", async () => {
    const { upsertRelayRosterEntry, isRelayRosterNewer } = await import("@envoymesh/api");
    const base = {
      v: 1 as const,
      issuedAt: "2026-01-01T00:00:00.000Z",
      expiresAt: "2099-01-01T00:00:00.000Z",
      fleetId: "test",
      maxActiveTargets: 4,
      relays: [
        {
          id: "eu",
          peerId: "12D3KooWEUEUEUEUEUEUEUEUEUEUEUEUEUEUEUEUEUEUEUEUEUEU",
          multiaddrs: [
            "/dns4/eu.example.com/tcp/4001/p2p/12D3KooWEUEUEUEUEUEUEUEUEUEUEUEUEUEUEUEUEUEUEUEUEUEU",
          ],
          role: "regional" as const,
          priority: 40,
          enabled: true,
        },
      ],
    };
    const next = upsertRelayRosterEntry(base, {
      id: "eu",
      peerId: "12D3KooWEUEUEUEUEUEUEUEUEUEUEUEUEUEUEUEUEUEUEUEUEUEU",
      multiaddrs: [
        "/dns4/eu2.example.com/tcp/4001/p2p/12D3KooWEUEUEUEUEUEUEUEUEUEUEUEUEUEUEUEUEUEUEUEUEUEU",
      ],
      role: "regional",
      priority: 80,
      enabled: true,
    });
    expect(next.relays).toHaveLength(1);
    expect(next.relays[0]?.priority).toBe(80);
    expect(isRelayRosterNewer(next, base)).toBe(true);
    expect(isRelayRosterNewer(base, next)).toBe(false);
  });
});

describe("verifyRelayRosterDocument", () => {
  it("accepts a correctly signed document", () => {
    const keys = generateEd25519KeyPair();
    const unsigned: UnsignedRelayRosterDocument = {
      v: 1,
      issuedAt: "2026-08-28T00:00:00.000Z",
      expiresAt: "2099-01-01T00:00:00.000Z",
      fleetId: "test",
      maxActiveTargets: 4,
      relays: [
        {
          id: "cn",
          peerId: "12D3KooWLNR4WYWHBswe8ux5zWsy6cuGywnYPJbdbaAbbpmJMjbo",
          multiaddrs: [DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDR],
          role: "hub",
          priority: 100,
          enabled: true,
        },
      ],
    };
    const signature = signCanonicalPayload(unsigned, keys.privateKeyPem);
    const doc = parseRelayRosterDocument({ ...unsigned, signature });
    expect(verifyRelayRosterDocument(doc, [keys.publicKeyPem])).toBe(true);
    expect(verifyRelayRosterDocument(doc, ["-----BEGIN PUBLIC KEY-----\nMFwwDQYJKoZIhvcNAQEBBQADSwAwSAJBAFake\n-----END PUBLIC KEY-----"])).toBe(
      false,
    );
    const forSigning = relayRosterForSigning(doc as RelayRosterDocument);
    expect(forSigning).not.toHaveProperty("signature");
  });
});
