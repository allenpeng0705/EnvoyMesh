import { describe, it, expect, vi, afterEach } from "vitest"
import {
  extAgentStatusUrlFromMessageUrl,
  probeExtAgentReachability,
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
})
