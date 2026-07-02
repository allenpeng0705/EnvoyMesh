"""Add listExternalAgents + revokeExternalAgent to the RpcMethods union."""
from pathlib import Path
p = Path("packages/api/src/ws-protocol.ts")
c = p.read_text()
if "listExternalAgents" in c and "| \"revokeExternalAgent\"" in c:
    print("already added")
    raise SystemExit(0)
# Insert before the closing quote of the union.
marker = " | \"forwardEnvelope\""
new_methods = " | \"listExternalAgents\" | \"revokeExternalAgent\" | \"forwardEnvelope\""
if marker not in c:
    raise SystemExit("forwardEnvelope marker not found in RpcMethods")
c = c.replace(marker, new_methods, 1)
p.write_text(c)
print("OK")