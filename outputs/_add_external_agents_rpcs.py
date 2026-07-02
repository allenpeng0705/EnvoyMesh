from pathlib import Path
p = Path("apps/node/src/json-rpc-router.ts")
c = p.read_text()
old = '    case "updateNodeConfig":\n      return ns.updateNodeConfig(params as any);\n    case "listRelays":'
new = '''    case "updateNodeConfig":
      return ns.updateNodeConfig(params as any);
    case "listExternalAgents":
      return ns.listExternalAgents();
    case "revokeExternalAgent":
      return ns.revokeExternalAgent(
        params as unknown as import("@envoymesh/api").RevokeExternalAgentParams,
      );
    case "listRelays":'''
if old not in c:
    print("NOT FOUND")
else:
    c = c.replace(old, new, 1)
    p.write_text(c)
    print("OK")