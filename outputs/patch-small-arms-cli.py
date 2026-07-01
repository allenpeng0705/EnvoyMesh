"""Patch index.ts: replace task.feedback + chat.room.sync + chat.room.message arms."""
from pathlib import Path

FILE = Path("apps/node/src/index.ts")
c = FILE.read_text()

if "handleTaskFeedbackViaRuntime" in c:
    print("already wired")
    raise SystemExit(0)

# Add 3 imports.
anchor = '} from "@envoymesh/protocol";'
new_imports = anchor + (
    '\nimport { handleTaskFeedbackViaRuntime } from "./cli-mesh-inbound-task-feedback.js";'
    '\nimport { handleChatRoomSyncViaRuntime } from "./cli-mesh-inbound-chat-room-sync.js";'
    '\nimport { handleChatRoomMessageViaRuntime } from "./cli-mesh-inbound-chat-room-message.js";'
)
c = c.replace(anchor, new_imports, 1)
print("imports added")

# Replace task.feedback arm (lines around 1517).
old_tf = """  if (envelope.intent === "task.feedback") {
    const nodeConfig = await nodeConfigStore.load();
    const result = await handleInboundTaskFeedback({
      envelope,
      taskStore,
      reputationStore,
      peerDirectoryStore,
    });
    if (!result.ok) {
      console.warn(`[rejected task.feedback] ${result.reason}`);
    }
    return;
  }"""
new_tf = """  if (envelope.intent === "task.feedback") {
    await handleTaskFeedbackViaRuntime(
      {
        loadNodeConfig: () => nodeConfigStore.load(),
        handleInboundTaskFeedback,
        logWarn: (msg: any) => console.warn(msg),
      },
      { envelope, remotePeerId },
    );
    return;
  }"""
assert old_tf in c, "task.feedback arm not found"
c = c.replace(old_tf, new_tf, 1)
print("task.feedback replaced")

# Replace chat.room.sync arm (lines around 1596).
old_crs = """  if (envelope.intent === "chat.room.sync" && nodeService instanceof NodeServiceImpl) {
    try {
      const payload = parseChatRoomSyncPayload(envelope.payload);
      await nodeService.handleInboundChatRoomSync(envelope, payload);
    } catch {
      console.warn(`[chat.room.sync] invalid payload from ${remotePeerId}`);
    }
    return;
  }"""
new_crs = """  if (envelope.intent === "chat.room.sync" && nodeService instanceof NodeServiceImpl) {
    await handleChatRoomSyncViaRuntime(
      {
        parseChatRoomSyncPayload,
        handleInboundChatRoomSync: (env: any, payload: any) =>
          (nodeService as NodeServiceImpl).handleInboundChatRoomSync(env, payload),
        logWarn: (msg: any) => console.warn(msg),
      },
      { envelope, remotePeerId },
    );
    return;
  }"""
assert old_crs in c, "chat.room.sync arm not found"
c = c.replace(old_crs, new_crs, 1)
print("chat.room.sync replaced")

# Replace chat.room.message arm (lines around 1606).
old_crm = """  if (envelope.intent === "chat.room.message" && nodeService instanceof NodeServiceImpl) {
    try {
      const payload = parseChatRoomMessagePayload(envelope.payload);
      await nodeService.handleInboundChatRoomMessage(envelope, payload, remotePeerId, replyWithEnvelope);
    } catch {
      console.warn(`[chat.room.message] invalid payload from ${remotePeerId}`);
    }
    return;
  }"""
new_crm = """  if (envelope.intent === "chat.room.message" && nodeService instanceof NodeServiceImpl) {
    await handleChatRoomMessageViaRuntime(
      {
        parseChatRoomMessagePayload,
        handleInboundChatRoomMessage: (env: any, payload: any, rid: string, rwen: any) =>
          (nodeService as NodeServiceImpl).handleInboundChatRoomMessage(env, payload, rid, rwen),
        logWarn: (msg: any) => console.warn(msg),
      },
      { envelope, remotePeerId, replyWithEnvelope },
    );
    return;
  }"""
assert old_crm in c, "chat.room.message arm not found"
c = c.replace(old_crm, new_crm, 1)
print("chat.room.message replaced")

FILE.write_text(c)
print("index.ts updated")