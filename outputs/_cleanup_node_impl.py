"""Remove the 4 leftover ListExternalAgents* type imports from node-service-impl.ts."""
from pathlib import Path
p = Path("apps/node/src/node-service-impl.ts")
c = p.read_text()
old = """import type {
  ListExternalAgentsParams,
  ListExternalAgentsResult,
  RevokeExternalAgentParams,
  RevokeExternalAgentResult,
} from "@envoymesh/api";

"""
if old not in c:
    print("not found")
    raise SystemExit(1)
c = c.replace(old, "", 1)
p.write_text(c)
print("OK")