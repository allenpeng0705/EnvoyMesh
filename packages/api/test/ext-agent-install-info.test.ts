import { describe, it, expect } from "vitest"
import { getExtAgentInstallInfo } from "../src/ext-agent.js"

describe("getExtAgentInstallInfo", () => {
  it("marks Pi as built-in with GitHub link", () => {
    const info = getExtAgentInstallInfo("pi")
    expect(info.builtIn).toBe(true)
    expect(info.homepageUrl).toContain("github.com/earendil-works/pi")
    expect(info.startHint.toLowerCase()).toContain("built")
  })

  it("returns HomeClaw website", () => {
    const info = getExtAgentInstallInfo("homeclaw")
    expect(info.builtIn).toBe(false)
    expect(info.homepageUrl).toBe("https://www.homeclaw.cn/")
  })

  it("returns Hermes docs", () => {
    const info = getExtAgentInstallInfo("hermes")
    expect(info.homepageUrl).toContain("hermes-agent.nousresearch.com")
  })

  it("returns OpenHuman website", () => {
    const info = getExtAgentInstallInfo("openhuman")
    expect(info.homepageUrl).toBe("https://tinyhumans.ai/openhuman")
  })

  // Phase 56A / 56B / 56C — three one-shot CLI backends.
  it("returns Cursor CLI docs (Phase 56A)", () => {
    const info = getExtAgentInstallInfo("cursor")
    expect(info.builtIn).toBe(false)
    expect(info.homepageUrl).toContain("docs.cursor.com")
    expect(info.startHint).toContain("cursor.com/install")
  })

  it("returns Aider docs (Phase 56B)", () => {
    const info = getExtAgentInstallInfo("aider")
    expect(info.builtIn).toBe(false)
    expect(info.homepageUrl).toBe("https://aider.chat/docs/")
    expect(info.startHint).toContain("aider-chat")
  })

  it("returns MMX-CLI GitHub link (Phase 56C)", () => {
    const info = getExtAgentInstallInfo("mmx")
    expect(info.builtIn).toBe(false)
    expect(info.homepageUrl).toBe("https://github.com/MiniMax-AI/cli")
    expect(info.startHint).toContain("mmx-cli")
  })
})
