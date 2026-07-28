/**
 * Phase 49D — tests for per-PiRuntimeState proposal tracking.
 *
 * Slice 49D review Issue #4: inFlightProposals was originally module-level
 * (singleton), which would cross-pollinate across multiple NodeService
 * instances (common in tests). These tests verify the fix — tracking is
 * per-state, with proper timeout cleanup.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import {
  createPiRuntimeState,
  trackInFlightProposal,
  untrackInFlightProposal,
} from "../src/node-service-pi.js"
import type { PiRuntimeDeps } from "../src/node-service-pi.js"

const noOpDeps: PiRuntimeDeps = {
  loadConfig: async () => null,
  log: () => {},
  taskStore: null,
}

describe("per-state proposal tracking (Slice 49D Issue #4)", () => {
  beforeEach(() => {
    // Use fake-ish timers via short real timeouts; we only care about state.
  })

  it("createPiRuntimeState yields independent inFlightProposals maps", () => {
    const s1 = createPiRuntimeState()
    const s2 = createPiRuntimeState()
    expect(s1.inFlightProposals).not.toBe(s2.inFlightProposals)
    expect(s1.proposalTimeouts).not.toBe(s2.proposalTimeouts)
  })

  it("tracking in one state does not leak into another", () => {
    const s1 = createPiRuntimeState()
    const s2 = createPiRuntimeState()
    trackInFlightProposal(s1, noOpDeps, "req-A", "title A", "msg A", 60_000)
    expect(s1.inFlightProposals.has("req-A")).toBe(true)
    expect(s2.inFlightProposals.has("req-A")).toBe(false)
  })

  it("untrack returns the entry and clears the timeout", () => {
    const s = createPiRuntimeState()
    trackInFlightProposal(s, noOpDeps, "req-B", "title B", "msg B", 60_000)
    expect(s.proposalTimeouts.has("req-B")).toBe(true)
    const entry = untrackInFlightProposal(s, "req-B")
    expect(entry?.title).toBe("title B")
    expect(s.inFlightProposals.has("req-B")).toBe(false)
    expect(s.proposalTimeouts.has("req-B")).toBe(false)
  })

  it("untrack on an unknown id returns undefined (no throw)", () => {
    const s = createPiRuntimeState()
    expect(untrackInFlightProposal(s, "never-tracked")).toBeUndefined()
  })
})
