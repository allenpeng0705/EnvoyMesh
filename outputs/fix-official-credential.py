"""Fix official.credential: add missing taskStore."""
from pathlib import Path

p = Path("apps/node/src/cli-mesh-inbound-official-credential.ts")
c = p.read_text()

old = """  const nodeConfig = await ctx.loadNodeConfig();
  const trustAnchorPublicKeys = nodeConfig?.trustAnchorPublicKeys ?? {};
  const result = await ctx.handleInboundOfficialCredential({
    envelope: params.envelope,
    trustAnchorPublicKeys,
  });"""

new = """  const nodeConfig = await ctx.loadNodeConfig();
  const trustAnchorPublicKeys = nodeConfig?.trustAnchorPublicKeys ?? {};
  const result = await ctx.handleInboundOfficialCredential({
    envelope: params.envelope,
    taskStore: ctx.getTaskStore(),
    trustAnchorPublicKeys,
  });"""

if old not in c:
    raise SystemExit("not found")
c = c.replace(old, new, 1)
p.write_text(c)
print("runtime fixed")

# Update test mock
p2 = Path("apps/node/test/cli-mesh-inbound-official-credential.test.ts")
c2 = p2.read_text()
old2 = """      logWarn: vi.fn(),
    };
    await handleOfficialCredentialViaRuntime(ctx, { envelope: {} });"""
new2 = """      logWarn: vi.fn(),
      getTaskStore: vi.fn(() => ({ appendAuditEvent: vi.fn(async () => {}) })),
    };
    await handleOfficialCredentialViaRuntime(ctx, { envelope: {} });"""

if old2 not in c2:
    raise SystemExit("test mock not found")
c2 = c2.replace(old2, new2, 1)
p2.write_text(c2)
print("test fixed")