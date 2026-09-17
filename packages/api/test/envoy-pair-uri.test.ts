import { describe, expect, it } from "vitest";
import {
  buildEnvoyPairUri,
  buildEnvoyPairUriCompressed,
  parseEnvoyPairUri,
} from "../src/envoy-pair-uri.js";
import { decodePairingToken } from "../src/pairing-token.js";

describe("parseEnvoyPairUri", () => {
  it("parses a full envoy://pair URI", () => {
    const uri =
      "envoy://pair?wsUrl=ws%3A%2F%2Frelay.example%3A9000&token=tok123&ownerPublicKey=-----BEGIN%20PUBLIC%20KEY-----&ownerId=envoy%3Aowner%3Aabc&agentPeerId=envoy_agent_x&agentName=HomeClaw&homeNodePeerId=home-peer";
    expect(parseEnvoyPairUri(uri)).toEqual({
      wsUrl: "ws://relay.example:9000",
      token: "tok123",
      ownerPublicKey: "-----BEGIN PUBLIC KEY-----",
      ownerId: "envoy:owner:abc",
      relayPeerId: undefined,
      agentPeerId: "envoy_agent_x",
      agentPubKey: undefined,
      agentName: "HomeClaw",
      homeNodePeerId: "home-peer",
    });
  });

  it("accepts raw query strings", () => {
    const parsed = parseEnvoyPairUri(
      "wsUrl=ws://relay:9000&token=abc&ownerPublicKey=pk&ownerId=envoy:owner:1",
    );
    expect(parsed.wsUrl).toBe("ws://relay:9000");
    expect(parsed.token).toBe("abc");
  });

  it("rejects missing required fields", () => {
    expect(() => parseEnvoyPairUri("envoy://pair?wsUrl=ws://relay:9000")).toThrow(/token/i);
  });

  it("parses lanWsUrl when present (preferred for same-WiFi pairing)", () => {
    const uri =
      "envoy://pair?wsUrl=ws%3A%2F%2Frelay.example%3A9000%2Fws&token=tok123&ownerPublicKey=pk&ownerId=envoy%3Aowner%3Aabc&lanWsUrl=ws%3A%2F%2F192.168.1.100%3A3030%2Fws";
    const parsed = parseEnvoyPairUri(uri);
    expect(parsed.wsUrl).toBe("ws://relay.example:9000/ws");
    expect(parsed.lanWsUrl).toBe("ws://192.168.1.100:3030/ws");
  });
});

describe("relay fallback in the URI form (§7.4 upstream change)", () => {
  it("round-trips relayWsUrls, which the compact codec and the contract already carried", () => {
    // The gap this closes: `PairingPayload.relayWsUrls` existed in the contract and in the compact
    // token codec, but the `envoy://pair` URI could not express it — so a QR code could not offer a
    // relay fallback at all. Found while building EnvoyDev (guide §7.4: contract changes travel
    // upstream, never into a product).
    const uri = buildEnvoyPairUri({
      wsUrl: "wss://relay.example:9000/ws",
      token: "tok",
      ownerPublicKey: "pk",
      ownerId: "envoy:owner:abc",
      app: "EnvoyDev",
      relayPeerId: "12D3KooWrelay",
      relayWsUrls: ["wss://relay-a.example/ws", "wss://relay-b.example/ws"],
    });
    const parsed = parseEnvoyPairUri(uri);
    expect(parsed.relayWsUrls).toEqual([
      "wss://relay-a.example/ws",
      "wss://relay-b.example/ws",
    ]);
    expect(parsed.relayPeerId).toBe("12D3KooWrelay");
    // The app claim survives the round trip, which is what keeps the family's apps apart.
    expect(parsed.app).toBe("EnvoyDev");
  });

  it("omits the field when there is nothing to advertise, and tolerates an empty list", () => {
    const uri = buildEnvoyPairUri({
      wsUrl: "ws://127.0.0.1:3030/ws",
      token: "t",
      ownerPublicKey: "pk",
      ownerId: "o",
      relayWsUrls: [],
    });
    expect(uri).not.toContain("relayWsUrls");
    expect(parseEnvoyPairUri(uri).relayWsUrls).toBeUndefined();
  });

  it("ignores blank entries rather than producing an empty relay URL", () => {
    const parsed = parseEnvoyPairUri(
      "envoy://pair?wsUrl=ws%3A%2F%2Fh%3A1%2Fws&token=t&ownerPublicKey=pk&ownerId=o&relayWsUrls=%20%2C%20wss%3A%2F%2Frelay.example%2Fws%20%2C%20",
    );
    expect(parsed.relayWsUrls).toEqual(["wss://relay.example/ws"]);
  });
});

