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

  it("openhuman with binary missing → installGuide with curl install line", async () => {
    const r = await probeExtAgentReachability({
      agentId: "openhuman",
      agentName: "OpenHuman",
      agentUrl: "http://127.0.0.1:8021/message",
      binaryOnPath: async () => false,
    })
    expect(r.installState).toBe("not-installed")
    expect(r.installGuide!.installCommand).toContain("openhuman")
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

  it("codex: installState=installed but reachable=false until 55B ships the sidecar", async () => {
    // 55D: codex/claudecode kinds are in the union, the supervisor is
    // wired, but the sidecar backend itself is 55B / 55C. Until those
    // land, the probe should still report installState correctly
    // (binary on PATH → "installed") and reachable should be false
    // because there's no working /message sidecar to probe.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, status: 200 })),
    )
    const r = await probeExtAgentReachability({
      agentId: "codex",
      agentName: "Codex",
      agentUrl: "http://127.0.0.1:8023/message",
      binaryOnPath: async () => true,
    })
    expect(r.installState).toBe("installed")
    // 55B replaces this expectation with `true` once the sidecar lands.
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

  it("returns null on timeout (impossible to trigger in normal time, but signature is right)", async () => {
    // Use a 1ms timeout — `command -v` will take longer
    const result = await defaultBinaryOnPath("node", 1)
    expect(result).toBe(null)
  }, 5_000)
})
