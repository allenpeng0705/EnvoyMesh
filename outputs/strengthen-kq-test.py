"""Strengthen the knowledge.query test to verify all 13 closure deps are passed."""
from pathlib import Path
p = Path("apps/node/test/cli-mesh-inbound-knowledge-query.test.ts")
c = p.read_text()

# Add a test that verifies handleInboundKnowledgeQuery is called
# with all 13 fields.
old = """  it("sends a knowledge.response envelope when the handler accepts", async () => {
    const ctx = makeMockCtx({ ok: true });
    const params = {
      envelope: {
        messageId: "m1",
        intent: "knowledge.query",
        createdAt: "T",
        senderPeerId: "sp",
        payload: {},
      },
      remotePeerId: "rp",
      receivedAt: 1,
      correlationId: "c1",
    };
    await handleKnowledgeQueryViaRuntime(ctx, params);
    expect(ctx.deliverOutboundEnvelope).toHaveBeenCalledTimes(1);
    expect(ctx.recordInboundKnowledgeAnswered).toHaveBeenCalledTimes(1);
    expect(ctx.appendAuditEvent).toHaveBeenCalledTimes(1); // outbound audit
  });
});"""

new = """  it("sends a knowledge.response envelope when the handler accepts", async () => {
    const ctx = makeMockCtx({ ok: true });
    const params = {
      envelope: {
        messageId: "m1",
        intent: "knowledge.query",
        createdAt: "T",
        senderPeerId: "sp",
        payload: {},
      },
      remotePeerId: "rp",
      receivedAt: 1,
      correlationId: "c1",
    };
    await handleKnowledgeQueryViaRuntime(ctx, params);
    expect(ctx.deliverOutboundEnvelope).toHaveBeenCalledTimes(1);
    expect(ctx.recordInboundKnowledgeAnswered).toHaveBeenCalledTimes(1);
    expect(ctx.appendAuditEvent).toHaveBeenCalledTimes(1); // outbound audit
  });

  it("REGRESSION: passes all 13 closure deps to handleInboundKnowledgeQuery", async () => {
    // The original arm passes 13 fields to handleInboundKnowledgeQuery.
    // An earlier version of the runtime only passed 5, which would have
    // caused the production handler to receive `undefined` for
    // taskStore, trustStore, etc. This test guards against that.
    const ctx = makeMockCtx({ ok: true });
    const params = {
      envelope: {
        messageId: "m1",
        intent: "knowledge.query",
        createdAt: "T",
        senderPeerId: "sp",
        payload: {},
      },
      remotePeerId: "rp",
      receivedAt: 1,
      correlationId: "c1",
    };
    await handleKnowledgeQueryViaRuntime(ctx, params);
    const call = ctx.handleInboundKnowledgeQuery.mock.calls[0]?.[0];
    expect(call).toBeDefined();
    const requiredFields = [
      "envelope", "remotePeerId", "receivedAt", "correlationId",
      "taskStore", "trustStore", "peerDirectoryStore", "profile",
      "vaultIndex", "modelProviders", "chatLogStore", "humanProfileStore",
      "agentIdentityStore", "knowledgeBase", "ragService",
      "knowledgeSyndicationMaxSensitivity", "contactSyndicationMaxSensitivity",
    ];
    for (const field of requiredFields) {
      expect(call, `handler call missing field: ${field}`).toHaveProperty(field);
    }
  });
});"""

if old not in c:
    raise SystemExit("old test block not found")
c = c.replace(old, new, 1)
p.write_text(c)
print("OK")