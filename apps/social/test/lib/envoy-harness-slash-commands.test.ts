import { describe, expect, it } from "vitest"
import {
  ENVOY_HARNESS_SLASH_COMMANDS,
  envoyHarnessSlashName,
  filterEnvoyHarnessSlashCommands,
  formatEnvoyHarnessSlashHelp,
  isEnvoyHarnessLocalSlashCommand,
  parseEnvoyHarnessCdCommand,
} from "../../src/lib/envoy-harness-slash-commands.js"

describe("envoy-harness-slash-commands", () => {
  it("ships a coding-agent-sized catalog", () => {
    expect(ENVOY_HARNESS_SLASH_COMMANDS.length).toBeGreaterThan(20)
    expect(ENVOY_HARNESS_SLASH_COMMANDS.some((c) => c.slash === "/review")).toBe(true)
    expect(ENVOY_HARNESS_SLASH_COMMANDS.some((c) => c.slash === "/compact")).toBe(true)
  })

  it("filters commands by prefix", () => {
    const matches = filterEnvoyHarnessSlashCommands(ENVOY_HARNESS_SLASH_COMMANDS, "/re")
    expect(matches.map((c) => c.slash)).toEqual(
      expect.arrayContaining(["/review", "/reset", "/refactor", "/rename", "/resume"]),
    )
  })

  it("marks panel-local commands", () => {
    expect(isEnvoyHarnessLocalSlashCommand("/help")).toBe(true)
    expect(isEnvoyHarnessLocalSlashCommand("/cd /tmp")).toBe(true)
    expect(isEnvoyHarnessLocalSlashCommand("/review")).toBe(false)
    expect(isEnvoyHarnessLocalSlashCommand("/cluster")).toBe(true)
    expect(isEnvoyHarnessLocalSlashCommand("/team")).toBe(true)
    expect(isEnvoyHarnessLocalSlashCommand("/trace")).toBe(true)
    expect(isEnvoyHarnessLocalSlashCommand("/search auth")).toBe(true)
    expect(isEnvoyHarnessLocalSlashCommand("/permissions safe-only")).toBe(true)
  })

  it("covers the mesh-native + Claude/Codex command surface", () => {
    const names = new Set(ENVOY_HARNESS_SLASH_COMMANDS.map((c) => c.slash))
    for (const cmd of [
      "/help",
      "/clear",
      "/cancel",
      "/status",
      "/peers",
      "/cluster",
      "/team",
      "/trace",
      "/search",
      "/model",
      "/cd",
      "/review",
      "/compact",
      "/context",
      "/diff",
      "/init",
      "/plan",
      "/memory",
      "/doctor",
      "/redo",
      "/rewind",
      "/config",
      "/usage",
      "/permissions",
    ]) {
      expect(names.has(cmd)).toBe(true)
    }
  })

  it("parses cd commands", () => {
    expect(parseEnvoyHarnessCdCommand("/cd")).toEqual({ type: "show" })
    expect(parseEnvoyHarnessCdCommand("/project /tmp/app")).toEqual({
      type: "set",
      path: "/tmp/app",
    })
  })

  it("formats help with project + model context", () => {
    const help = formatEnvoyHarnessSlashHelp({
      model: "deepseek:chat",
      cwd: "/projects/app",
    })
    expect(help).toContain("envoy-harness slash commands:")
    expect(help).toContain("/review")
    expect(help).toContain("Project folder: /projects/app")
  })

  it("extracts slash names", () => {
    expect(envoyHarnessSlashName("/status")).toBe("status")
    expect(envoyHarnessSlashName("hello")).toBeUndefined()
  })
})
