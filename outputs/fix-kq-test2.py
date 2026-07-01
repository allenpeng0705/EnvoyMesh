"""Fix the second test: provide a non-null getNodeService so recordInboundKnowledgeAnswered fires."""
from pathlib import Path
p = Path("apps/node/test/cli-mesh-inbound-knowledge-query.test.ts")
c = p.read_text()

# In the "sends a knowledge.response envelope when the handler accepts"
# test, override getNodeService to return non-null so the
# recordInboundKnowledgeAnswered branch fires.
old = """  it("sends a knowledge.response envelope when the handler accepts", async () => {
    const ctx = makeMockCtx({ ok: true });
    const params = {"""
new = """  it("sends a knowledge.response envelope when the handler accepts", async () => {
    const ctx = makeMockCtx({ ok: true });
    ctx.getNodeService = vi.fn(() => ({} as any));
    const params = {"""

if old not in c:
    raise SystemExit("old test block not found")
c = c.replace(old, new, 1)
p.write_text(c)
print("OK")