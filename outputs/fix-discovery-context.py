"""Fix discovery: add missing taskStore, trustStore, profile + add to mock."""
from pathlib import Path

p = Path("apps/node/src/cli-mesh-inbound-discovery.ts")
c = p.read_text()

old = """  // 2. Delegate to the core handler.
  const discovery = await ctx.handleInboundDiscoveryIntent({
    envelope,
    remotePeerId,
    receivedAt,
    correlationId: corrId,
    capabilityManifest,
    anonymousDiscoveryMode: nodeConfig?.anonymousDiscoveryMode ?? "off",
    anonymousIntentAllowlist: nodeConfig?.anonymousIntentAllowlist,
    anonymousSensitivityCeiling:
      nodeConfig?.anonymousSensitivityCeiling ?? "public",
    profileDir: params.profileDir,
    humanProfile: humanProfile ?? undefined,
  });"""

new = """  // 2. Delegate to the core handler.
  const discovery = await ctx.handleInboundDiscoveryIntent({
    envelope,
    remotePeerId,
    receivedAt,
    correlationId: corrId,
    profile: ctx.getProfile(),
    taskStore: ctx.getTaskStore(),
    trustStore: ctx.getTrustStore(),
    capabilityManifest,
    anonymousDiscoveryMode: nodeConfig?.anonymousDiscoveryMode ?? "off",
    anonymousIntentAllowlist: nodeConfig?.anonymousIntentAllowlist,
    anonymousSensitivityCeiling:
      nodeConfig?.anonymousSensitivityCeiling ?? "public",
    profileDir: params.profileDir,
    humanProfile: humanProfile ?? undefined,
  });"""

if old not in c:
    raise SystemExit("not found")
c = c.replace(old, new, 1)
p.write_text(c)
print("runtime fixed")

# Also fix the test mock.
p2 = Path("apps/node/test/cli-mesh-inbound-discovery.test.ts")
c2 = p2.read_text()
old2 = """    loadCapabilityManifest: vi.fn(async () => ({})),
    loadNodeConfig: vi.fn(async () => ({})),
    loadHumanProfile: vi.fn(async () => ({})),"""
new2 = """    loadCapabilityManifest: vi.fn(async () => ({})),
    loadNodeConfig: vi.fn(async () => ({})),
    loadHumanProfile: vi.fn(async () => ({})),
    getProfile: vi.fn(() => ({ device: {}, owner: { ownerId: "o" } } as any)),
    getTaskStore: vi.fn(() => ({})),
    getTrustStore: vi.fn(() => ({})),"""
if old2 not in c2:
    raise SystemExit("mock not found")
c2 = c2.replace(old2, new2, 1)
p2.write_text(c2)
print("mock updated")