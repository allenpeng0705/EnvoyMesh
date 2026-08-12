import { describe, expect, it } from "vitest";
import {
  buildExtAgentCommandCatalog,
  formatExtAgentCommandHelp,
  mergeExtAgentCommandDescriptors,
} from "../src/ext-agent-adapter/command-catalog.js";

describe("ext-agent command catalog", () => {
  it("excludes HomeClaw TUI verbs but still merges MiniMax media slash", () => {
    const catalog = buildExtAgentCommandCatalog({
      agentId: "homeclaw",
      agentName: "HomeClaw",
      now: new Date("2026-08-12T00:00:00.000Z"),
    });
    expect(catalog.commands.every((c) => c.slash.startsWith("/") && (
      ["/image", "/video", "/speech", "/music", "/vision", "/search", "/quota", "/mmx-auth"].includes(c.slash)
    ))).toBe(true);
    expect(catalog.commands.find((c) => c.slash === "/image")?.intercept).toBe("envoy");
    expect(catalog.limitations?.some((n) => /HomeClaw/i.test(n))).toBe(true);
    expect(catalog.limitations?.some((n) => /mmx-cli/i.test(n))).toBe(true);
    expect(catalog.catalogVersion).toBe("3");
    expect(catalog.fetchedAt).toBe("2026-08-12T00:00:00.000Z");
  });

  it("includes envoy /help for Codex static baseline", () => {
    const catalog = buildExtAgentCommandCatalog({
      agentId: "codex",
      agentName: "Codex",
    });
    const help = catalog.commands.find((c) => c.slash === "/help");
    expect(help?.intercept).toBe("envoy");
    expect(help?.source).toBe("static");
    expect(catalog.commands.some((c) => c.slash === "/model")).toBe(true);
    expect(catalog.commands.find((c) => c.slash === "/image")?.intercept).toBe("envoy");
    expect(catalog.catalogVersion).toBe("3");
    expect(catalog.limitations?.some((n) => /mmx-cli/i.test(n))).toBe(true);
  });

  it("ships a full Codex slash surface (not a tiny subset)", () => {
    const catalog = buildExtAgentCommandCatalog({
      agentId: "codex",
      agentName: "Codex",
    });
    expect(catalog.commands.length).toBeGreaterThan(40);
    for (const slash of [
      "/review",
      "/diff",
      "/plan",
      "/init",
      "/permissions",
      "/compact",
      "/status",
      "/usage",
    ]) {
      expect(catalog.commands.some((c) => c.slash === slash), slash).toBe(true);
    }
  });

  it("ships a full Claude Code slash surface", () => {
    const catalog = buildExtAgentCommandCatalog({
      agentId: "claudecode",
      agentName: "Claude Code",
    });
    expect(catalog.commands.length).toBeGreaterThan(70);
    for (const slash of [
      "/init",
      "/plan",
      "/context",
      "/diff",
      "/review",
      "/rewind",
      "/mcp",
      "/effort",
      "/usage",
      "/doctor",
    ]) {
      expect(catalog.commands.some((c) => c.slash === slash), slash).toBe(true);
    }
  });

  it("ships a full Aider slash surface", () => {
    const catalog = buildExtAgentCommandCatalog({
      agentId: "aider",
      agentName: "Aider",
    });
    expect(catalog.commands.length).toBeGreaterThan(35);
    for (const slash of [
      "/ask",
      "/architect",
      "/ls",
      "/map",
      "/tokens",
      "/web",
      "/read-only",
      "/reset",
    ]) {
      expect(catalog.commands.some((c) => c.slash === slash), slash).toBe(true);
    }
  });

  it("keeps MMX honest — help/model plus shared MiniMax media slash only", () => {
    const catalog = buildExtAgentCommandCatalog({
      agentId: "mmx",
      agentName: "MiniMax",
    });
    expect(catalog.commands.map((c) => c.slash).sort()).toEqual([
      "/help",
      "/image",
      "/mmx-auth",
      "/model",
      "/music",
      "/quota",
      "/search",
      "/speech",
      "/video",
      "/vision",
    ]);
    expect(catalog.commands.find((c) => c.slash === "/image")?.intercept).toBe("envoy");
    expect(catalog.limitations?.some((n) => /no in-chat slash/i.test(n))).toBe(true);
    expect(catalog.limitations?.some((n) => /mmx-cli/i.test(n))).toBe(true);
  });

  it("merges Claude dynamic slash_commands over static (dynamic wins)", () => {
    const catalog = buildExtAgentCommandCatalog({
      agentId: "claudecode",
      agentName: "Claude Code",
      dynamicSlashCommands: ["compact", "review", "model"],
    });
    const compact = catalog.commands.find((c) => c.slash === "/compact");
    expect(compact?.source).toBe("dynamic");
    expect(catalog.commands.find((c) => c.slash === "/review")?.source).toBe("dynamic");
    // /help stays envoy even if dynamic lists it
    expect(catalog.commands.find((c) => c.slash === "/help")?.intercept).toBe("envoy");
  });

  it("mergeExtAgentCommandDescriptors prefers dynamic on collision", () => {
    const merged = mergeExtAgentCommandDescriptors(
      [
        {
          slash: "/model",
          summary: "static",
          intercept: "forward",
          source: "static",
        },
      ],
      [
        {
          slash: "/model",
          summary: "dynamic",
          intercept: "forward",
          source: "dynamic",
        },
      ],
    );
    expect(merged).toHaveLength(1);
    expect(merged[0]?.summary).toBe("dynamic");
    expect(merged[0]?.source).toBe("dynamic");
  });

  it("formatExtAgentCommandHelp lists commands and notes", () => {
    const catalog = buildExtAgentCommandCatalog({
      agentId: "pi",
      agentName: "Pi",
    });
    const text = formatExtAgentCommandHelp(catalog);
    expect(text).toContain("Pi slash commands:");
    expect(text).toContain("/help");
    expect(text).toContain("Notes:");
  });
});
