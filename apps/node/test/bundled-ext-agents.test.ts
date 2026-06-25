import { describe, expect, it } from "vitest";
import {
  defaultExtAgentRegistry,
  mergeBundledExtAgentRegistry,
  parseSidecarPort,
} from "../src/bridge/bundled-ext-agents.js";

describe("bundled-ext-agents", () => {
  it("mergeBundledExtAgentRegistry adds defaults without overwriting", () => {
    const merged = mergeBundledExtAgentRegistry([
      {
        id: "homeclaw",
        name: "My HomeClaw",
        adapter: "envoymesh-message",
        url: "http://127.0.0.1:8099/message",
        enabled: true,
      },
    ]);
    const homeclaw = merged.find((e) => e.id === "homeclaw");
    const hermes = merged.find((e) => e.id === "hermes");
    expect(homeclaw?.name).toBe("My HomeClaw");
    expect(homeclaw?.url).toBe("http://127.0.0.1:8099/message");
    expect(hermes?.url).toBe("http://127.0.0.1:8020/message");
  });

  it("defaultExtAgentRegistry includes hermes enabled", () => {
    const hermes = defaultExtAgentRegistry().find((e) => e.id === "hermes");
    expect(hermes?.enabled).toBe(true);
  });

  it("parseSidecarPort reads url port", () => {
    expect(parseSidecarPort("hermes", "http://127.0.0.1:8025/message")).toBe(8025);
  });
});
