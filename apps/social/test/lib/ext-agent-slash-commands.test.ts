import { describe, expect, it } from "vitest";
import {
  filterExtAgentModels,
  filterExtAgentSlashCommands,
  formatExtAgentSlashHelp,
  formatMmxMediaResult,
  isExtAgentHelpCommand,
  isExtAgentSlashSuggestInput,
  parseExtAgentModelCommand,
  parseMmxMediaCommand,
} from "../../src/lib/ext-agent-slash-commands.js";
import type { ExtAgentCommandCatalog, ExtAgentCommandDescriptor } from "@envoymesh/api";

const cmds: ExtAgentCommandDescriptor[] = [
  {
    slash: "/help",
    summary: "help",
    intercept: "envoy",
    source: "static",
  },
  {
    slash: "/model",
    summary: "model",
    argsHint: "[name]",
    intercept: "envoy",
    source: "static",
  },
  {
    slash: "/compact",
    summary: "compact",
    intercept: "forward",
    source: "static",
  },
];

describe("ext-agent-slash-commands", () => {
  it("detects in-progress slash tokens", () => {
    expect(isExtAgentSlashSuggestInput("/")).toBe(true);
    expect(isExtAgentSlashSuggestInput("/mo")).toBe(true);
    expect(isExtAgentSlashSuggestInput("/model ")).toBe(false);
    expect(isExtAgentSlashSuggestInput("hello")).toBe(false);
  });

  it("filters by prefix", () => {
    expect(filterExtAgentSlashCommands(cmds, "/mo").map((c) => c.slash)).toEqual(["/model"]);
    expect(filterExtAgentSlashCommands(cmds, "/").length).toBe(3);
  });

  it("recognizes /help with optional args", () => {
    expect(isExtAgentHelpCommand("/help")).toBe(true);
    expect(isExtAgentHelpCommand("/help me")).toBe(true);
    expect(isExtAgentHelpCommand("/model")).toBe(false);
  });

  it("parses /model actions", () => {
    expect(parseExtAgentModelCommand("/model")).toEqual({ type: "show" });
    expect(parseExtAgentModelCommand("/model list")).toEqual({ type: "list" });
    expect(parseExtAgentModelCommand("/model default")).toEqual({ type: "default" });
    expect(parseExtAgentModelCommand("/model sonnet")).toEqual({
      type: "set",
      model: "sonnet",
    });
    expect(parseExtAgentModelCommand("/help")).toBeNull();
  });

  it("parses MiniMax media slash commands", () => {
    expect(parseMmxMediaCommand("/image a red fox")).toEqual({
      ok: true,
      params: { kind: "image", prompt: "a red fox" },
    });
    expect(parseMmxMediaCommand("/video sunset")).toEqual({
      ok: true,
      params: { kind: "video", prompt: "sunset" },
    });
    expect(parseMmxMediaCommand("/speech hello world")).toEqual({
      ok: true,
      params: { kind: "speech", prompt: "hello world" },
    });
    expect(parseMmxMediaCommand("/music lofi")).toEqual({
      ok: true,
      params: { kind: "music", prompt: "lofi" },
    });
    expect(parseMmxMediaCommand("/vision /tmp/a.png what is this?")).toEqual({
      ok: true,
      params: { kind: "vision", target: "/tmp/a.png", prompt: "what is this?" },
    });
    expect(parseMmxMediaCommand("/search weather")).toEqual({
      ok: true,
      params: { kind: "search", prompt: "weather" },
    });
    expect(parseMmxMediaCommand("/quota")).toEqual({
      ok: true,
      params: { kind: "quota" },
    });
    expect(parseMmxMediaCommand("/mmx-auth")).toEqual({
      ok: true,
      params: { kind: "auth" },
    });
    expect(parseMmxMediaCommand("/image")).toEqual({
      ok: false,
      error: "Usage: /image <prompt>",
    });
    expect(parseMmxMediaCommand("/vision")).toEqual({
      ok: false,
      error: "Usage: /vision <path-or-url> [question]",
    });
    expect(parseMmxMediaCommand("/model list")).toBeNull();
    expect(parseMmxMediaCommand("hello")).toBeNull();
  });

  it("formats MiniMax media results", () => {
    expect(
      formatMmxMediaResult({
        ok: true,
        kind: "image",
        path: "/home/me/mmx-output/x.png",
      }),
    ).toContain("Saved: /home/me/mmx-output/x.png");
    expect(
      formatMmxMediaResult({ ok: false, kind: "quota", error: "not auth" }),
    ).toContain("failed: not auth");
  });

  it("filters model suggestions after /model ", () => {
    const models = [
      { id: "sonnet" },
      { id: "opus" },
      { id: "haiku", label: "fast" },
    ];
    expect(filterExtAgentModels(models, "/model ").map((m) => m.id)).toEqual([
      "sonnet",
      "opus",
      "haiku",
    ]);
    expect(filterExtAgentModels(models, "/model so").map((m) => m.id)).toEqual(["sonnet"]);
    expect(filterExtAgentModels(models, "/model")).toEqual([]);
  });

  it("formats help text", () => {
    const catalog: ExtAgentCommandCatalog = {
      agentId: "hermes",
      agentName: "Hermes",
      commands: cmds,
      supportsSessionModel: true,
      defaultModel: "hermes-agent",
      catalogVersion: "1",
      fetchedAt: "2026-01-01T00:00:00.000Z",
      limitations: ["Note"],
    };
    const text = formatExtAgentSlashHelp(catalog);
    expect(text).toContain("Hermes slash commands:");
    expect(text).toContain("/help");
    expect(text).toContain("Current model: hermes-agent");
    expect(text).toContain("• Note");
  });
});
