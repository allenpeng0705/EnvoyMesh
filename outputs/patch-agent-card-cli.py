"""Patch index.ts: replace the agent.card.* arm with a runtime delegation."""
from pathlib import Path

FILE = Path("apps/node/src/index.ts")
c = FILE.read_text()

if "handleAgentCardViaRuntime" in c:
    print("already wired")
    raise SystemExit(0)

# Add the import.
anchor = '} from "@envoymesh/protocol";'
new_import = (
    anchor
    + '\nimport { handleAgentCardViaRuntime } from "./cli-mesh-inbound-agent-card.js";'
)
c = c.replace(anchor, new_import, 1)
print("import added")

# Replace the arm body via brace counting. The arm has a special shape:
# it does NOT have a `return;` at the end — control flows to the next
# arm. So we can't use the previous "return;\n  }" pattern; we just match
# the if-statement + its body.
start_marker = 'if (envelope.intent === "agent.card.request" || envelope.intent === "agent.card.response") {'
start = c.find(start_marker)
assert start >= 0, "agent.card arm not found"
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

new_arm = """if (envelope.intent === "agent.card.request" || envelope.intent === "agent.card.response") {
    await handleAgentCardViaRuntime(
      {
        handleDaemonAgentCardInbound,
        getProfile: () => profile,
        getTaskStore: () => taskStore,
        getTrustStore: () => trustStore,
        getAgentCardStore: () => agentCardStore,
        getHumanProfileStore: () => humanProfileStore,
        getBridgeIdentity: () => bridgeIdentity ?? null,
        getMesh: () => mesh,
        getNodeService: () =>
          nodeService instanceof NodeServiceImpl ? (nodeService as any) : null,
      },
      { envelope, remotePeerId, receivedAt, correlationId },
    );
  }"""

c = c[:start] + new_arm + c[end_idx:]
print("arm replaced")

FILE.write_text(c)
print("index.ts updated")