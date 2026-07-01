"""Patch index.ts: replace the system.signal arm with a runtime delegation."""
from pathlib import Path

FILE = Path("apps/node/src/index.ts")
c = FILE.read_text()

if "handleSystemSignalViaRuntime" in c:
    print("already wired")
    raise SystemExit(0)

# Add the import.
anchor = '} from "@envoymesh/protocol";'
new_import = (
    anchor
    + '\nimport { handleSystemSignalViaRuntime } from "./cli-mesh-inbound-system-signal.js";'
)
c = c.replace(anchor, new_import, 1)
print("import added")

# Replace the arm body via brace counting.
start_marker = 'if (envelope.intent === "system.signal") {'
start = c.find(start_marker)
assert start >= 0, "system.signal arm not found"
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

new_arm = """if (envelope.intent === "system.signal") {
    await handleSystemSignalViaRuntime(
      {
        parseSystemSignalPayload,
        verifyAuthorizedDeviceEnvelope,
        evaluateCapability,
        appendAuditEvent: (event: any) =>
          taskStore.appendAuditEvent(event),
        logWarn: (msg: any) => console.warn(msg),
        log: (msg: any) => console.log(msg),
        upsertPeerFromSignal: (input: any) =>
          peerDirectoryStore.upsertPeerFromSignal(input),
      },
      { envelope, remotePeerId, receivedAt, correlationId },
    );
    return;
  }"""

c = c[:start] + new_arm + c[end_idx:]
print("arm replaced")

FILE.write_text(c)
print("index.ts updated")