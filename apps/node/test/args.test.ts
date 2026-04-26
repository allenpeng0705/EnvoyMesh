import { describe, expect, it } from "vitest";
import { parseNodeArgs } from "../src/args.js";

describe("node args", () => {
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
    });
  });

  it("rejects invalid report mode", () => {
    expect(() => parseNodeArgs(["--report-mode", "later"])).toThrow("Invalid report mode");
  });
});
