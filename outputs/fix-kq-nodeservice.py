"""Add getNodeService to the knowledge.query patch context."""
from pathlib import Path
p = Path("apps/node/src/index.ts")
c = p.read_text()

# Add getNodeService to the knowledge.query context object.
old = """        recordInboundKnowledgeAnswered: (input: any) => {
          if (nodeService instanceof NodeServiceImpl) {
            nodeService.recordInboundKnowledgeAnswered(input);
          }
        },"""

new = """        getNodeService: () =>
          nodeService instanceof NodeServiceImpl ? (nodeService as any) : null,
        recordInboundKnowledgeAnswered: (input: any) => {
          if (nodeService instanceof NodeServiceImpl) {
            nodeService.recordInboundKnowledgeAnswered(input);
          }
        },"""

assert old in c, "could not find recordInboundKnowledgeAnswered"
c = c.replace(old, new, 1)
p.write_text(c)
print("OK")