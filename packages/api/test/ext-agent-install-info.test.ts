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
})
