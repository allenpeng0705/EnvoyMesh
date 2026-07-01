"""Fix implicit-any errors in the index.ts patch."""
from pathlib import Path
p = Path("apps/node/src/index.ts")
c = p.read_text()
for old, new in [
    ("handleInboundKnowledgeQuery: (input) =>", "handleInboundKnowledgeQuery: (input: any) =>"),
    ("appendAuditEvent: (event) =>", "appendAuditEvent: (event: any) =>"),
    ("logWarn: (msg) =>", "logWarn: (msg: any) =>"),
    ("recordInboundKnowledgeAnswered: (input) =>", "recordInboundKnowledgeAnswered: (input: any) =>"),
]:
    if old in c:
        c = c.replace(old, new, 1)
        print(f"fixed: {old[:40]}")
p.write_text(c)