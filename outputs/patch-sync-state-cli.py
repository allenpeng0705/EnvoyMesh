"""Patch index.ts: replace the sync.state arm with a runtime delegation."""
from pathlib import Path

FILE = Path("apps/node/src/index.ts")
c = FILE.read_text()

if "handleSyncStateViaRuntime" in c:
    print("already wired")
    raise SystemExit(0)

# Add the import.
anchor = '} from "@envoymesh/protocol";'
new_import = (
    anchor
    + '\nimport { handleSyncStateViaRuntime } from "./cli-mesh-inbound-sync-state.js";'
)
c = c.replace(anchor, new_import, 1)
print("import added")

# Replace the arm body via brace counting.
start_marker = 'if (envelope.intent === "sync.state") {'
start = c.find(start_marker)
assert start >= 0, "sync.state arm not found"
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

new_arm = """if (envelope.intent === "sync.state") {
    await handleSyncStateViaRuntime(
      {
        handleInboundSyncStateIntent,
        appendAuditEvent: (event: any) =>
          taskStore.appendAuditEvent(event),
        getProfile: () => profile,
        getNodeService: () =>
          nodeService instanceof NodeServiceImpl ? (nodeService as any) : null,
      },
      { envelope, remotePeerId, receivedAt, correlationId },
    );
    return;
  }"""

c = c[:start] + new_arm + c[end_idx:]
print("arm replaced")

FILE.write_text(c)
print("index.ts updated")