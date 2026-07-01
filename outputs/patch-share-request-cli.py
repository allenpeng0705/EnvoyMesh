"""Patch index.ts: replace the share.request arm with a runtime delegation."""
from pathlib import Path

FILE = Path("apps/node/src/index.ts")
c = FILE.read_text()

if "handleShareRequestViaRuntime" in c:
    print("already wired")
    raise SystemExit(0)

# 1. Add the import.
anchor = '} from "@envoymesh/protocol";'
new_import = (
    anchor
    + '\nimport { handleShareRequestViaRuntime } from "./cli-mesh-inbound-share-request.js";'
)
c = c.replace(anchor, new_import, 1)
print("import added")

# 2. Replace the share.request arm (113 lines). Match the start
# `if (envelope.intent === "share.request") {` and end `return;\n  }`.
start_marker = 'if (envelope.intent === "share.request") {\n'
start = c.find(start_marker)
assert start >= 0, "share.request arm not found"

# The arm ends with `return;\n  }` for the inner if-block. There may
# be nested `return;\n  }` in the body but the outermost one is what
# we want. Find the matching close brace using brace counting from
# start.
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

# Build the new arm.
new_arm = """if (envelope.intent === "share.request") {
    await handleShareRequestViaRuntime(
      {
        loadCapabilityManifest: () => capabilityManifestStore.loadManifest(),
        handleInboundShareRequest: (input: any) =>
          handleInboundShareRequest(input),
        appendAuditEvent: (event: any) =>
          taskStore.appendAuditEvent(event),
        getProfile: () => profile,
        derivePeerId,
        createUnsignedEnvelope,
        createSharePreviewPayload,
        signUnsignedEnvelope,
        dialHintsForTransportPeer,
        deliverOutboundEnvelope,
        parseShareRequestPayload,
        resolveSenderOwnerId,
        logWarn: (msg: any) => console.warn(msg),
        getProtocol: () => ENVOY_MESSAGE_PROTOCOL,
        getNodeService: () =>
          nodeService instanceof NodeServiceImpl ? (nodeService as any) : null,
        getMesh: () => mesh,
        getTaskStore: () => taskStore,
        getTrustStore: () => trustStore,
        getPeerDirectoryStore: () => peerDirectoryStore,
        getVaultIndex: () => vaultIndex,
        getVaultDir: () => vaultDirForNode,
        getModelProviders: () => currentModelProviders,
      },
      {
        envelope,
        remotePeerId,
        remoteAddr,
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