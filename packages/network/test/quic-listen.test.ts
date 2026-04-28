import { describe, expect, it } from "vitest";
import { expandListenAddressesWithQuic, quicListenFromTcpListen } from "../src/quic-listen.js";

describe("quic listen expansion", () => {
  it("maps tcp listen to udp quic-v1 on the same host and port", () => {
    expect(quicListenFromTcpListen("/ip4/127.0.0.1/tcp/0")).toBe("/ip4/127.0.0.1/udp/0/quic-v1");
  });

  it("appends QUIC companions deduped", () => {
    expect(expandListenAddressesWithQuic(["/ip4/127.0.0.1/tcp/1234"])).toEqual([
      "/ip4/127.0.0.1/tcp/1234",
      "/ip4/127.0.0.1/udp/1234/quic-v1",
    ]);
  });
});
