import { describe, expect, it } from "vitest";
import {
  buildAgentUrl,
  buildBridgeConfigSnippet,
  resolveBridgeConfigHintLines,
} from "./setup-hints.js";
import type { ResolvedEnvoymeshAccount } from "./types.js";

const baseAccount: ResolvedEnvoymeshAccount = {
  accountId: "default",
  enabled: true,
  bridgeUrl: "http://127.0.0.1:3031/bridge/send",
  bridgeSecret: "sekrit",
  inboundSecret: "sekrit",
  webhookPath: "/webhook/envoymesh",
  webhookPathSource: "default",
  dmPolicy: "allowlist",
  allowedOwnerIds: [],
};

describe("setup-hints", () => {
  it("builds agentUrl from gateway base and path", () => {
    expect(buildAgentUrl("http://127.0.0.1:18789", "/webhook/envoymesh")).toBe(
      "http://127.0.0.1:18789/webhook/envoymesh",
    );
  });

  it("includes bridge-config snippet in status lines", () => {
    const lines = resolveBridgeConfigHintLines(baseAccount);
    expect(lines.join("\n")).toContain("bridge-config.json");
    expect(lines.join("\n")).toContain("agentUrl");
    const snippet = buildBridgeConfigSnippet({
      agentUrl: "http://127.0.0.1:18789/webhook/envoymesh",
      secret: "sekrit",
    });
    expect(snippet).toContain('"listenPort": 3031');
  });
});
