import { describe, expect, it } from "vitest";
import {
  isSerializedWsRpcMethod,
  WS_SERIALIZED_RPC_METHODS,
} from "../src/ws-rpc-concurrency.js";

describe("ws-rpc-concurrency", () => {
  it("serializes mesh dial / send methods", () => {
    expect(WS_SERIALIZED_RPC_METHODS.has("warmContactConnection")).toBe(true);
    expect(WS_SERIALIZED_RPC_METHODS.has("sendChat")).toBe(true);
    expect(isSerializedWsRpcMethod("warmContactConnection")).toBe(true);
  });

  it("allows concurrent read-style RPCs", () => {
    expect(isSerializedWsRpcMethod("listChatHistory")).toBe(false);
    expect(isSerializedWsRpcMethod("getPeerConnectionInfo")).toBe(false);
    expect(isSerializedWsRpcMethod("getBonds")).toBe(false);
  });
});
