/**
 * Unit tests for the EM-R `rpcErrorCode` JSON-RPC error-code mapping
 * (thin-client-protocol error catalog → stable `error.code`).
 */
import { describe, expect, it } from "vitest"
import { rpcErrorCode } from "../src/rpc-error-code.js"

describe("rpcErrorCode", () => {
  it("maps askHomeModel catalog-token errors to their tokens", () => {
    expect(rpcErrorCode("cloud-approval-needed: private context exceeds cloud policy")).toBe(
      "cloud-approval-needed",
    )
    expect(
      rpcErrorCode("model-not-configured: no usable model provider on the home node"),
    ).toBe("model-not-configured")
    expect(rpcErrorCode("semantic-firewall: prompt is empty")).toBe("semantic-firewall")
    expect(rpcErrorCode("prompt-too-large: prompt exceeds max length (48000)")).toBe(
      "prompt-too-large",
    )
  })

  it("maps revokeThinClient owner-only errors to their token", () => {
    expect(rpcErrorCode("owner-only: only the node owner may revoke another device")).toBe(
      "owner-only",
    )
  })

  it("keeps the legacy ERROR code for plain non-catalog messages", () => {
    expect(rpcErrorCode("Failed to process message")).toBe("ERROR")
    expect(rpcErrorCode("deviceId is required")).toBe("ERROR")
    expect(rpcErrorCode("")).toBe("ERROR")
  })

  it("keeps the legacy ERROR code when a known token appears mid-message (not a prefix)", () => {
    expect(rpcErrorCode("route failed: owner-only: nope")).toBe("ERROR")
    expect(rpcErrorCode("prefix owner-only: nope")).toBe("ERROR")
  })

  it("keeps the legacy ERROR code for messages with no colon", () => {
    expect(rpcErrorCode("Authentication required")).toBe("ERROR")
  })

  it("keeps the legacy ERROR code for unknown leading tokens", () => {
    expect(rpcErrorCode("unknown-token: some detail")).toBe("ERROR")
  })
})

describe("rpcErrorCode — router-level owner denials", () => {
  it("maps legacy 'Only the node owner can' text to owner-only", () => {
    expect(rpcErrorCode("Only the node owner can call askHomeModel")).toBe("owner-only")
    expect(rpcErrorCode("Only the node owner can call updateNodeConfig")).toBe("owner-only")
  })

  it("keeps legacy ERROR for unrelated messages", () => {
    expect(rpcErrorCode("boom")).toBe("ERROR")
  })
})
