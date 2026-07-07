import { describe, expect, it } from "vitest";
import {
  bridgeExecuteToolUrl,
  bridgeListToolsUrl,
  bridgeSendUrl,
  resolveBridgeBaseUrl,
} from "./bridge-url.js";

describe("bridge-url", () => {
  it("strips /bridge/send suffix", () => {
    expect(resolveBridgeBaseUrl("http://127.0.0.1:3031/bridge/send")).toBe("http://127.0.0.1:3031");
    expect(bridgeListToolsUrl("http://127.0.0.1:3031/bridge/send")).toBe(
      "http://127.0.0.1:3031/bridge/list-tools",
    );
    expect(bridgeExecuteToolUrl("http://127.0.0.1:3031/bridge/send")).toBe(
      "http://127.0.0.1:3031/bridge/execute-tool",
    );
    expect(bridgeSendUrl("http://127.0.0.1:3031/bridge/send")).toBe(
      "http://127.0.0.1:3031/bridge/send",
    );
  });

  it("tolerates trailing slash", () => {
    expect(resolveBridgeBaseUrl("http://127.0.0.1:3031/bridge/send/")).toBe("http://127.0.0.1:3031");
    expect(bridgeListToolsUrl("http://127.0.0.1:3031/bridge/send/")).toBe(
      "http://127.0.0.1:3031/bridge/list-tools",
    );
  });

  it("handles bare /bridge base (no /send)", () => {
    expect(resolveBridgeBaseUrl("http://127.0.0.1:3031/bridge")).toBe("http://127.0.0.1:3031/bridge");
    expect(bridgeListToolsUrl("http://127.0.0.1:3031/bridge")).toBe(
      "http://127.0.0.1:3031/bridge/list-tools",
    );
    expect(bridgeExecuteToolUrl("http://127.0.0.1:3031/bridge")).toBe(
      "http://127.0.0.1:3031/bridge/execute-tool",
    );
    expect(bridgeSendUrl("http://127.0.0.1:3031/bridge")).toBe(
      "http://127.0.0.1:3031/bridge/send",
    );
  });

  it("appends /bridge for a bare host:port", () => {
    expect(resolveBridgeBaseUrl("http://127.0.0.1:3031")).toBe("http://127.0.0.1:3031/bridge");
    expect(bridgeListToolsUrl("http://127.0.0.1:3031")).toBe(
      "http://127.0.0.1:3031/bridge/list-tools",
    );
    expect(bridgeSendUrl("http://127.0.0.1:3031")).toBe("http://127.0.0.1:3031/bridge/send");
  });
});
