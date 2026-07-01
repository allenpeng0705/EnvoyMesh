"""Add getTaskStore to the remaining 2 contexts in official.credential test."""
from pathlib import Path
p = Path("apps/node/test/cli-mesh-inbound-official-credential.test.ts")
c = p.read_text()

# Replace the second context (warns when handler rejects).
old1 = """  it("warns when handler rejects", async () => {
    const ctx = {
      loadNodeConfig: vi.fn(async () => ({})),
      handleInboundOfficialCredential: vi.fn(async () => ({
        ok: false,
        reason: "unknown_anchor",
      })),
      logWarn: vi.fn(),
    };
    await handleOfficialCredentialViaRuntime(ctx, { envelope: {} });
    expect(ctx.logWarn).toHaveBeenCalled();
  });"""

new1 = """  it("warns when handler rejects", async () => {
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
  });"""

if old1 not in c:
    raise SystemExit("not found 1")
c = c.replace(old1, new1, 1)

old2 = """  it("uses trustAnchorPublicKeys from config when present", async () => {
    const handleInboundOfficialCredential = vi.fn(async () => ({ ok: true }));
    const ctx = {
      loadNodeConfig: vi.fn(async () => ({
        trustAnchorPublicKeys: { anchorOne: "anchorOneKey" },
      })),
      handleInboundOfficialCredential,
      logWarn: vi.fn(),
    };
    await handleOfficialCredentialViaRuntime(ctx, { envelope: {} });
    expect(handleInboundOfficialCredential).toHaveBeenCalledWith(
      expect.objectContaining({ trustAnchorPublicKeys: { anchorOne: "anchorOneKey" } }),
    );
  });"""

new2 = """  it("uses trustAnchorPublicKeys from config when present", async () => {
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
  });"""

if old2 not in c:
    raise SystemExit("not found 2")
c = c.replace(old2, new2, 1)

p.write_text(c)
print("OK")