import { afterEach, describe, expect, it } from "vitest"

import {
  currentEhTimelineRevision,
  nextEhTimelineRevision,
  resetEhTimelineRevision,
} from "../src/eh-timeline-revision.js"

afterEach(() => {
  resetEhTimelineRevision()
})

describe("eh-timeline-revision", () => {
  it("starts at 0 and increments per chat", () => {
    expect(currentEhTimelineRevision("a")).toBe(0)
    expect(nextEhTimelineRevision("a")).toBe(1)
    expect(nextEhTimelineRevision("a")).toBe(2)
    expect(currentEhTimelineRevision("a")).toBe(2)
  })

  it("keeps independent counters per chatId", () => {
    expect(nextEhTimelineRevision("a")).toBe(1)
    expect(nextEhTimelineRevision("b")).toBe(1)
    expect(nextEhTimelineRevision("a")).toBe(2)
    expect(currentEhTimelineRevision("b")).toBe(1)
  })

  it("resetEhTimelineRevision clears one or all", () => {
    nextEhTimelineRevision("a")
    nextEhTimelineRevision("b")
    resetEhTimelineRevision("a")
    expect(currentEhTimelineRevision("a")).toBe(0)
    expect(currentEhTimelineRevision("b")).toBe(1)
    resetEhTimelineRevision()
    expect(currentEhTimelineRevision("b")).toBe(0)
  })
})
