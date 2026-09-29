import { describe, expect, it } from "vitest";
import {
  buildEnvoyUserAgent,
  classifyLibp2pPeer,
  classifyWsProxyProduct,
  defaultEnvoyUserAgent,
  ENVOYMESH_KAD_DHT_PROTOCOL,
  isPublicIpfsSwarmAgent,
  parseEnvoyUserAgent,
  shouldRetainOnCommunityRelay,
  summarizePeerKinds,
} from "../src/peer-product.js";

describe("peer-product identity", () => {
  it("builds and parses envoymesh/<product>/<version>", () => {
    expect(buildEnvoyUserAgent("envoydev", "0.2.0")).toBe("envoymesh/envoydev/0.2.0");
    expect(parseEnvoyUserAgent("envoymesh/node/0.6.0")).toEqual({
      product: "node",
      version: "0.6.0",
    });
    expect(parseEnvoyUserAgent("js-libp2p/2.0.0")).toBeNull();
  });

  it("defaults node vs relay from enableRelayServer", () => {
    expect(defaultEnvoyUserAgent({ enableRelayServer: false, version: "0.6.0" })).toBe(
      "envoymesh/node/0.6.0",
    );
    expect(defaultEnvoyUserAgent({ enableRelayServer: true, version: "0.6.0" })).toBe(
      "envoymesh/relay/0.6.0",
    );
  });

  it("classifies labeled family peers, unlabeled /envoymesh protocols, and swarm unknowns", () => {
    expect(
      classifyLibp2pPeer({ agentVersion: "envoymesh/envoydev/0.2.0" }).kind,
    ).toBe("envoydev");
    expect(
      classifyLibp2pPeer({
        protocols: ["/envoymesh/client-proxy/0.1.0"],
      }).kind,
    ).toBe("family-unlabeled");
    expect(classifyLibp2pPeer({ agentVersion: "kubo/0.28.0" }).kind).toBe("unknown");
    expect(classifyLibp2pPeer({}).kind).toBe("unknown");
  });

  it("classifies WS proxy product query (Veda / EnvoyDev mobile)", () => {
    expect(classifyWsProxyProduct("veda").kind).toBe("veda");
    expect(classifyWsProxyProduct("envoydev-mobile").kind).toBe("envoydev-mobile");
    expect(classifyWsProxyProduct("").kind).toBe("unknown");
    expect(classifyWsProxyProduct(null).kind).toBe("unknown");
  });

  it("summarizes kind counts for the admin strip", () => {
    const summary = summarizePeerKinds(["unknown", "unknown", "envoydev", "veda"]);
    expect(summary.unknown).toBe(2);
    expect(summary.envoydev).toBe(1);
    expect(summary.veda).toBe(1);
    expect(summary["envoymesh-node"]).toBe(0);
  });

  it("recognizes public IPFS swarm agents and retain policy for community relays", () => {
    expect(isPublicIpfsSwarmAgent("kubo/0.39.0/docker")).toBe(true);
    expect(isPublicIpfsSwarmAgent("go-ipfs/0.8.0/")).toBe(true);
    expect(isPublicIpfsSwarmAgent("edgevpn")).toBe(true);
    expect(isPublicIpfsSwarmAgent("envoymesh/envoydev/0.2.0")).toBe(false);
    expect(isPublicIpfsSwarmAgent("js-libp2p/3.2.3 node/22.19.0")).toBe(false);

    expect(shouldRetainOnCommunityRelay({ kind: "unknown" })).toBe(false);
    expect(shouldRetainOnCommunityRelay({ kind: "unknown", protected: true })).toBe(true);
    expect(shouldRetainOnCommunityRelay({ kind: "family-unlabeled" })).toBe(true);
    expect(shouldRetainOnCommunityRelay({ kind: "envoydev" })).toBe(true);
    expect(ENVOYMESH_KAD_DHT_PROTOCOL).toBe("/envoymesh/kad/1.0.0");
  });
});
