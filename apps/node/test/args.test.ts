import { describe, expect, it } from "vitest";
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

  it("rejects invalid report mode", () => {
    expect(() => parseNodeArgs(["--report-mode", "later"])).toThrow("Invalid report mode");
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
