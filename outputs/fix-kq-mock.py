"""Add the new context methods to the mock."""
from pathlib import Path
p = Path("apps/node/test/cli-mesh-inbound-knowledge-query.test.ts")
c = p.read_text()

# Insert the new accessors after getContactSyndicationMaxSensitivity.
old = "    getContactSyndicationMaxSensitivity: vi.fn(async () => \"public\"),\n"
new = (
    "    getContactSyndicationMaxSensitivity: vi.fn(async () => \"public\"),\n"
    "    getTaskStore: vi.fn(() => ({} as any)),\n"
    "    getTrustStore: vi.fn(() => ({} as any)),\n"
    "    getPeerDirectoryStore: vi.fn(() => ({} as any)),\n"
    "    getVaultIndex: vi.fn(async () => ({ documents: [] })),\n"
    "    getModelProviders: vi.fn(() => ({ mode: \"disabled\" })),\n"
    "    getChatLogStore: vi.fn(() => ({} as any)),\n"
    "    getHumanProfileStore: vi.fn(() => ({} as any)),\n"
    "    getAgentIdentityStore: vi.fn(() => ({} as any)),\n"
    "    getKnowledgeBase: vi.fn(() => undefined),\n"
    "    getRagService: vi.fn(() => ({} as any)),\n"
    "    getKnowledgeSyndicationMaxSensitivity: vi.fn(() => undefined),\n"
    "    getNodeService: vi.fn(() => null),\n"
)

if old not in c:
    raise SystemExit("anchor not found")
c = c.replace(old, new, 1)
p.write_text(c)
print("OK")