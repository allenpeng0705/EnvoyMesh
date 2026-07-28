/**
 * Phase 49D — tests for pi-tool-bridge.ts.
 *
 * Verifies:
 *   - PiExtensionUiRequest → PiToolProposal mapping (incl. malformed input).
 *   - Audit-summary redaction when title/message contains secrets.
 *   - auditPiTool no-ops gracefully when taskStore is absent.
 */
import { describe, it, expect, vi } from "vitest"
import {
  piRequestToProposal,
  redactPiRequestForAudit,
  auditPiTool,
} from "../src/pi-tool-bridge.js"
import type { PiExtensionUiRequest } from "@envoymesh/api"

describe("piRequestToProposal", () => {
  it("maps a well-formed request to a proposal", () => {
    const req: PiExtensionUiRequest = {
      type: "extension_ui_request",
      id: "req-1",
      method: "confirm",
      title: "Run bash command?",
      message: "rm -rf node_modules",
      timeout: 5000,
    }
    const p = piRequestToProposal(req)!
    expect(p.uiRequestId).toBe("req-1")
    expect(p.title).toBe("Run bash command?")
    expect(p.message).toBe("rm -rf node_modules")
    expect(p.timeoutMs).toBe(5000)
    expect(p.receivedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/) // ISO
  })

  it("returns null when id is missing", () => {
    const p = piRequestToProposal({
      type: "extension_ui_request",
      id: "",
      method: "confirm",
      title: "x",
      message: "y",
      timeout: 1000,
    })
    expect(p).toBeNull()
  })

  it("returns null when title is missing", () => {
    const p = piRequestToProposal({
      type: "extension_ui_request",
      id: "req-2",
      method: "confirm",
      title: "",
      message: "y",
      timeout: 1000,
    })
    expect(p).toBeNull()
  })

  it("applies a 30s default timeout when request omits it", () => {
    const p = piRequestToProposal({
      type: "extension_ui_request",
      id: "req-3",
      method: "confirm",
      title: "x",
      message: "y",
      timeout: undefined as unknown as number,
    })!
    expect(p.timeoutMs).toBe(30_000)
  })
})

describe("redactPiRequestForAudit", () => {
  it("returns the combined title+message when no secrets are present", () => {
    const result = redactPiRequestForAudit("Run command?", "ls -la")
    expect(result).toBe("Run command?: ls -la")
  })

  it("redacts when a PEM private key is in the message", () => {
    const pem = "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADAN\n-----END PRIVATE KEY-----"
    const result = redactPiRequestForAudit("Save file", pem)
    // Should fall back to a generic redaction summary.
    expect(result).toContain("[redacted")
    expect(result).not.toContain("MIIEvQIBADAN")
  })

  it("redacts when an AWS access key + secret pair is in the message", () => {
    // The scanner requires the AKIA...:secret format (key:secret pair).
    const result = redactPiRequestForAudit("Run", "AWS_SECRET=AKIAIOSFODNN7EXAMPLE:wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY")
    expect(result).toContain("[redacted")
    expect(result).not.toContain("wJalrXUtnFEMI")
  })

  it("truncates very long CLEAN prompts to bound the log line", () => {
    const long = "x".repeat(2000)
    const result = redactPiRequestForAudit("title", long)
    expect(result.length).toBeLessThan(2000)
    expect(result).toContain("[truncated]")
  })

  it("regression: detects a secret positioned AFTER the old 500-char truncation point", () => {
    // Slice 49D review Issue #1: the old code sliced to 500 chars BEFORE
    // scanning, which could split a secret in half and miss it. Construct
    // a prompt where the PEM key starts near char 600 — old code missed
    // it, new code must catch it.
    const padding = "x".repeat(600)
    const pem = "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADAN\n-----END PRIVATE KEY-----"
    const result = redactPiRequestForAudit("title", `${padding}${pem}`)
    expect(result).toContain("[redacted")
    expect(result).not.toContain("MIIEvQIBADAN")
  })

  it("preserves the title (likely clean) when only the message has the secret", () => {
    const result = redactPiRequestForAudit("Run bash command?", "key=-----BEGIN PRIVATE KEY-----\nABC\n-----END PRIVATE KEY-----")
    expect(result).toContain("Run bash command?")
    expect(result).toContain("[redacted")
  })
})

describe("auditPiTool", () => {
  it("is a no-op when taskStore is undefined", async () => {
    // Should not throw — the helper must tolerate a missing store (tests).
    await expect(
      auditPiTool(undefined, "pi.tool.proposed", {
        uiRequestId: "r",
        title: "t",
        message: "m",
      }),
    ).resolves.toBeUndefined()
  })

  it("calls appendAuditEvent when taskStore is present", async () => {
    const appendAuditEvent = vi.fn().mockResolvedValue(undefined)
    await auditPiTool({ appendAuditEvent } as unknown as Parameters<typeof auditPiTool>[0], "pi.tool.executed", {
      uiRequestId: "r1",
      title: "Run bash",
      message: "ls",
    })
    expect(appendAuditEvent).toHaveBeenCalledTimes(1)
    const evt = appendAuditEvent.mock.calls[0][0]
    expect(evt.type).toBe("pi.tool.executed")
    expect(evt.outcome).toBe("allow")
    expect(evt.summary).toContain("Run bash")
  })

  it("records outcome=deny for pi.tool.denied", async () => {
    const appendAuditEvent = vi.fn().mockResolvedValue(undefined)
    await auditPiTool({ appendAuditEvent } as unknown as Parameters<typeof auditPiTool>[0], "pi.tool.denied", {
      uiRequestId: "r2",
      title: "Run bash",
      message: "rm -rf /",
    })
    expect(appendAuditEvent.mock.calls[0][0].outcome).toBe("deny")
  })

  it("swallows taskStore errors (never rejects)", async () => {
    const appendAuditEvent = vi.fn().mockRejectedValue(new Error("disk full"))
    await expect(
      auditPiTool({ appendAuditEvent } as unknown as Parameters<typeof auditPiTool>[0], "pi.tool.proposed", {
        uiRequestId: "r3",
        title: "t",
        message: "m",
      }),
    ).resolves.toBeUndefined()
  })
})
