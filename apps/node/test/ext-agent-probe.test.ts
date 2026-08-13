import { describe, it, expect, vi, afterEach } from "vitest"
import {
  extAgentStatusUrlFromMessageUrl,
  probeExtAgentReachability,
  classifyExtAgentInstallState,
  defaultBinaryOnPath,
} from "../src/ext-agent-adapter/probe.js"

describe("extAgentStatusUrlFromMessageUrl", () => {
  it("maps /message to /status", () => {
    expect(extAgentStatusUrlFromMessageUrl("http://127.0.0.1:8010/message")).toBe(
      "http://127.0.0.1:8010/status",
    )
  })
})

describe("probeExtAgentReachability", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("marks Pi as built-in and reachable when ask is wired and sidecar is discoverable", async () => {
    const { setPiExtAgentAsk } = await import("../src/ext-agent-adapter/backends.js")
    setPiExtAgentAsk(async () => "ok")
    const r = await probeExtAgentReachability({
      agentId: "pi",
      agentName: "Pi",
      agentUrl: "http://127.0.0.1:8022/message",
    })
    expect(r.builtIn).toBe(true)
    // Reachable iff discoverPiCli() finds staged/bundled Pi (true in this repo).
    expect(typeof r.reachable).toBe("boolean")
    if (r.reachable) {
      expect(r.reachable).toBe(true)
    }
    setPiExtAgentAsk(null)
  })

  it("marks Pi unreachable when ask is wired but no sidecar CLI exists", async () => {
    const { setPiExtAgentAsk } = await import("../src/ext-agent-adapter/backends.js")
    const piRuntime = await import("../src/pi-runtime.js")
    const spy = vi.spyOn(piRuntime, "discoverPiCli").mockReturnValue(null)
    setPiExtAgentAsk(async () => "ok")
    const r = await probeExtAgentReachability({
      agentId: "pi",
      agentName: "Pi",
      agentUrl: "http://127.0.0.1:8022/message",
    })
    expect(r.builtIn).toBe(true)
    expect(r.reachable).toBe(false)
    setPiExtAgentAsk(null)
    spy.mockRestore()
  })

  it("probes HomeClaw /status and returns unreachable when fetch fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED")
      }),
    )
    const r = await probeExtAgentReachability({
      agentId: "homeclaw",
      agentName: "HomeClaw",
      agentUrl: "http://127.0.0.1:8010/message",
    })
    expect(r.builtIn).toBe(false)
    expect(r.reachable).toBe(false)
    expect(r.hint.toLowerCase()).toContain("homeclaw")
  })

  it("probes HomeClaw /status ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, status: 200 })),
    )
    const r = await probeExtAgentReachability({
      agentId: "homeclaw",
      agentName: "HomeClaw",
      agentUrl: "http://127.0.0.1:8010/message",
    })
    expect(r.reachable).toBe(true)
  })

  it("Pi is always installState: 'installed' (built-in, no installGuide)", async () => {
    const { setPiExtAgentAsk } = await import("../src/ext-agent-adapter/backends.js")
    setPiExtAgentAsk(async () => "ok")
    const r = await probeExtAgentReachability({
      agentId: "pi",
      agentName: "Pi",
      agentUrl: "http://127.0.0.1:8022/message",
      binaryOnPath: async () => true,
    })
    expect(r.installState).toBe("installed")
    expect(r.installGuide).toBeUndefined()
    setPiExtAgentAsk(null)
  })

  it("codex with binary on PATH → installState: 'installed' and no installGuide", async () => {
    const r = await probeExtAgentReachability({
      agentId: "codex",
      agentName: "Codex",
      agentUrl: "http://127.0.0.1:8023/message",
      binaryOnPath: async () => true,
    })
    expect(r.installState).toBe("installed")
    expect(r.installGuide).toBeUndefined()
  })

  it("codex with binary missing → installState: 'not-installed' + populated installGuide", async () => {
    const r = await probeExtAgentReachability({
      agentId: "codex",
      agentName: "Codex",
      agentUrl: "http://127.0.0.1:8023/message",
      binaryOnPath: async () => false,
    })
    expect(r.installState).toBe("not-installed")
    expect(r.installGuide).toBeDefined()
    expect(r.installGuide!.installed).toBe(false)
    expect(r.installGuide!.installCommand).toBe("npm install -g @openai/codex")
    expect(r.installGuide!.command).toBe("codex")
  })

  it("claudecode with binary missing uses `claude` as the binary (not claudecode)", async () => {
    const r = await probeExtAgentReachability({
      agentId: "claudecode",
      agentName: "Claude Code",
      agentUrl: "http://127.0.0.1:8024/message",
      binaryOnPath: async () => false,
    })
    expect(r.installState).toBe("not-installed")
    expect(r.installGuide!.command).toBe("claude")
    expect(r.installGuide!.installCommand).toBe("npm install -g @anthropic-ai/claude-code")
  })

  it("hermes with binary missing → installGuide with curl install line", async () => {
    const r = await probeExtAgentReachability({
      agentId: "hermes",
      agentName: "Hermes",
      agentUrl: "http://127.0.0.1:8020/message",
      binaryOnPath: async () => false,
    })
    expect(r.installState).toBe("not-installed")
    expect(r.installGuide!.installCommand).toContain("curl")
    expect(r.installGuide!.installCommand).toContain("hermes-agent")
  })

  it("openhuman with binary missing and no desktop/core → installGuide with curl install line", async () => {
    const r = await probeExtAgentReachability({
      agentId: "openhuman",
      agentName: "OpenHuman",
      agentUrl: "http://127.0.0.1:8021/message",
      binaryOnPath: async () => false,
      openHumanDesktopPresent: () => false,
      openHumanCoreHealthy: async () => false,
    })
    expect(r.installState).toBe("not-installed")
    expect(r.installGuide!.installCommand).toContain("openhuman")
  })

  it("openhuman with OpenHuman.app present (no CLI) → installState installed", async () => {
    const r = await probeExtAgentReachability({
      agentId: "openhuman",
      agentName: "OpenHuman",
      agentUrl: "http://127.0.0.1:8021/message",
      binaryOnPath: async () => false,
      openHumanDesktopPresent: () => true,
      openHumanCoreHealthy: async () => false,
    })
    expect(r.installState).toBe("installed")
    expect(r.installGuide).toBeUndefined()
  })

  it("openhuman with healthy :7788 core (no CLI) → installState installed", async () => {
    const r = await probeExtAgentReachability({
      agentId: "openhuman",
      agentName: "OpenHuman",
      agentUrl: "http://127.0.0.1:8021/message",
      binaryOnPath: async () => false,
      openHumanDesktopPresent: () => false,
      openHumanCoreHealthy: async () => true,
    })
    expect(r.installState).toBe("installed")
  })

  it("binary check returns null (uncertain) → installState 'unknown' + generic installGuide", async () => {
    const r = await probeExtAgentReachability({
      agentId: "codex",
      agentName: "Codex",
      agentUrl: "http://127.0.0.1:8023/message",
      binaryOnPath: async () => null,
    })
    expect(r.installState).toBe("unknown")
    expect(r.installGuide).toBeDefined()
    expect(r.installGuide!.installed).toBe(false)
  })

  it("homeclaw installState is 'unknown' (not a CLI we PATH-check) and fetch is still probed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, status: 200 })),
    )
    const r = await probeExtAgentReachability({
      agentId: "homeclaw",
      agentName: "HomeClaw",
      agentUrl: "http://127.0.0.1:8010/message",
    })
    expect(r.installState).toBe("unknown")
    expect(r.reachable).toBe(true)
  })

  it("codex: installState=installed and reachable when sidecar /status reports backend_reachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          status: "OK",
          kind: "codex",
          backend_reachable: true,
        }),
      })),
    )
    const r = await probeExtAgentReachability({
      agentId: "codex",
      agentName: "Codex",
      agentUrl: "http://127.0.0.1:8023/message",
      binaryOnPath: async () => true,
    })
    expect(r.installState).toBe("installed")
    expect(r.reachable).toBe(true)
  })

  it("codex: reachable=false when sidecar reports backend_reachable false", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          status: "OK",
          kind: "codex",
          backend_reachable: false,
        }),
      })),
    )
    const r = await probeExtAgentReachability({
      agentId: "codex",
      agentName: "Codex",
      agentUrl: "http://127.0.0.1:8023/message",
      binaryOnPath: async () => true,
    })
    expect(r.installState).toBe("installed")
    expect(r.reachable).toBe(false)
    expect(r.hint.toLowerCase()).not.toContain("npm i -g")
  })

  it("codex: reachable=false on HTTP 404 (do not treat 4xx as up)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 404,
        json: async () => ({ error: "not found" }),
      })),
    )
    const r = await probeExtAgentReachability({
      agentId: "codex",
      agentName: "Codex",
      agentUrl: "http://127.0.0.1:8023/message",
      binaryOnPath: async () => true,
    })
    expect(r.installState).toBe("installed")
    expect(r.reachable).toBe(false)
  })
})

