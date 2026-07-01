"""Patch index.ts: replace the broadcast.* arm with a runtime delegation."""
from pathlib import Path

FILE = Path("apps/node/src/index.ts")
c = FILE.read_text()

if "handleBroadcastViaRuntime" in c:
    print("already wired")
    raise SystemExit(0)

# Add the import.
anchor = '} from "@envoymesh/protocol";'
new_import = (
    anchor
    + '\nimport { handleBroadcastViaRuntime } from "./cli-mesh-inbound-broadcast.js";'
)
c = c.replace(anchor, new_import, 1)
print("import added")

# Replace the arm body via brace counting.
start_marker = 'if (envelope.intent === "broadcast.request" || envelope.intent === "broadcast.response") {'
start = c.find(start_marker)
assert start >= 0, "broadcast arm not found"
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

new_arm = """if (envelope.intent === "broadcast.request" || envelope.intent === "broadcast.response") {
    await handleBroadcastViaRuntime(
      {
        loadCapabilityManifest: () => capabilityManifestStore.loadManifest(),
        loadNodeConfig: () => nodeConfigStore.load(),
        handleInboundBroadcastRequest: (input: any) =>
          handleInboundBroadcastRequest(input),
        handleInboundBroadcastResponse: (input: any) =>
          handleInboundBroadcastResponse(input),
        appendAuditEvent: (event: any) =>
          taskStore.appendAuditEvent(event),
        logWarn: (msg: any) => console.warn(msg),
        getProfile: () => profile,
        getMesh: () => mesh,
        deliverOutboundEnvelope,
        createUnsignedEnvelope,
        signUnsignedEnvelope,
        derivePeerId,
        getProtocol: () => ENVOY_MESSAGE_PROTOCOL,
      },
      { envelope, remotePeerId, receivedAt, correlationId },
    );
    return;
  }"""

c = c[:start] + new_arm + c[end_idx:]
print("arm replaced")

FILE.write_text(c)
print("index.ts updated")