"""Add listExternalAgents + revokeExternalAgent to NodeService interface."""
from pathlib import Path
p = Path("packages/api/src/node-service.ts")
c = p.read_text()
if "listExternalAgents" in c and "revokeExternalAgent" in c:
    print("already added")
    raise SystemExit(0)

# Find an anchor near other "External" methods. Insert before the
# line containing "requestAgentCard".
anchor = "  /** Send agent.card.request to a bonded peer (response cached on reply). */\n  requestAgentCard(targetOwnerId: string): Promise<{ ok: boolean; error?: string }>;"
new_methods = '''  /** Phase EnvoyGo settings (slice 2): list external agents authorized to call local tools. */
  listExternalAgents(params?: ListExternalAgentsParams): Promise<ListExternalAgentsResult>;

  /** Phase EnvoyGo settings (slice 2): revoke an external agent's authorization. */
  revokeExternalAgent(params: RevokeExternalAgentParams): Promise<RevokeExternalAgentResult>;

''' + anchor
if anchor not in c:
    raise SystemExit("anchor not found")
c = c.replace(anchor, new_methods, 1)
p.write_text(c)
print("OK")