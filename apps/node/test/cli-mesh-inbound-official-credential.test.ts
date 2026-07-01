/**
 * Tests for the official.credential arm runtime.
 */
import { describe, expect, it, vi } from "vitest";
import { handleOfficialCredentialViaRuntime } from "../src/cli-mesh-inbound-official-credential.js";

describe("cli-mesh-inbound-official-credential", () => {
  it("returns silently when official credential is accepted", async () => {
    const ctx = {
      loadNodeConfig: vi.fn(async () => ({})),
      handleInboundOfficialCredential: vi.fn(async () => ({ ok: true })),
      logWarn: vi.fn(),
      getTaskStore: vi.fn(() => ({ appendAuditEvent: vi.fn(async () => {}) })),
    };
    await handleOfficialCredentialViaRuntime(ctx, { envelope: {} });
    expect(ctx.logWarn).not.toHaveBeenCalled();
  });

  it("warns when handler rejects", async () => {
    const ctx = {
      loadNodeConfig: vi.fn(async () => ({})),
      handleInboundOfficialCredential: vi.fn(async () => ({
        ok: false,
        reason: "unknown_anchor",
      })),
      logWarn: vi.fn(),
      getTaskStore: vi.fn(() => ({ appendAuditEvent: vi.fn(async () => {}) })),
    };
    await handleOfficialCredentialViaRuntime(ctx, { envelope: {} });
    expect(ctx.logWarn).toHaveBeenCalled();
  });

  it("uses trustAnchorPublicKeys from config when present", async () => {
    const handleInboundOfficialCredential = vi.fn(async () => ({ ok: true }));
    const ctx = {
      loadNodeConfig: vi.fn(async () => ({
        trustAnchorPublicKeys: { anchorOne: "anchorOneKey" },
      })),
      handleInboundOfficialCredential,
      logWarn: vi.fn(),
      getTaskStore: vi.fn(() => ({ appendAuditEvent: vi.fn(async () => {}) })),
    };
    await handleOfficialCredentialViaRuntime(ctx, { envelope: {} });
    expect(handleInboundOfficialCredential).toHaveBeenCalledWith(
      expect.objectContaining({ trustAnchorPublicKeys: { anchorOne: "anchorOneKey" } }),
    );
  });
});