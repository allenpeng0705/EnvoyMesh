"""Patch index.ts: replace the share.preview arm with a runtime delegation."""
from pathlib import Path

FILE = Path("apps/node/src/index.ts")
c = FILE.read_text()

if "handleCliSharePreviewViaRuntime" in c:
    print("already wired")
    raise SystemExit(0)

# Anchor: the line that closes the @envoymesh/protocol multi-line import.
anchor = '} from "@envoymesh/protocol";'
if anchor not in c:
    raise SystemExit("could not find @envoymesh/protocol import-anchor line")
new_import = (
    anchor
    + '\nimport { handleCliSharePreviewViaRuntime } from "./cli-mesh-inbound-share-preview.js";'
)
c = c.replace(anchor, new_import, 1)
print("import added")

# Replace the share.preview arm (28 lines).
old_arm = """  if (envelope.intent === "share.preview") {
    try {
      const previewPayload = parseSharePreviewPayload(envelope.payload);
      if (
        nodeService instanceof NodeServiceImpl &&
        previewPayload.isFileTransfer &&
        !previewPayload.refused
      ) {
        const senderOwnerId = await resolveSenderOwnerId(
          envelope.senderPeerId,
          remotePeerId,
          peerDirectoryStore,
        );
        const recorded = nodeService.recordInboundPullSharePreview({
          previewMessageId: envelope.messageId,
          inReplyToRequestMsgId: previewPayload.inReplyTo,
          senderPeerId: remotePeerId,
          senderOwnerId,
          previewText: previewPayload.previewText,
          sensitivity: previewPayload.sensitivity as "public" | "friends" | "private",
        });
        if (!recorded) {
          nodeService.linkOutboundSharePreviewFromInbound(envelope.messageId, previewPayload.inReplyTo);
          console.log(
            `[share.preview] linked outbound file send for request ${previewPayload.inReplyTo.slice(0, 12)}…`,
          );
        }
      }
    } catch {
      // ignore invalid preview payloads for helper linkage
    }
    return;
  }"""

new_arm = """  if (envelope.intent === "share.preview") {
    await handleCliSharePreviewViaRuntime(
      { nodeService, peerDirectoryStore, resolveSenderOwnerId },
      { envelope, remotePeerId },
    );
    return;
  }"""

if old_arm not in c:
    raise SystemExit("could not find share.preview arm body")
c = c.replace(old_arm, new_arm, 1)
print("arm replaced")

FILE.write_text(c)
print("index.ts updated")