describe("dial addresses in the URI form", () => {
  it("round-trips a multi-entry bootstrapPeers list, the addresses a phone dials", () => {
    // The gap this closes: `PairingPayload.bootstrapPeers` and the Dart reader both
    // existed, but the URI builder never wrote the field — so a QR could name the home
    // peer id with no address to reach it at, and a relay-free dial was impossible.
    const uri = buildEnvoyPairUri({
      wsUrl: "wss://relay.example:9000/ws",
      token: "tok",
      ownerPublicKey: "pk",
      ownerId: "envoy:owner:abc",
      homeNodePeerId: "12D3KooWHome",
      bootstrapPeers: [
        "/ip4/192.168.1.20/tcp/4001/p2p/12D3KooWHome",
        "/ip4/203.0.113.10/udp/4001/quic-v1/p2p/12D3KooWHome",
        "/ip4/47.93.11.212/tcp/4001/p2p/12D3KooWLNR4WYWHBswe8ux5zWsy6cuGywnYPJbdbaAbbpmJMjbo/p2p-circuit/p2p/12D3KooWHome",
      ],
    });
    const parsed = parseEnvoyPairUri(uri);
    expect(parsed.homeNodePeerId).toBe("12D3KooWHome");
    expect(parsed.bootstrapPeers).toEqual([
      "/ip4/192.168.1.20/tcp/4001/p2p/12D3KooWHome",
      "/ip4/203.0.113.10/udp/4001/quic-v1/p2p/12D3KooWHome",
      "/ip4/47.93.11.212/tcp/4001/p2p/12D3KooWLNR4WYWHBswe8ux5zWsy6cuGywnYPJbdbaAbbpmJMjbo/p2p-circuit/p2p/12D3KooWHome",
    ]);
  });

  it("omits the field when there is nothing to advertise, so older URIs are unchanged", () => {
    const uri = buildEnvoyPairUri({
      wsUrl: "ws://127.0.0.1:3030/ws",
      token: "t",
      ownerPublicKey: "pk",
      ownerId: "o",
      bootstrapPeers: [],
    });
    expect(uri).not.toContain("bootstrapPeers");
    expect(parseEnvoyPairUri(uri).bootstrapPeers).toBeUndefined();
  });
});

