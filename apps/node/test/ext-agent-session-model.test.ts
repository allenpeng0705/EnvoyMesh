import { afterEach, describe, expect, it } from "vitest";
import {
  parseOpenAiModelsResponse,
  _resetExtAgentModelListCacheForTests,
} from "../src/ext-agent-adapter/model-list.js";
import {
  getExtAgentSessionModel,
  setExtAgentSessionModel,
  supportsExtAgentSessionModel,
  _resetExtAgentSessionModelsForTests,
} from "../src/ext-agent-adapter/session-model-store.js";
import { buildExtAgentCommandCatalog } from "../src/ext-agent-adapter/command-catalog.js";

afterEach(() => {
  _resetExtAgentModelListCacheForTests();
  _resetExtAgentSessionModelsForTests();
});

describe("ext-agent model list parse", () => {
  it("parses OpenAI-style model ids", () => {
    expect(
      parseOpenAiModelsResponse({
        data: [{ id: "a" }, { id: "b" }, { id: "a" }, { foo: 1 }],
      }),
    ).toEqual([{ id: "a" }, { id: "b" }]);
  });
});

describe("ext-agent session model store", () => {
  it("supports hermes/openhuman/claudecode only", () => {
    expect(supportsExtAgentSessionModel("hermes")).toBe(true);
    expect(supportsExtAgentSessionModel("codex")).toBe(false);
  });

  it("sets and clears overrides", () => {
    expect(setExtAgentSessionModel("hermes", "owner-1", "gpt-x")).toBe("gpt-x");
    expect(getExtAgentSessionModel("hermes", "owner-1")).toBe("gpt-x");
    setExtAgentSessionModel("hermes", "owner-1", null);
    expect(getExtAgentSessionModel("hermes", "owner-1")).toBeUndefined();
  });
});

describe("ext-agent command catalog session model fields", () => {
  it("marks hermes as supportsSessionModel and attaches models", () => {
    const catalog = buildExtAgentCommandCatalog({
      agentId: "hermes",
      agentName: "Hermes",
      models: [{ id: "hermes-agent" }],
      sessionModel: "gpt-x",
      defaultModel: "hermes-agent",
    });
    expect(catalog.supportsSessionModel).toBe(true);
    expect(catalog.models).toEqual([{ id: "hermes-agent" }]);
    expect(catalog.sessionModel).toBe("gpt-x");
    expect(catalog.commands.find((c) => c.slash === "/model")?.intercept).toBe("envoy");
  });

  it("openhuman can disable session model (RPC transport) → /model forwards", () => {
    const catalog = buildExtAgentCommandCatalog({
      agentId: "openhuman",
      agentName: "OpenHuman",
      supportsSessionModel: false,
    });
    expect(catalog.supportsSessionModel).toBe(false);
    expect(catalog.commands.find((c) => c.slash === "/model")?.intercept).toBe("forward");
  });
});
