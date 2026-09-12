import { describe, expect, it } from "vitest"
import {
  CODING_HEARTBEAT_CRON_PRESETS,
  MAX_CODING_HEARTBEATS,
  isCodingHeartbeatTarget,
  isValidCodingHeartbeatCron,
} from "../src/coding-heartbeat.js"

describe("coding-heartbeat (Phase 68-C6)", () => {
  it("exposes cap and cron presets", () => {
    expect(MAX_CODING_HEARTBEATS).toBe(20)
    expect(CODING_HEARTBEAT_CRON_PRESETS["5m"]).toBe("*/5 * * * *")
    expect(CODING_HEARTBEAT_CRON_PRESETS["15m"]).toBe("*/15 * * * *")
    expect(CODING_HEARTBEAT_CRON_PRESETS["1h"]).toBe("0 * * * *")
    expect(CODING_HEARTBEAT_CRON_PRESETS.daily).toBe("0 9 * * *")
  })

  it("validates targets", () => {
    expect(isCodingHeartbeatTarget({ kind: "eh", chatId: "c1" })).toBe(true)
    expect(isCodingHeartbeatTarget({ kind: "pi", sessionId: "s1" })).toBe(true)
    expect(
      isCodingHeartbeatTarget({
        kind: "ext",
        sessionId: "s1",
        agentId: "codex",
      }),
    ).toBe(true)
    expect(isCodingHeartbeatTarget({ kind: "eh", chatId: "  " })).toBe(false)
    expect(isCodingHeartbeatTarget({ kind: "ext", sessionId: "s1" })).toBe(
      false,
    )
  })

  it("validates 5-field cron including */N", () => {
    expect(isValidCodingHeartbeatCron("* * * * *")).toBe(true)
    expect(isValidCodingHeartbeatCron("*/5 * * * *")).toBe(true)
    expect(isValidCodingHeartbeatCron("0 9 * * 1")).toBe(true)
    expect(isValidCodingHeartbeatCron("invalid")).toBe(false)
    expect(isValidCodingHeartbeatCron("1 2 3 4")).toBe(false)
    expect(isValidCodingHeartbeatCron("*/0 * * * *")).toBe(false)
  })
})