describe("compressed pair URI (opt-in §Defect 2)", () => {
  // The same payload the Dart client's golden fixture in
  // `packages/envoy-thin-client-dart/test/pairing_uri_test.dart` decodes, field for field.
  const params = {
    wsUrl: "wss://relay.example:15432/ws?target=12D3KooWHome&token=ptok",
    lanWsUrl: "ws://192.168.1.20:3030/ws",
    token: "ptok",
    ownerPublicKey: "-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAtestKEY\n-----END PUBLIC KEY-----",
    ownerId: "envoy:owner:alice",
    relayPeerId: "12D3KooWRelay",
    relayWsUrls: [
      "wss://relay-us.example:15432/ws",
      "wss://relay-eu.example:15432/ws",
      "wss://relay-ap.example:15432/ws",
    ],
    homeNodePeerId: "12D3KooWHome",
    // The same multiaddr list the Dart golden fixture (`pairing_uri_test.dart`) decodes:
    // this list is what makes a relay-free libp2p dial possible. Three entries on purpose
    // — a one-entry fixture is what let the earlier relay bug hide.
    bootstrapPeers: [
      "/ip4/192.168.1.20/tcp/4001/p2p/12D3KooWHome",
      "/ip4/203.0.113.10/udp/4001/quic-v1/p2p/12D3KooWHome",
      "/ip4/47.93.11.212/tcp/4001/p2p/12D3KooWLNR4WYWHBswe8ux5zWsy6cuGywnYPJbdbaAbbpmJMjbo/p2p-circuit/p2p/12D3KooWHome",
    ],
    agentPeerId: "envoy_agent_abc",
    agentName: "Home Mac",
    app: "EnvoyGo",
  };

  it("keeps the legacy query form as the default shape", () => {
    // The additivity requirement at the wire level: no option means the same URI shape
    // as before, so every reader already in the field is unaffected.
    const uri = buildEnvoyPairUri(params);
    expect(uri.startsWith("envoy://pair?wsUrl=")).toBe(true);
    expect(uri).not.toContain("pairing=");
    expect(parseEnvoyPairUri(uri).relayWsUrls).toEqual(params.relayWsUrls);
  });

  it("mints a pairing= token the Dart client reads, carrying the whole payload", async () => {
    const uri = await buildEnvoyPairUriCompressed(params);
    expect(uri.startsWith("envoy://pair?pairing=")).toBe(true);

    const token = uri.slice("envoy://pair?pairing=".length);
    const decoded = decodePairingToken(token);
    expect(decoded.wsUrl).toBe(params.wsUrl);
    expect(decoded.lanWsUrl).toBe(params.lanWsUrl);
    expect(decoded.token).toBe(params.token);
    expect(decoded.ownerId).toBe(params.ownerId);
    expect(decoded.homeNodePeerId).toBe(params.homeNodePeerId);
    expect(decoded.agentPeerId).toBe(params.agentPeerId);
    expect(decoded.agentName).toBe(params.agentName);
    expect(decoded.app).toBe(params.app);
    expect(decoded.ownerPublicKey).toBe(params.ownerPublicKey);
    expect(decoded.relayPeerId).toBe(params.relayPeerId);
    // The multi-entry list is the whole reason the compressed form exists.
    expect(decoded.relayWsUrls).toEqual(params.relayWsUrls);
    // Peer id + dialable multiaddrs: the two halves of a direct libp2p dial. Before `bp`
    // the compressed form carried the peer id but no address to reach it at.
    expect(decoded.homeNodePeerId).toBe(params.homeNodePeerId);
    expect(decoded.bootstrapPeers).toEqual(params.bootstrapPeers);
  });

  it("exposes compression as an option on the one builder, same bytes as the named alias", async () => {
    expect(await buildEnvoyPairUri(params, { compressed: true })).toBe(
      await buildEnvoyPairUriCompressed(params),
    );
  });

  it("is materially shorter than the query form for a realistic dial payload", async () => {
    // The product constraint is QR density, so the claim "compressed" has to be measured,
    // not assumed. Payload: one peer id, four multiaddrs (two of them circuit addresses
    // through the community relays) and two relay hints.
    //
    // Observed on the machine that wrote this test (Node v24.11.1):
    //   legacy query form      893 chars
    //   compressed form        599 chars  (token 578, `envoy://pair?pairing=`)
    //   ratio                  0.671      (~33% shorter, 294 chars saved)
    // Re-measure by printing both lengths if the field set changes. The 0.8 ceiling is
    // deliberately loose: it still fails if compression stops mattering, and does not
    // go red on a gzip/level difference that shaves a few bytes.
    const dialPayload = {
      ...params,
      relayWsUrls: [
        "wss://relay-us.example:15432/ws",
        "wss://relay-eu.example:15432/ws",
      ],
      bootstrapPeers: [
        "/ip4/192.168.1.20/tcp/4001/p2p/12D3KooWHome",
        "/ip4/203.0.113.10/udp/4001/quic-v1/p2p/12D3KooWHome",
        "/ip4/47.93.11.212/tcp/4001/p2p/12D3KooWLNR4WYWHBswe8ux5zWsy6cuGywnYPJbdbaAbbpmJMjbo/p2p-circuit/p2p/12D3KooWHome",
        "/ip4/47.251.91.97/tcp/4001/p2p/12D3KooWAWiVSpsCjpjauz83ijLugxwScRJi89N4PA1VQ1Czsncb/p2p-circuit/p2p/12D3KooWHome",
      ],
    };
    const legacy = buildEnvoyPairUri(dialPayload);
    const compressed = await buildEnvoyPairUriCompressed(dialPayload);
    expect(compressed.length).toBeLessThan(legacy.length * 0.8);
  });
});
