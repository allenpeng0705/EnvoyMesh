import { describe, expect, it } from "vitest";
import { relayDirectClientWsUrl } from "../src/relay-ws-url.js";

describe("relayDirectClientWsUrl", () => {
  it("appends /ws/client to bare relay ws base", () => {
    expect(relayDirectClientWsUrl("ws://47.93.11.212:15432/ws")).toBe(
      "ws://47.93.11.212:15432/ws/client",
    );
  });

  it("leaves /ws/client unchanged", () => {
    expect(relayDirectClientWsUrl("ws://relay:15432/ws/client")).toBe(
      "ws://relay:15432/ws/client",
    );
  });
});
