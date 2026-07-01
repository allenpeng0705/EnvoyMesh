"""Patch index.ts: replace the discovery.* arm with a runtime delegation."""
from pathlib import Path

FILE = Path("apps/node/src/index.ts")
c = FILE.read_text()

if "handleDiscoveryViaRuntime" in c:
    print("already wired")
    raise SystemExit(0)

# Add the import.
anchor = '} from "@envoymesh/protocol";'
new_import = (
    anchor
    + '\nimport { handleDiscoveryViaRuntime } from "./cli-mesh-inbound-discovery.js";'
)
c = c.replace(anchor, new_import, 1)
print("import added")

# Replace the arm body via brace counting.
start_marker = 'if (envelope.intent === "discovery.request" || envelope.intent === "discovery.response") {'
start = c.find(start_marker)
assert start >= 0, "discovery arm not found"
brace = c.find("{", start)
depth = 0
seen_open = False
for i in range(brace, len(c)):
    ch = c[i]
    if ch == "{":
        depth += 1
        seen_open = True
    elif ch == "}":
        depth -= 1
        if seen_open and depth == 0:
            end_idx = i + 1
            break

old_arm = c[start:end_idx]
print(f"arm length: {end_idx - start} chars")

new_arm = """if (envelope.intent === "discovery.request" || envelope.intent === "discovery.response") {
    await handleDiscoveryViaRuntime(
      {
        loadCapabilityManifest: () => capabilityManifestStore.loadManifest(),
        loadNodeConfig: () => nodeConfigStore.load(),
        loadHumanProfile: () =>
          humanProfileStore.loadHumanProfile().catch(() => undefined),
        handleInboundDiscoveryIntent: (input: any) =>
          handleInboundDiscoveryIntent(input),
        appendAuditEvent: (event: any) =>
          taskStore.appendAuditEvent(event),
        appendDiscoveryEvent: (event: any) =>
          taskStore.appendDiscoveryEvent(event),
        logWarn: (msg: any) => console.warn(msg),
        getProfile: () => profile,
        getMesh: () => mesh,
        deliverOutboundEnvelope,
        createUnsignedEnvelope,
        createDiscoveryResponsePayload,
        signUnsignedEnvelope,
        derivePeerId,
        getProtocol: () => ENVOY_MESSAGE_PROTOCOL,
      },
      { envelope, remotePeerId, receivedAt, correlationId, profileDir: args.profileDir, replyWithEnvelope },
    );
    return;
  }"""

c = c[:start] + new_arm + c[end_idx:]
print("arm replaced")

FILE.write_text(c)
print("index.ts updated")