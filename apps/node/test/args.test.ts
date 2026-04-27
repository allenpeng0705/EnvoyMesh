import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { parseNodeArgs } from "../src/args.js";

describe("node args", () => {
  it("parses bond.request flags", () => {
    expect(
      parseNodeArgs([
        "--profile",
        "./data/test",
        "--bond-request",
        "peer-b",
        "--bond-message",
        "Hi",
        "--bond-proof",
        "Conference 2026",
        "--bond-level",
        "direct",
      ]),
    ).toMatchObject({
      profileDir: "./data/test",
      bondRequestTarget: "peer-b",
      bondMessage: "Hi",
      bondProof: "Conference 2026",
      bondRequestedLevel: "direct",
    });
  });

  it("parses discovery.request flags", () => {
    expect(
      parseNodeArgs([
        "--discovery-request",
        "peer-b",
        "--discovery-tag-hash",
        "hash:books",
        "--discovery-tag-hash",
        "hash:rust",
        "--discovery-capability",
        "task.execute",
        "--discovery-max-results",
        "7",
      ]),
    ).toMatchObject({
      discoveryRequestTarget: "peer-b",
      discoveryTagHashes: ["hash:books", "hash:rust"],
      discoveryCapabilities: ["task.execute"],
      discoveryMaxResults: 7,
    });
  });

  it("parses chat flags", () => {
    expect(
      parseNodeArgs(["--chat", "peer-b", "--chat-text", "hello there"]),
    ).toMatchObject({
      chatTarget: "peer-b",
      chatText: "hello there",
    });
  });

  it("parses knowledge.query outbound flags", () => {
    expect(
      parseNodeArgs([
        "--profile",
        "./data/test",
        "--knowledge-query",
        "peer-b",
        "--knowledge-text",
        "Find the README.",
        "--knowledge-sensitivity",
        "public",
      ]),
    ).toMatchObject({
      profileDir: "./data/test",
      knowledgeQueryTarget: "peer-b",
      knowledgeQueryText: "Find the README.",
      knowledgeQuerySensitivity: "public",
    });
  });

  it("parses A2A task command flags", () => {
    expect(
      parseNodeArgs([
        "--profile",
        "./data/test",
        "--task-propose",
        "peer-b",
        "--task-id",
        "task-1",
        "--mandate-id",
        "mandate-1",
        "--task-intent",
        "find.book",
        "--objective",
        "Find a distributed systems book.",
        "--requested-result",
        "One recommendation.",
      ]),
    ).toMatchObject({
      profileDir: "./data/test",
      taskProposeTarget: "peer-b",
      taskId: "task-1",
      mandateId: "mandate-1",
      taskIntent: "find.book",
      objective: "Find a distributed systems book.",
      requestedResult: "One recommendation.",
    });
  });

  it("parses report mode", () => {
    expect(
      parseNodeArgs([
        "--report-create",
        "peer-b",
        "--task-id",
        "task-1",
        "--report-summary",
        "Done.",
        "--report-mode",
        "approval",
      ]).reportMode,
    ).toBe("approval");
  });

  it("parses advanced P2P connectivity flags", () => {
    expect(
      parseNodeArgs([
        "--dht-client",
        "--bootstrap",
        "/ip4/127.0.0.1/tcp/4001/p2p/peer-a",
        "--bootstrap",
        "/ip4/127.0.0.1/tcp/4002/p2p/peer-b",
        "--relay",
        "--relay-server",
        "--autonat",
        "--dcutr",
        "--p2p-debug",
        "--correlation-id",
        "corr-123",
      ]),
    ).toMatchObject({
      enableDht: true,
      dhtClientMode: true,
      bootstrapPeers: [
        "/ip4/127.0.0.1/tcp/4001/p2p/peer-a",
        "/ip4/127.0.0.1/tcp/4002/p2p/peer-b",
      ],
      enableRelay: true,
      enableRelayServer: true,
      enableAutoNat: true,
      enableDcutr: true,
      p2pDebug: true,
      correlationId: "corr-123",
    });
  });

  it("applies wan-default discovery profile defaults", () => {
    expect(parseNodeArgs(["--discovery-profile", "wan-default"])).toMatchObject({
      discoveryProfile: "wan-default",
      enableDht: true,
      dhtClientMode: true,
      enableRelay: true,
      enableAutoNat: true,
      enableDcutr: true,
    });
  });

  it("parses connectivity-strict flag", () => {
    expect(parseNodeArgs(["--discovery-profile", "wan-default", "--connectivity-strict"])).toMatchObject({
      discoveryProfile: "wan-default",
      connectivityStrict: true,
    });
  });

  it("reads bootstrap peers from env", () => {
    const original = process.env.ENVOYMESH_BOOTSTRAP_PEERS;
    process.env.ENVOYMESH_BOOTSTRAP_PEERS =
      "/ip4/127.0.0.1/tcp/4101/p2p/peer-a,/ip4/127.0.0.1/tcp/4102/p2p/peer-b";
    try {
      expect(parseNodeArgs([]).bootstrapPeers).toEqual([
        "/ip4/127.0.0.1/tcp/4101/p2p/peer-a",
        "/ip4/127.0.0.1/tcp/4102/p2p/peer-b",
      ]);
    } finally {
      process.env.ENVOYMESH_BOOTSTRAP_PEERS = original;
    }
  });

  it("reads discovery settings from yaml config file", () => {
    const configPath = writeTempConfig(`
profile: ./data/yaml-profile
listen:
  - /ip4/0.0.0.0/tcp/4444
discovery:
  profile: wan-default
  connectivityStrict: true
  bootstrapPresets:
    - public-libp2p
  bootstrapPeers:
    - /ip4/127.0.0.1/tcp/4101/p2p/peer-a
  p2pDebug: true
`);
    try {
      const args = parseNodeArgs(["--config", configPath]);
      expect(args).toMatchObject({
        configPath,
        profileDir: "./data/yaml-profile",
        listen: ["/ip4/0.0.0.0/tcp/4444"],
        discoveryProfile: "wan-default",
        connectivityStrict: true,
        p2pDebug: true,
      });
      expect(args.bootstrapPeers).toContain("/ip4/127.0.0.1/tcp/4101/p2p/peer-a");
      expect(args.bootstrapPeers.some((peer) => peer.includes("bootstrap.libp2p.io"))).toBe(true);
    } finally {
      cleanupTempConfig(configPath);
    }
  });

  it("uses env vars over yaml config values", () => {
    const configPath = writeTempConfig(`
discovery:
  profile: lan-fast
`);
    const original = process.env.ENVOYMESH_DISCOVERY_PROFILE;
    process.env.ENVOYMESH_DISCOVERY_PROFILE = "wan-default";
    try {
      expect(parseNodeArgs(["--config", configPath]).discoveryProfile).toBe("wan-default");
    } finally {
      process.env.ENVOYMESH_DISCOVERY_PROFILE = original;
      cleanupTempConfig(configPath);
    }
  });

  it("uses CLI flags over env and yaml config values", () => {
    const configPath = writeTempConfig(`
discovery:
  profile: lan-fast
`);
    const original = process.env.ENVOYMESH_DISCOVERY_PROFILE;
    process.env.ENVOYMESH_DISCOVERY_PROFILE = "wan-default";
    try {
      expect(
        parseNodeArgs(["--config", configPath, "--discovery-profile", "lan-fast"]).discoveryProfile,
      ).toBe("lan-fast");
    } finally {
      process.env.ENVOYMESH_DISCOVERY_PROFILE = original;
      cleanupTempConfig(configPath);
    }
  });

  it("fails when yaml config discovery profile is invalid", () => {
    const configPath = writeTempConfig(`
discovery:
  profile: invalid
`);
    try {
      expect(() => parseNodeArgs(["--config", configPath])).toThrow("discovery.profile");
    } finally {
      cleanupTempConfig(configPath);
    }
  });

  it("applies public bootstrap preset", () => {
    const args = parseNodeArgs(["--bootstrap-preset", "public-libp2p"]);
    expect(args.bootstrapPresets).toEqual(["public-libp2p"]);
    expect(args.bootstrapPeers.length).toBeGreaterThanOrEqual(4);
    expect(args.bootstrapPeers.some((peer) => peer.includes("bootstrap.libp2p.io"))).toBe(true);
  });

  it("supports multiple bootstrap presets", () => {
    const args = parseNodeArgs([
      "--bootstrap-preset",
      "public-libp2p",
      "--bootstrap-preset",
      "public-libp2p-am6",
      "--bootstrap-preset",
      "public-libp2p-am7",
    ]);
    expect(args.bootstrapPresets).toEqual(["public-libp2p", "public-libp2p-am6", "public-libp2p-am7"]);
    expect(args.bootstrapPeers.length).toBeGreaterThanOrEqual(4);
    expect(args.bootstrapPeers.some((peer) => peer.includes("am6.bootstrap.libp2p.io"))).toBe(true);
    expect(args.bootstrapPeers.some((peer) => peer.includes("am7.bootstrap.libp2p.io"))).toBe(true);
  });

  it("rejects invalid report mode", () => {
    expect(() => parseNodeArgs(["--report-mode", "later"])).toThrow("Invalid report mode");
  });

  it("rejects invalid discovery profile", () => {
    expect(() => parseNodeArgs(["--discovery-profile", "wan"])).toThrow("Invalid discovery profile");
  });

  it("rejects invalid bootstrap preset", () => {
    expect(() => parseNodeArgs(["--bootstrap-preset", "public"])).toThrow("Invalid bootstrap preset");
  });

  it("parses task termination flags", () => {
    expect(
      parseNodeArgs([
        "--mandate-expires-at",
        "2027-01-01T00:00:00.000Z",
        "--task-expires-at",
        "2027-01-02T00:00:00.000Z",
        "--close-on-first-completed-result",
      ]),
    ).toMatchObject({
      mandateExpiresAt: "2027-01-01T00:00:00.000Z",
      taskExpiresAt: "2027-01-02T00:00:00.000Z",
      closeOnFirstCompletedResult: true,
    });
  });

  it("parses collect-N, cancel relay, and data-send flags", () => {
    expect(
      parseNodeArgs([
        "--collect-completed-results",
        "3",
        "--cancel-forward-peer",
        "12D3KooWA",
        "--cancel-forward-peer",
        "12D3KooWB",
        "--cancel-relay-hops",
        "2",
        "--data-send",
        "12D3KooWTarget",
        "--data-relative-path",
        "notes/hello.md",
      ]),
    ).toMatchObject({
      collectCompletedResults: 3,
      cancelForwardPeers: ["12D3KooWA", "12D3KooWB"],
      cancelRelayHops: 2,
      dataSendTarget: "12D3KooWTarget",
      dataRelativePath: "notes/hello.md",
    });
  });

  it("parses pairing request flags", () => {
    expect(
      parseNodeArgs([
        "--pair-request",
        "12D3KooWPrimary",
        "--pair-note",
        "Please approve my satellite device.",
      ]),
    ).toMatchObject({
      pairRequestTarget: "12D3KooWPrimary",
      pairNote: "Please approve my satellite device.",
    });
  });
});

function writeTempConfig(contents: string): string {
  const dir = mkdtempSync(join(tmpdir(), "envoymesh-node-args-"));
  const configPath = join(dir, "envoymesh.node.yaml");
  writeFileSync(configPath, contents.trimStart(), "utf8");
  return configPath;
}

function cleanupTempConfig(configPath: string): void {
  rmSync(dirname(configPath), { recursive: true, force: true });
}
