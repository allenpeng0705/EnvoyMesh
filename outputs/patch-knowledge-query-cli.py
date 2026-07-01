"""Patch index.ts: replace the knowledge.query arm with a runtime delegation."""
from pathlib import Path

FILE = Path("apps/node/src/index.ts")
c = FILE.read_text()

if "handleKnowledgeQueryViaRuntime" in c:
    print("already wired")
    raise SystemExit(0)

# Add the import.
anchor = '} from "@envoymesh/protocol";'
new_import = (
    anchor
    + '\nimport { handleKnowledgeQueryViaRuntime } from "./cli-mesh-inbound-knowledge-query.js";'
)
c = c.replace(anchor, new_import, 1)
print("import added")

# Replace the arm body.
old_arm_start = 'if (envelope.intent === "knowledge.query") {\n'
start = c.find(old_arm_start)
assert start >= 0, "knowledge.query arm not found"

# Find the matching `}\n    return;\n  }\n` for this arm.
# The arm ends with `return;\n  }`. We need to find the close.
end_marker = 'return;\n  }'
arm_end_idx = c.find(end_marker, start)
assert arm_end_idx >= 0, "could not find arm end"
end_idx = arm_end_idx + len(end_marker)
old_arm = c[start:end_idx]
print(f"arm length: {end_idx - start} chars")

# Build the new arm.
new_arm = """if (envelope.intent === "knowledge.query") {
    await handleKnowledgeQueryViaRuntime(
      {
        getContactSyndicationMaxSensitivity: async () => {
          if (envelope.agentCredential?.ownerId) {
            return currentContactAiPrefs.get(envelope.agentCredential.ownerId)
              ?.syndicationMaxSensitivity;
          }
          const records = await peerDirectoryStore.listPeerRecords();
          const match =
            records.find((r) => r.peerId === envelope.senderPeerId) ??
            records.find((r) => r.peerId === remotePeerId);
          if (match?.ownerId) {
            return currentContactAiPrefs.get(match.ownerId)
              ?.syndicationMaxSensitivity;
          }
          return undefined;
        },
        handleInboundKnowledgeQuery: (input) =>
          handleInboundKnowledgeQuery(input),
        appendAuditEvent: (event) => taskStore.appendAuditEvent(event),
        getProfile: () => profile,
        derivePeerId,
        createUnsignedEnvelope,
        createKnowledgeResponsePayload,
        signUnsignedEnvelope,
        getMesh: () => mesh,
        deliverOutboundEnvelope,
        logWarn: (msg) => console.warn(msg),
        recordInboundKnowledgeAnswered: (input) => {
          if (nodeService instanceof NodeServiceImpl) {
            nodeService.recordInboundKnowledgeAnswered(input);
          }
        },
        getProtocol: () => ENVOY_MESSAGE_PROTOCOL,
      },
      {
        envelope,
        remotePeerId,
        receivedAt,
        correlationId,
      },
    );
    return;
  }"""

c = c[:start] + new_arm + c[end_idx:]
print("arm replaced")

FILE.write_text(c)
print("index.ts updated")