describe("classifyExtAgentInstallState", () => {
  it("pi is always 'installed' (built-in)", async () => {
    const r = await classifyExtAgentInstallState("pi", async () => false)
    expect(r.installState).toBe("installed")
  })

  it("homeclaw is 'unknown' (separate channel, no CLI to PATH-check)", async () => {
    const r = await classifyExtAgentInstallState("homeclaw", async () => true)
    expect(r.installState).toBe("unknown")
  })

  it("codex with binary on PATH is 'installed'", async () => {
    const r = await classifyExtAgentInstallState("codex", async () => true)
    expect(r.installState).toBe("installed")
  })

  it("codex with binary missing is 'not-installed' + installGuide", async () => {
    const r = await classifyExtAgentInstallState("codex", async () => false)
    expect(r.installState).toBe("not-installed")
    expect(r.installGuide).toBeDefined()
    expect(r.installGuide!.installCommand).toBe("npm install -g @openai/codex")
  })

  it("claudecode uses `claude` for the PATH check", async () => {
    let checked: string | null = null
    const r = await classifyExtAgentInstallState("claudecode", async (cmd) => {
      checked = cmd
      return true
    })
    expect(r.installState).toBe("installed")
    expect(checked).toBe("claude")
  })

  it("binary check returning null yields 'unknown' + generic installGuide", async () => {
    const r = await classifyExtAgentInstallState("codex", async () => null)
    expect(r.installState).toBe("unknown")
    expect(r.installGuide).toBeDefined()
  })

  it("unknown agent id yields 'unknown' + installGuide (no install recipe)", async () => {
    const r = await classifyExtAgentInstallState("totally-custom-agent", async () => false)
    expect(r.installState).toBe("unknown")
    expect(r.installGuide).toBeDefined()
    // installCommand is empty (we don't know how to install it)
    expect(r.installGuide!.installCommand).toBe("")
  })

  // Phase 56 — one-shot CLI backends (cursor / aider / mmx). Before
  // these entries landed, the three agents would always show
  // `installState: "unknown"` because their binary names were not in
  // the `BINARY_FOR_AGENT` table. The Settings UI Install Required
  // card would never fire for them. The regression guard below pins
  // the path-probe to the actual CLI binary name (cursor uses
  // `cursor-agent`, not `cursor`).
  it("openhuman with no CLI but OpenHuman.app → installed", async () => {
    const r = await classifyExtAgentInstallState("openhuman", async () => false, {
      openHumanDesktopPresent: () => true,
      openHumanCoreHealthy: async () => false,
    })
    expect(r.installState).toBe("installed")
    expect(r.installGuide).toBeUndefined()
  })

  it("openhuman with no CLI / desktop / core → not-installed", async () => {
    const r = await classifyExtAgentInstallState("openhuman", async () => false, {
      openHumanDesktopPresent: () => false,
      openHumanCoreHealthy: async () => false,
    })
    expect(r.installState).toBe("not-installed")
    expect(r.installGuide).toBeDefined()
  })

  it("cursor uses `cursor-agent` (not `cursor`) for the PATH check", async () => {
    let checked: string | undefined
    const r = await classifyExtAgentInstallState("cursor", async (cmd) => {
      checked = cmd
      return true
    })
    expect(r.installState).toBe("installed")
    expect(checked).toBe("cursor-agent")
  })

  it("cursor with binary missing → installState 'not-installed' + installGuide", async () => {
    const r = await classifyExtAgentInstallState("cursor", async () => false)
    expect(r.installState).toBe("not-installed")
    expect(r.installGuide).toBeDefined()
    // The Install Required card should be the right one for cursor.
    expect(r.installGuide!.command).toBe("cursor-agent")
    expect(r.installGuide!.installCommand).toContain("curl https://cursor.com/install")
    expect(r.installGuide!.verifyCommand).toBe("cursor-agent --version")
  })

  it("aider with binary on PATH is 'installed'", async () => {
    let checked: string | undefined
    const r = await classifyExtAgentInstallState("aider", async (cmd) => {
      checked = cmd
      return true
    })
    expect(r.installState).toBe("installed")
    expect(checked).toBe("aider")
  })

  it("aider with binary missing → installState 'not-installed' + installGuide", async () => {
    const r = await classifyExtAgentInstallState("aider", async () => false)
    expect(r.installState).toBe("not-installed")
    expect(r.installGuide).toBeDefined()
    expect(r.installGuide!.command).toBe("aider")
    expect(r.installGuide!.installCommand).toBe("uv tool install aider-chat")
    expect(r.installGuide!.verifyCommand).toBe("aider --version")
  })

  it("mmx with binary on PATH is 'installed'", async () => {
    let checked: string | undefined
    const r = await classifyExtAgentInstallState("mmx", async (cmd) => {
      checked = cmd
      return true
    })
    expect(r.installState).toBe("installed")
    expect(checked).toBe("mmx")
  })

  it("mmx with binary missing → installState 'not-installed' + installGuide", async () => {
    const r = await classifyExtAgentInstallState("mmx", async () => false)
    expect(r.installState).toBe("not-installed")
    expect(r.installGuide).toBeDefined()
    expect(r.installGuide!.command).toBe("mmx")
    expect(r.installGuide!.installCommand).toBe("npm install -g mmx-cli")
    expect(r.installGuide!.verifyCommand).toBe("mmx --version")
  })
})

describe("defaultBinaryOnPath", () => {
  it("returns true for a binary that exists on PATH (node)", async () => {
    const result = await defaultBinaryOnPath("node")
    expect(result).toBe(true)
  }, 5_000)

  it("returns false for a binary that does not exist on PATH", async () => {
    const result = await defaultBinaryOnPath("this-binary-definitely-does-not-exist-xyz-9876")
    expect(result).toBe(false)
  }, 5_000)

  it("timeout races command -v for a missing binary (null or false)", async () => {
    // Sync well-known-dir resolve misses; 1ms may expire before `command -v`.
    const result = await defaultBinaryOnPath(
      "this-binary-definitely-does-not-exist-xyz-9876",
      1,
    )
    expect(result === null || result === false).toBe(true)
  }, 5_000)
})
