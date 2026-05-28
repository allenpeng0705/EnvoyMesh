import { describe, expect, it } from "vitest";
import { bridgeExecuteToolUrl, bridgeListToolsUrl, resolveBridgeBaseUrl } from "./bridge-url.js";

describe("bridge-url", () => {
  it("strips /bridge/send suffix", () => {
    expect(resolveBridgeBaseUrl("http://127.0.0.1:3031/bridge/send")).toBe("http://127.0.0.1:3031");
    expect(bridgeListToolsUrl("http://127.0.0.1:3031/bridge/send")).toBe(
      "http://127.0.0.1:3031/bridge/list-tools",
    );
    expect(bridgeExecuteToolUrl("http://127.0.0.1:3031/bridge/send")).toBe(
      "http://127.0.0.1:3031/bridge/execute-tool",
    );
  });
});
