"""Patch index.ts: replace the profile.sync/response/request arm with a runtime delegation."""
from pathlib import Path

FILE = Path("apps/node/src/index.ts")
c = FILE.read_text()

if "handleProfileIntentViaRuntime" in c:
    print("already wired")
    raise SystemExit(0)

# Add the import.
anchor = '} from "@envoymesh/protocol";'
new_import = (
    anchor
    + '\nimport { handleProfileIntentViaRuntime } from "./cli-mesh-inbound-profile-intent.js";'
)
c = c.replace(anchor, new_import, 1)
print("import added")

# Replace the arm body. The arm has the if-else if-else-if pattern
# with a specific structure: `if (a || b || c) { ... }` (no return
# at the end). We use brace counting.
start_marker = 'if (\n    envelope.intent === "profile.sync" ||\n    envelope.intent === "profile.response" ||\n    envelope.intent === "profile.request"\n  ) {'
start = c.find(start_marker)
assert start >= 0, "profile.intent arm not found"
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

new_arm = """if (
    envelope.intent === "profile.sync" ||
    envelope.intent === "profile.response" ||
    envelope.intent === "profile.request"
  ) {
    const profileHandled = await handleProfileIntentViaRuntime(
      {
        getNodeService: () =>
          nodeService instanceof NodeServiceImpl ? (nodeService as any) : null,
        appendAuditEvent: (event: any) =>
          taskStore.appendAuditEvent(event),
      },
      { envelope, remotePeerId, remoteAddr, receivedAt, correlationId, replyWithEnvelope },
    );
    if (profileHandled) {
      return;
    }
  }"""

c = c[:start] + new_arm + c[end_idx:]
print("arm replaced")

FILE.write_text(c)
print("index.ts updated")