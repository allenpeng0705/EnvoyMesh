"""Fix the knowledge.query runtime to pass all 13 closure deps.

CRITICAL BUG: the original arm passes 13 fields to
handleInboundKnowledgeQuery. The runtime only passes 5. The test
mocks the handler so the bug wasn't caught.

Fix: add 8 missing accessors + pass them through.
"""
from pathlib import Path
import re

# 1. Fix the runtime: add accessors and pass the missing fields.
RUNTIME = Path("apps/node/src/cli-mesh-inbound-knowledge-query.ts")
runtime = RUNTIME.read_text()

# Update the docstring to list all accessors.
runtime = runtime.replace(
    " *   - getContactSyndicationMaxSensitivity(senderPeerId, remotePeerId)",
    " *   - getTaskStore / getTrustStore / getPeerDirectoryStore /\n"
    " *     getVaultIndex / getModelProviders / getChatLogStore /\n"
    " *     getHumanProfileStore / getAgentIdentityStore / getKnowledgeBase /\n"
    " *     getRagService / getKnowledgeSyndicationMaxSensitivity\n"
    " *   - getContactSyndicationMaxSensitivity(senderPeerId, remotePeerId)",
)

# Update the handler call to pass all 13 fields.
old_call = """  // 2. Hand off to the core handler.
  const kq = await ctx.handleInboundKnowledgeQuery({
    envelope,
    remotePeerId,
    receivedAt,
    correlationId: corrId,
  });"""

new_call = """  // 2. Hand off to the core handler.
  const kq = await ctx.handleInboundKnowledgeQuery({
    envelope,
    remotePeerId,
    receivedAt,
    correlationId: corrId,
    taskStore: ctx.getTaskStore(),
    trustStore: ctx.getTrustStore(),
    peerDirectoryStore: ctx.getPeerDirectoryStore(),
    profile: ctx.getProfile(),
    vaultIndex: ctx.getVaultIndex(),
    modelProviders: ctx.getModelProviders(),
    chatLogStore: ctx.getChatLogStore(),
    humanProfileStore: ctx.getHumanProfileStore(),
    agentIdentityStore: ctx.getAgentIdentityStore(),
    knowledgeBase: ctx.getKnowledgeBase(),
    ragService: ctx.getRagService(),
    knowledgeSyndicationMaxSensitivity:
      ctx.getKnowledgeSyndicationMaxSensitivity(),
    contactSyndicationMaxSensitivity,
  });"""

assert old_call in runtime, "could not find old handler call in runtime"
runtime = runtime.replace(old_call, new_call, 1)

# Also fix recordInboundKnowledgeAnswered to gate on instance check.
# (Currently the runtime calls it unconditionally; the original had
# an `if (nodeService instanceof NodeServiceImpl)` guard.)
old_record = """  ctx.recordInboundKnowledgeAnswered({
    remoteOwnerId: kq.senderOwnerId,
    correlationId: corrId,
    queryPreview: `${kq.queryPreview} (${kq.syndicatedSensitivity})`,
  });
}"""

new_record = """  if (ctx.getNodeService()) {
    ctx.recordInboundKnowledgeAnswered({
      remoteOwnerId: kq.senderOwnerId,
      correlationId: corrId,
      queryPreview: `${kq.queryPreview} (${kq.syndicatedSensitivity})`,
    });
  }
}"""

assert old_record in runtime, "could not find old record call"
runtime = runtime.replace(old_record, new_record, 1)

RUNTIME.write_text(runtime)
print("runtime updated")

# 2. Fix the index.ts patch: add the new context accessors.
INDEX = Path("apps/node/src/index.ts")
index = INDEX.read_text()

# Find the knowledge.query block and add the missing accessors.
# The block looks like:
#   {
#     getContactSyndicationMaxSensitivity: async () => {...},
#     handleInboundKnowledgeQuery: (input: any) => handleInboundKnowledgeQuery(input),
#     appendAuditEvent: (event: any) => taskStore.appendAuditEvent(event),
#     getProfile: () => profile,
#     derivePeerId,
#     createUnsignedEnvelope,
#     createKnowledgeResponsePayload,
#     signUnsignedEnvelope,
#     getMesh: () => mesh,
#     deliverOutboundEnvelope,
#     logWarn: (msg: any) => console.warn(msg),
#     recordInboundKnowledgeAnswered: (input: any) => {...},
#     getProtocol: () => ENVOY_MESSAGE_PROTOCOL,
#   },
old_ctx = """        handleInboundKnowledgeQuery: (input: any) =>
          handleInboundKnowledgeQuery(input),
        appendAuditEvent: (event: any) => taskStore.appendAuditEvent(event),"""

new_ctx = """        handleInboundKnowledgeQuery: (input: any) =>
          handleInboundKnowledgeQuery(input),
        getTaskStore: () => taskStore,
        getTrustStore: () => trustStore,
        getPeerDirectoryStore: () => peerDirectoryStore,
        getVaultIndex: () => vaultIndex,
        getModelProviders: () => currentModelProviders,
        getChatLogStore: () => chatLogStore,
        getHumanProfileStore: () => humanProfileStore,
        getAgentIdentityStore: () => agentIdentityStore,
        getKnowledgeBase: () => currentAiSettings?.knowledgeBase,
        getRagService: () => ragService,
        getKnowledgeSyndicationMaxSensitivity: () =>
          currentKnowledgeSyndicationMaxSensitivity,
        appendAuditEvent: (event: any) => taskStore.appendAuditEvent(event),"""

assert old_ctx in index, "could not find old context block in index.ts"
index = index.replace(old_ctx, new_ctx, 1)

# Also fix the recordInboundKnowledgeAnswered wrapping so the runtime
# can decide whether to call it (the runtime now does the instanceof
# check itself).
old_record = """        recordInboundKnowledgeAnswered: (input: any) => {
          if (nodeService instanceof NodeServiceImpl) {
            nodeService.recordInboundKnowledgeAnswered(input);
          }
        },"""
new_record = """        recordInboundKnowledgeAnswered: (input: any) => {
          if (nodeService instanceof NodeServiceImpl) {
            nodeService.recordInboundKnowledgeAnswered(input);
          }
        },"""

# No-op — same text. The runtime now checks ctx.getNodeService() which
# calls the same instanceof-gated wrapper.

INDEX.write_text(index)
print("index.ts updated")