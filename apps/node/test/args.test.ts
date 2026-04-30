import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { normalizeWin32NpmArgv, parseNodeArgs } from "../src/args.js";

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

  it("parses QUIC flags", () => {
    expect(parseNodeArgs(["--quic"]).enableQuic).toBe(true);
    expect(parseNodeArgs(["--quic", "--no-quic"]).enableQuic).toBe(false);
  });

  it("parses --advertise-addr (repeatable)", () => {
    const a1 = "/ip4/1.2.3.4/tcp/4001";
    const a2 = "/dns4/relay.example.com/tcp/4001";
    expect(parseNodeArgs(["--advertise-addr", a1]).advertiseAddrs).toEqual([a1]);
    expect(parseNodeArgs(["--advertise-addr", a1, "--advertise-addr", a2]).advertiseAddrs).toEqual([a1, a2]);
  });

  it("normalizeWin32NpmArgv preserves argv when any --flag is present", () => {
    expect(normalizeWin32NpmArgv(["--profile", "C:\\a", "/ip4/x"])).toEqual(["--profile", "C:\\a", "/ip4/x"]);
  });

  it("reconstructs Windows/npm-stripped positional argv (PowerShell) into flags", () => {
    const parsed = parseNodeArgs([
      "C:\\Users\\PS\\envoymesh\\win_profile",
      "/ip4/0.0.0.0/tcp/4002",
      "wan-default",
      "/ip4/172.20.10.3/tcp/4001/p2p/12D3KooWPaa7vGktiUztBoJ1WWdfRJWJzDnu9iBNmoMRv2Kzcgbq",
      "public-libp2p",
    ]);
    expect(parsed.profileDir).toBe("C:\\Users\\PS\\envoymesh\\win_profile");
    expect(parsed.listen).toEqual(["/ip4/0.0.0.0/tcp/4002"]);
    expect(parsed.discoveryProfile).toBe("wan-default");
    expect(parsed.bootstrapPeers).toContain(
      "/ip4/172.20.10.3/tcp/4001/p2p/12D3KooWPaa7vGktiUztBoJ1WWdfRJWJzDnu9iBNmoMRv2Kzcgbq",
    );
    expect(parsed.bootstrapPresets).toContain("public-libp2p");
  });

  it("reconstructs npm-stripped argv with positional p2p-debug token", () => {
    expect(
      parseNodeArgs([
        "C:\\Users\\TEST\\profile",
        "/ip4/0.0.0.0/tcp/4002",
        "wan-default",
        "/ip4/10.0.0.2/tcp/4001/p2p/12D3KooWTEST",
        "public-libp2p",
        "p2p-debug",
      ]).p2pDebug,
    ).toBe(true);
  });

  it("reads QUIC from yaml and allows env override", () => {
    const configPath = writeTempConfig(`
discovery:
  quic: false
`);
    const originalQuic = process.env.ENVOYMESH_QUIC;
    process.env.ENVOYMESH_QUIC = "1";
    try {
      expect(parseNodeArgs(["--config", configPath]).enableQuic).toBe(true);
    } finally {
      process.env.ENVOYMESH_QUIC = originalQuic;
      cleanupTempConfig(configPath);
    }
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

  it("resolves --config relative to INIT_CWD when running in workspace mode", () => {
    const dir = mkdtempSync(join(tmpdir(), "envoymesh-node-init-cwd-"));
    const configPath = join(dir, "init-cwd-config.yaml");
    writeFileSync(
      configPath,
      `
discovery:
  profile: wan-default
      `.trimStart(),
      "utf8",
    );
    const originalInitCwd = process.env.INIT_CWD;
    process.env.INIT_CWD = dir;
    try {
      expect(parseNodeArgs(["--config", "./init-cwd-config.yaml"]).discoveryProfile).toBe("wan-default");
    } finally {
      process.env.INIT_CWD = originalInitCwd;
      rmSync(dir, { recursive: true, force: true });
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
    expect(() => parseNodeArgs(["--bootstrap-preset", "bad preset"])).toThrow("Invalid bootstrap preset");
  });

  it("loads custom bootstrap presets from yaml file", () => {
    const presetsPath = writeTempConfig(`
my-org:
  - /ip4/10.0.0.1/tcp/4001/p2p/peer-a
  - /ip4/10.0.0.2/tcp/4001/p2p/peer-b
`);
    try {
      const args = parseNodeArgs([
        "--bootstrap-presets-file",
        presetsPath,
        "--bootstrap-preset",
        "my-org",
      ]);
      expect(args.bootstrapPeers).toContain("/ip4/10.0.0.1/tcp/4001/p2p/peer-a");
      expect(args.bootstrapPeers).toContain("/ip4/10.0.0.2/tcp/4001/p2p/peer-b");
    } finally {
      cleanupTempConfig(presetsPath);
    }
  });

  it("rejects unknown bootstrap preset without custom registry", () => {
    expect(() => parseNodeArgs(["--bootstrap-preset", "unknown-preset"])).toThrow("Unknown bootstrap preset");
  });

  it("applies join-invite token", () => {
    const token = Buffer.from(
      JSON.stringify({
        v: 1,
        createdAt: "2026-04-28T00:00:00.000Z",
        bootstrapPeers: ["/ip4/10.0.0.3/tcp/5001/p2p/peer-c"],
        bootstrapPresets: ["public-libp2p-am6"],
      }),
      "utf8",
    ).toString("base64url");

    const args = parseNodeArgs(["--join-invite", token]);
    expect(args.bootstrapPeers).toContain("/ip4/10.0.0.3/tcp/5001/p2p/peer-c");
    expect(args.bootstrapPeers.some((peer) => peer.includes("am6.bootstrap.libp2p.io"))).toBe(true);
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
