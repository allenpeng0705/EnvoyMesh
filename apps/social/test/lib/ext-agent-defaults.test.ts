import { describe, expect, it } from "vitest";
import {
  CUSTOM_EXT_AGENT_NEW_ID,
  EXT_AGENT_PRESETS,
  applyExtAgentPresetToDraft,
  finalizeExtAgentDraft,
  getExtAgentPreset,
  listEditAgentSelectOptions,
  mergeEditAgentOptions,
  resolveExtAgentEntry,
  slugifyExtAgentId,
} from "../../src/lib/ext-agent-defaults.js";

const extAgentsFixture = [
  {
    id: "homeclaw",
    name: "HomeClaw",
    adapter: "envoymesh-message",
    url: "http://127.0.0.1:8010/message",
    enabled: true,
  },
  {
    id: "hermes",
    name: "Hermes",
    adapter: "envoymesh-message",
    url: "http://127.0.0.1:8020/message",
    enabled: true,
  },
] as const;

describe("ext-agent-defaults", () => {
  it("provides bundled presets for known agents", () => {
    expect(EXT_AGENT_PRESETS.map((p) => p.id)).toEqual(["homeclaw", "hermes", "openhuman"]);
    expect(getExtAgentPreset("hermes")?.url).toBe("http://127.0.0.1:8020/message");
    expect(getExtAgentPreset("unknown")).toBeUndefined();
  });

  it("merges registry with bundled presets for configure picker", () => {
    const merged = mergeEditAgentOptions([
      { id: "homeclaw", name: "HomeClaw", adapter: "envoymesh-message", url: "http://127.0.0.1:8010/message", enabled: true },
      { id: "my-bot", name: "My Bot", adapter: "envoymesh-message", url: "http://127.0.0.1:9000/message", enabled: true },
    ]);
    expect(merged.map((e) => e.id)).toEqual(["homeclaw", "hermes", "openhuman", "my-bot"]);
  });

  it("lists bundled and custom groups separately", () => {
    const { bundled, custom } = listEditAgentSelectOptions([
      { id: "my-bot", name: "My Bot", adapter: "envoymesh-message", url: "http://127.0.0.1:9000/message", enabled: true },
    ]);
    expect(bundled).toHaveLength(3);
    expect(custom.map((e) => e.id)).toEqual(["my-bot"]);
  });

  it("slugifyExtAgentId normalizes custom ids", () => {
    expect(slugifyExtAgentId("My Custom Agent")).toBe("my-custom-agent");
  });

  it("finalizeExtAgentDraft adds a new custom agent to registry", () => {
    const saved = finalizeExtAgentDraft(
      {
        enabled: true,
        configured: true,
        activeExtAgent: CUSTOM_EXT_AGENT_NEW_ID,
        activeExtAgentId: CUSTOM_EXT_AGENT_NEW_ID,
        name: "My Bot",
        url: "http://127.0.0.1:9000/message",
        extAgents: [...extAgentsFixture],
      },
      "my-bot",
    );
    expect(saved.activeExtAgent).toBe("my-bot");
    expect(saved.extAgents?.find((e) => e.id === "my-bot")?.url).toBe("http://127.0.0.1:9000/message");
  });

  it("applyExtAgentPresetToDraft fills draft fields", () => {
    const next = applyExtAgentPresetToDraft(
      { enabled: true, configured: true, extAgents: [...extAgentsFixture] },
      "hermes",
    );
    expect(next.name).toBe("Hermes");
    expect(next.url).toBe("http://127.0.0.1:8020/message");
    expect(next.activeExtAgent).toBe("hermes");
    expect(next.extAgents?.find((e) => e.id === "hermes")?.url).toBe("http://127.0.0.1:8020/message");
  });

  it("fills missing registry fields from preset", () => {
    const resolved = resolveExtAgentEntry({
      id: "hermes",
      name: "",
      adapter: "",
      url: "",
      enabled: true,
    });
    expect(resolved.name).toBe("Hermes");
    expect(resolved.url).toBe("http://127.0.0.1:8020/message");
    expect(resolved.adapter).toBe("envoymesh-message");
  });
});
