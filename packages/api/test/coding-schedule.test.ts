import { describe, expect, it } from "vitest"
import {
  CODING_CRON_PRESETS,
  MAX_CODING_SCHEDULES,
  isCodingScheduleHarness,
  isValidCodingScheduleCron,
} from "../src/coding-schedule.js"

describe("coding-schedule (Phase 68-C7)", () => {
  it("exposes cap and shared cron presets", () => {
    expect(MAX_CODING_SCHEDULES).toBe(20)
    expect(CODING_CRON_PRESETS["5m"]).toBe("*/5 * * * *")
    expect(CODING_CRON_PRESETS["15m"]).toBe("*/15 * * * *")
    expect(CODING_CRON_PRESETS["1h"]).toBe("0 * * * *")
    expect(CODING_CRON_PRESETS.daily).toBe("0 9 * * *")
  })

  it("validates harness ids", () => {
    expect(isCodingScheduleHarness("envoy-harness")).toBe(true)
    expect(isCodingScheduleHarness("pi")).toBe(true)
    expect(isCodingScheduleHarness("codex")).toBe(true)
    expect(isCodingScheduleHarness("opencode")).toBe(true)
    expect(isCodingScheduleHarness("cursor")).toBe(true)
    expect(isCodingScheduleHarness("codewhale")).toBe(true)
    expect(isCodingScheduleHarness("claudecode")).toBe(true)
    expect(isCodingScheduleHarness("nope")).toBe(false)
  })

  it("validates 5-field cron including */N", () => {
    expect(isValidCodingScheduleCron("* * * * *")).toBe(true)
    expect(isValidCodingScheduleCron("*/5 * * * *")).toBe(true)
    expect(isValidCodingScheduleCron("0 9 * * 1")).toBe(true)
    expect(isValidCodingScheduleCron("invalid")).toBe(false)
    expect(isValidCodingScheduleCron("1 2 3 4")).toBe(false)
  })
})
