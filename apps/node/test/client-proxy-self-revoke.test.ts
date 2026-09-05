/**
 * Unit tests for the EM-R relayed thin-client self-revoke detection helper
 * (FIX-2) — decides when a `revokeThinClient` result on the client-proxy
 * stream revoked the caller itself, so the proxy drops the stream right after
 * writing the JSON-RPC response.
 */
import { describe, expect, it } from "vitest"
import { isSelfRevokeResult } from "../src/client-proxy-handler.js"

describe("isSelfRevokeResult", () => {
  it("is true when the caller's deviceId is in revokedDeviceIds", () => {
    expect(
      isSelfRevokeResult({ ok: true, revokedDeviceIds: ["dev-a", "dev-b"] }, "dev-b"),
    ).toBe(true)
  })

  it("is false when the caller revoked only other devices", () => {
    expect(isSelfRevokeResult({ ok: true, revokedDeviceIds: ["dev-a"] }, "dev-b")).toBe(false)
  })

  it("is false for an empty revocation list", () => {
    expect(isSelfRevokeResult({ ok: true, revokedDeviceIds: [] }, "dev-a")).toBe(false)
  })

  it("is false for non-object / malformed results", () => {
    expect(isSelfRevokeResult(undefined, "dev-a")).toBe(false)
    expect(isSelfRevokeResult(null, "dev-a")).toBe(false)
    expect(isSelfRevokeResult("ok", "dev-a")).toBe(false)
    expect(isSelfRevokeResult({ ok: true }, "dev-a")).toBe(false)
    expect(isSelfRevokeResult({ ok: true, revokedDeviceIds: "dev-a" }, "dev-a")).toBe(false)
  })
})
