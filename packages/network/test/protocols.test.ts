import { describe, expect, it } from "vitest";
import {
  CLIENT_PROXY_PROTOCOL,
  ENVOY_CHAT_PROTOCOL,
  ENVOY_DATA_PROTOCOL,
  ENVOY_MESSAGE_PROTOCOL,
} from "../src/protocols.js";

describe("libp2p protocol constants", () => {
  it("exports stable protocol IDs", () => {
    expect(ENVOY_MESSAGE_PROTOCOL).toBe("/envoymesh/message/0.1.0");
    expect(ENVOY_CHAT_PROTOCOL).toBe("/envoymesh/chat/0.1.0");
    expect(ENVOY_DATA_PROTOCOL).toBe("/envoymesh/data/0.1.0");
    expect(CLIENT_PROXY_PROTOCOL).toBe("/envoymesh/client-proxy/0.1.0");
  });
});
