"""Add the 4 new types to the ws-protocol import block in node-service.ts."""
from pathlib import Path
p = Path("packages/api/src/node-service.ts")
c = p.read_text()
old = "  SendChatParams,\n} from \"./ws-protocol.js\";"
new = """  SendChatParams,
  ListExternalAgentsParams,
  ListExternalAgentsResult,
  RevokeExternalAgentParams,
  RevokeExternalAgentResult,
} from \"./ws-protocol.js\";"""
if old not in c:
    raise SystemExit("anchor not found")
if "ListExternalAgentsParams" in c and "SendChatParams," in c and "ListExternalAgentsParams" not in c:
    raise SystemExit("weird state")
c = c.replace(old, new, 1)
p.write_text(c)
print("OK")