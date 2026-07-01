"""Patch index.ts: add the import + replace the system.ping arm.

Anchors the runtime import on the closing `} from "@envoymesh/protocol";`
line — guaranteed to be top-level (imports are always at the top of
the file before any function bodies).
"""
from pathlib import Path

FILE = Path("apps/node/src/index.ts")
c = FILE.read_text()

if "handleSystemPingViaRuntime" in c:
    print("already wired")
    raise SystemExit(0)

# Anchor: the line that closes the @envoymesh/protocol multi-line import.
anchor = '} from "@envoymesh/protocol";'
if anchor not in c:
    raise SystemExit("could not find @envoymesh/protocol import-anchor line")

new_import = (
    anchor
    + '\nimport { handleSystemPingViaRuntime } from "./cli-mesh-inbound-system-ping.js";'
)
c = c.replace(anchor, new_import, 1)
print("import added")

# Replace the system.ping arm.
old_arm = """  if (envelope.intent === "system.ping") {
    const payload = parseSystemPingPayload(envelope.payload);
    console.log(
      `[verified ping] from ${envelope.senderPeerId} via libp2p peer ${remotePeerId}: ${payload.message ?? payload.nonce}`,
    );
    void taskStore.appendAuditEvent(
      createAuditEvent({
        type: "message.verified",
        intent: envelope.intent,
        messageId: envelope.messageId,
        correlationId,
        remotePeerId,
        direction: "inbound",
        verificationStatus: "verified",
        latencyMs: Date.now() - receivedAt,
        outcome: "allow",
        summary: "Verified ping message.",
        createdAt: envelope.createdAt,
      }),
    );
    return;
  }"""

new_arm = """  if (envelope.intent === "system.ping") {
    await handleSystemPingViaRuntime(
      { taskStore, parseSystemPingPayload, createAuditEvent },
      {
        envelope: {
          messageId: envelope.messageId,
          senderPeerId: envelope.senderPeerId,
          createdAt: envelope.createdAt,
          intent: envelope.intent,
          payload: envelope.payload,
        },
        remotePeerId,
        correlationId,
        receivedAt,
      },
    );
    return;
  }"""

if old_arm not in c:
    raise SystemExit("could not find system.ping arm body")
c = c.replace(old_arm, new_arm, 1)
print("arm replaced")

FILE.write_text(c)
print("index.ts updated")