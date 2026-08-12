import { describe, expect, it } from "vitest";
import {
  buildEnvoyAiCommandCatalog,
  ENVOY_AI_COMMAND_CATALOG_VERSION,
  expandEnvoyAiHybridSlash,
  formatEnvoyAiCommandHelp,
} from "../src/envoy-ai-command-catalog.js";

describe("envoy-ai-command-catalog", () => {
  it("includes EnvoyMesh-owned, feature-guide, and hybrid commands", () => {
    const catalog = buildEnvoyAiCommandCatalog({
      now: new Date("2026-08-12T00:00:00.000Z"),
    });
    expect(catalog.agentId).toBe("envoyai");
    expect(catalog.catalogVersion).toBe(ENVOY_AI_COMMAND_CATALOG_VERSION);
    expect(catalog.catalogVersion).toBe("3");
    expect(catalog.commands.find((c) => c.slash === "/help")?.intercept).toBe("envoy");
    expect(catalog.commands.find((c) => c.slash === "/clear")?.intercept).toBe("envoy");
    expect(catalog.commands.find((c) => c.slash === "/report")?.intercept).toBe("envoy");
    expect(catalog.commands.find((c) => c.slash === "/image")?.intercept).toBe("envoy");
    expect(catalog.commands.find((c) => c.slash === "/quota")?.intercept).toBe("envoy");
    expect(catalog.limitations?.some((n) => /mmx-cli/i.test(n))).toBe(true);
    expect(catalog.commands.find((c) => c.slash === "/bonds")?.intercept).toBe("hybrid");
    expect(catalog.commands.find((c) => c.slash === "/knowledge")?.intercept).toBe("hybrid");
    expect(catalog.commands.find((c) => c.slash === "/about")?.intercept).toBe("hybrid");
    expect(catalog.commands.find((c) => c.slash === "/terminal")?.intercept).toBe("hybrid");
    expect(catalog.commands.find((c) => c.slash === "/team")?.intercept).toBe("hybrid");
    expect(catalog.commands.find((c) => c.slash === "/family")?.intercept).toBe("hybrid");
    expect(catalog.commands.find((c) => c.slash === "/extagent")?.intercept).toBe("hybrid");
    expect(catalog.commands.find((c) => c.slash === "/envoyai")?.intercept).toBe("hybrid");
    expect(catalog.commands.find((c) => c.slash === "/pi")?.intercept).toBe("hybrid");
    expect(catalog.commands.find((c) => c.slash === "/content")?.intercept).toBe("hybrid");
    expect(catalog.fetchedAt).toBe("2026-08-12T00:00:00.000Z");
  });

  it("expands hybrid slash verbs into mesh-tool and feature prompts", () => {
    expect(expandEnvoyAiHybridSlash("/bonds")).toContain("bonded contacts");
    expect(expandEnvoyAiHybridSlash("/discover crypto")).toContain("crypto");
    expect(expandEnvoyAiHybridSlash("/knowledge parking")).toContain("parking");
    expect(expandEnvoyAiHybridSlash("/knowledge")).toBeNull();
    expect(expandEnvoyAiHybridSlash("/help")).toBeNull();
    expect(expandEnvoyAiHybridSlash("/about")).toContain("EnvoyMesh");
    expect(expandEnvoyAiHybridSlash("/terminal")).toContain("Terminals");
    expect(expandEnvoyAiHybridSlash("/team")).toContain("Office LAN");
    expect(expandEnvoyAiHybridSlash("/team")).toContain("Manage workers");
    expect(expandEnvoyAiHybridSlash("/team")).toContain("fleet token");
    expect(expandEnvoyAiHybridSlash("/family")).toContain("Family Network");
    expect(expandEnvoyAiHybridSlash("/extagent")).toContain("Ext Agent");
    expect(expandEnvoyAiHybridSlash("/envoyai")).toContain("OpenClaw");
    expect(expandEnvoyAiHybridSlash("/pi")).toContain("coding agent");
    expect(expandEnvoyAiHybridSlash("/content")).toContain("Feed");
  });

  it("formats help text", () => {
    const text = formatEnvoyAiCommandHelp(buildEnvoyAiCommandCatalog());
    expect(text).toContain("EnvoyAI slash commands:");
    expect(text).toContain("/report");
    expect(text).toContain("/about");
    expect(text).toContain("/terminal");
    expect(text).toContain("Notes:");
  });
});
