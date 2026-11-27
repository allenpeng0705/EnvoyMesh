/**
 * Phase 69A — ENVOY_TOOL_CATALOG / owner-agent wave-1 names must resolve to ToolRegistry.
 */
import { describe, expect, it } from "vitest";
import { resolveRegistryToolName } from "@envoymesh/api";
import {
  OWNER_AGENT_WAVE1_TOOL_NAMES,
  OWNER_AGENT_TOOL_ALLOWLIST,
} from "@envoymesh/api";
import { ENVOY_TOOL_CATALOG } from "@envoymesh/openclaw-runtime";
import { ToolRegistry, executeTool } from "../src/tool-registry.js";

/** Catalog tools that are still stubs / not wave-1 executable honesty targets. */
const CATALOG_STUB_ALLOWLIST = new Set(["mesh.chat_rag_search"]);

describe("Phase 69A tool catalog parity", () => {
  const registry = new ToolRegistry(true);

  it("every ENVOY_TOOL_CATALOG name (non-stub) resolves to a registered tool", () => {
    for (const tool of ENVOY_TOOL_CATALOG) {
      if (CATALOG_STUB_ALLOWLIST.has(tool.name)) continue;
      const resolved = resolveRegistryToolName(tool.name);
      expect(registry.get(resolved), `catalog ${tool.name} → ${resolved}`).toBeDefined();
    }
  });

  it("every mesh allowlist entry (non-job) exists in ToolRegistry", () => {
    for (const tool of OWNER_AGENT_TOOL_ALLOWLIST) {
      if (tool.kind !== "mesh") continue;
      const resolved = resolveRegistryToolName(tool.name);
      expect(registry.get(resolved), `allowlist ${tool.name}`).toBeDefined();
    }
  });

  it("wave-1 mesh tools are registered", () => {
    for (const name of OWNER_AGENT_WAVE1_TOOL_NAMES) {
      if (name.startsWith("owner.")) continue;
      const resolved = resolveRegistryToolName(name);
      expect(registry.get(resolved), `wave-1 ${name}`).toBeDefined();
    }
  });

  it("every wave-1 mesh tool is listed in ENVOY_TOOL_CATALOG (prompt honesty)", () => {
    const catalogNames = new Set(ENVOY_TOOL_CATALOG.map((t) => t.name));
    for (const name of OWNER_AGENT_WAVE1_TOOL_NAMES) {
      if (name.startsWith("owner.")) continue;
      // Allow aliases: catalog may use mesh.send_hello while wave-1 uses bond.send_hello
      const resolved = resolveRegistryToolName(name);
      const inCatalog =
        catalogNames.has(name) ||
        [...catalogNames].some((c) => resolveRegistryToolName(c) === resolved);
      expect(inCatalog, `wave-1 ${name} missing from OpenClaw catalog`).toBe(true);
    }
  });

  it("wave-1 report/discover tools execute when hooks are present", async () => {
    const ctx = {
      trustStore: {} as never,
      peerDirectoryStore: {} as never,
      taskStore: { appendAuditEvent: async () => {} } as never,
      agentIdentity: {} as never,
      ownerIdentity: { ownerId: "envoy:owner:parity" },
      agentCredential: {} as never,
      generateIntelligenceReport: async () => "report-ok",
      discoverAndCluster: async () => "cluster-ok",
    };
    const report = await executeTool("mesh.intelligence_report", {}, ctx);
    expect(report.ok).toBe(true);
    const cluster = await executeTool("mesh.discover_cluster", { seedTopics: ["rust"] }, ctx);
    expect(cluster.ok).toBe(true);
  });
});
