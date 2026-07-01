"""Patch index.ts: replace the relay.peers.* arm with a runtime delegation."""
from pathlib import Path

FILE = Path("apps/node/src/index.ts")
c = FILE.read_text()

if "handleRelayPeersViaRuntime" in c:
    print("already wired")
    raise SystemExit(0)

# Add the import.
anchor = '} from "@envoymesh/protocol";'
new_import = (
    anchor
    + '\nimport { handleRelayPeersViaRuntime } from "./cli-mesh-inbound-relay-peers.js";'
)
c = c.replace(anchor, new_import, 1)
print("import added")

# Replace the arm body via brace counting.
start_marker = 'if (envelope.intent === "relay.peers.request" || envelope.intent === "relay.peers.response") {'
start = c.find(start_marker)
assert start >= 0, "relay.peers arm not found"
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

new_arm = """if (envelope.intent === "relay.peers.request" || envelope.intent === "relay.peers.response") {
    await handleRelayPeersViaRuntime(
      {
        addObservedRelayPeerId: (id: string) =>
          observedRelayPeerIds.add(id),
        getConnectedRelayPeerIds: () => mesh.getConnectedRelayPeerIds(),
        getObservedRelayPeerIds: () => observedRelayPeerIds,
        dedupeAddrs,
        log: (msg: any) => console.log(msg),
        logWarn: (msg: any) => console.warn(msg),
        getProfile: () => profile,
        getMesh: () => mesh,
        getTaskStore: () => taskStore,
        relayDialMultiaddrsForCircuitRelay,
        handleInboundRelayPeersIntent,
        appendAuditEvent: (event: any) =>
          taskStore.appendAuditEvent(event),
        parseRelayPeersResponsePayload,
        upsertManyDiscoverySeeds: (addrs: string[], src: string) =>
          discoverySeedStore.upsertMany(addrs, src),
        dial: (addr: string) => mesh.dial(addr),
        createUnsignedEnvelope,
        signUnsignedEnvelope,
        derivePeerId,
        deliverOutboundEnvelope,
        getProtocol: () => ENVOY_MESSAGE_PROTOCOL,
      },
      { envelope, remotePeerId, receivedAt, correlationId, advertiseAddrs: args.advertiseAddrs },
    );
    return;
  }"""

c = c[:start] + new_arm + c[end_idx:]
print("arm replaced")

FILE.write_text(c)
print("index.ts updated")