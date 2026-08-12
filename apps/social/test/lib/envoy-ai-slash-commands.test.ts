import { describe, expect, it } from "vitest";
import {
  formatEnvoyAiSlashHelp,
  parseEnvoyAiSlashCommand,
} from "../../src/lib/envoy-ai-slash-commands.js";
import type { ExtAgentCommandCatalog } from "@envoymesh/api";

describe("envoy-ai-slash-commands", () => {
  it("parses envoy-owned actions", () => {
    expect(parseEnvoyAiSlashCommand("/help")).toEqual({ type: "help" });
    expect(parseEnvoyAiSlashCommand("/clear")).toEqual({ type: "clear" });
    expect(parseEnvoyAiSlashCommand("/status")).toEqual({ type: "status" });
    expect(parseEnvoyAiSlashCommand("/skills")).toEqual({ type: "skills" });
    expect(parseEnvoyAiSlashCommand("/report")).toEqual({ type: "report" });
  });

  it("expands hybrid mesh and feature prompts", () => {
    expect(parseEnvoyAiSlashCommand("/bonds")).toMatchObject({ type: "expand" });
    expect(parseEnvoyAiSlashCommand("/knowledge parking meters")).toMatchObject({
      type: "expand",
      prompt: expect.stringContaining("parking meters"),
    });
    expect(parseEnvoyAiSlashCommand("/knowledge")).toEqual({ type: "help" });
    expect(parseEnvoyAiSlashCommand("/about")).toMatchObject({
      type: "expand",
      prompt: expect.stringContaining("EnvoyMesh"),
    });
    expect(parseEnvoyAiSlashCommand("/terminal")).toMatchObject({
      type: "expand",
      prompt: expect.stringContaining("Terminals"),
    });
    expect(parseEnvoyAiSlashCommand("/team")).toMatchObject({
      type: "expand",
      prompt: expect.stringContaining("Office LAN"),
    });
    expect(parseEnvoyAiSlashCommand("/team")?.type === "expand" &&
      parseEnvoyAiSlashCommand("/team")!.prompt).toContain("Manage workers");
    expect(parseEnvoyAiSlashCommand("/family")).toMatchObject({ type: "expand" });
    expect(parseEnvoyAiSlashCommand("/extagent")).toMatchObject({ type: "expand" });
    expect(parseEnvoyAiSlashCommand("/envoyai")).toMatchObject({ type: "expand" });
    expect(parseEnvoyAiSlashCommand("/pi")).toMatchObject({ type: "expand" });
    expect(parseEnvoyAiSlashCommand("/content")).toMatchObject({
      type: "expand",
      prompt: expect.stringContaining("Feed"),
    });
  });

  it("formats help from catalog", () => {
    const catalog: ExtAgentCommandCatalog = {
      agentId: "envoyai",
      agentName: "EnvoyAI",
      commands: [
        {
          slash: "/help",
          summary: "List commands",
          intercept: "envoy",
          source: "static",
        },
      ],
      catalogVersion: "2",
      fetchedAt: "2026-08-12T00:00:00.000Z",
      limitations: ["Note"],
    };
    const text = formatEnvoyAiSlashHelp(catalog);
    expect(text).toContain("/help");
    expect(text).toContain("• Note");
  });
});
