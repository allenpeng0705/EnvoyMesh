"""Phase 2: wire ExternalAgentGateway into NodeServiceImpl + add RPCs."""
from pathlib import Path
p = Path("apps/node/src/node-service-impl.ts")
c = p.read_text()

if "ExternalAgentGateway" in c and "listExternalAgents" in c:
    print("already wired")
    raise SystemExit(0)

# 1. Add the ExternalAgentGateway import + types import.
import_marker = 'import { ExternalAgentGateway } from "./external-agent-gateway.js";'
gateway_import_line = import_marker
types_import = (
    'import type {\n'
    '  ListExternalAgentsParams,\n'
    '  ListExternalAgentsResult,\n'
    '  RevokeExternalAgentParams,\n'
    '  RevokeExternalAgentResult,\n'
    '} from "@envoymesh/api";\n'
)
if import_marker in c:
    # Both already exist; just add the types import before them.
    c = c.replace(import_marker, types_import + import_marker, 1)
else:
    # Add the gateway import after a stable anchor, then add types
    # import before it.
    anchor = 'import { pushNotificationService } from "./push-notification.js";'
    if anchor not in c:
        raise SystemExit("pushNotificationService anchor not found")
    c = c.replace(
        anchor,
        anchor + "\n" + gateway_import_line + "\n" + types_import,
        1,
    )
print("imports added")

# 2. Add the field declaration. Anchor: _approvalQueue declaration line.
field_anchor = "  private _approvalQueue: ApprovalQueue | null = null;"
if field_anchor not in c:
    raise SystemExit("_approvalQueue field anchor not found")
new_field = field_anchor + "\n  private readonly _externalAgentGateway = new ExternalAgentGateway();"
c = c.replace(field_anchor, new_field, 1)
print("field added")

# 3. Add the two methods. Anchor: right before the first public RPC
# method we want to group with. We'll place them right after
# listAgentActivity (near other "list" RPCs).
method_anchor = "  async listAgentActivity(params?: ListAgentActivityParams): Promise<AgentActivityRecord[]> {"
if method_anchor not in c:
    raise SystemExit("listAgentActivity method anchor not found")

new_methods = """  async listExternalAgents(_params?: ListExternalAgentsParams): Promise<ListExternalAgentsResult> {
    const sessions = this._externalAgentGateway.listAgents(true);
    return { agents: sessions };
  }

  async revokeExternalAgent(params: RevokeExternalAgentParams): Promise<RevokeExternalAgentResult> {
    const alreadyRevoked = !this._externalAgentGateway.getAgent(params.agentId);
    const revoked = this._externalAgentGateway.revokeAgent(params.agentId);
    return {
      ok: revoked,
      agentId: params.agentId,
      alreadyRevoked,
    };
  }

""" + method_anchor
c = c.replace(method_anchor, new_methods, 1)
print("methods added")

# 4. Add the imports for the new types if not already present.
# (They're exported from @envoymesh/api which is already imported.)

p.write_text(c)
print("OK")