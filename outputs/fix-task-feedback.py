"""Fix task.feedback: add missing taskStore, reputationStore, peerDirectoryStore."""
from pathlib import Path

p = Path("apps/node/src/cli-mesh-inbound-task-feedback.ts")
c = p.read_text()

old = """export async function handleTaskFeedbackViaRuntime(
  ctx: any,
  params: TaskFeedbackParams,
): Promise<void> {
  await ctx.loadNodeConfig();
  const result = await ctx.handleInboundTaskFeedback({
    envelope: params.envelope,
  });
  if (!result.ok) {
    ctx.logWarn(`[rejected task.feedback] ${result.reason}`);
  }
}"""

new = """export async function handleTaskFeedbackViaRuntime(
  ctx: any,
  params: TaskFeedbackParams,
): Promise<void> {
  const result = await ctx.handleInboundTaskFeedback({
    envelope: params.envelope,
    taskStore: ctx.getTaskStore(),
    reputationStore: ctx.getReputationStore(),
    peerDirectoryStore: ctx.getPeerDirectoryStore(),
  });
  if (!result.ok) {
    ctx.logWarn(`[rejected task.feedback] ${result.reason}`);
  }
}"""

if old not in c:
    raise SystemExit("not found")
c = c.replace(old, new, 1)
p.write_text(c)
print("runtime fixed")

# Update the test mock too.
p2 = Path("apps/node/test/cli-mesh-inbound-small-arms.test.ts")
c2 = p2.read_text()
old2 = """describe("cli-mesh-inbound-task-feedback", () => {
  it("returns silently after persisting feedback", async () => {
    const ctx = {
      loadNodeConfig: vi.fn(async () => ({})),
      handleInboundTaskFeedback: vi.fn(async () => ({ ok: true })),
      logWarn: vi.fn(),
    };
    await handleTaskFeedbackViaRuntime(ctx, {
      envelope: { intent: "task.feedback" },
      remotePeerId: "rp",
    });
    expect(ctx.logWarn).not.toHaveBeenCalled();
  });

  it("warns when the handler rejects", async () => {
    const ctx = {
      loadNodeConfig: vi.fn(async () => ({})),
      handleInboundTaskFeedback: vi.fn(async () => ({
        ok: false,
        reason: "reputation_mismatch",
      })),
      logWarn: vi.fn(),
    };
    await handleTaskFeedbackViaRuntime(ctx, {
      envelope: { intent: "task.feedback" },
      remotePeerId: "rp",
    });
    expect(ctx.logWarn).toHaveBeenCalled();
  });
});"""

new2 = """describe("cli-mesh-inbound-task-feedback", () => {
  it("returns silently after persisting feedback", async () => {
    const ctx = {
      handleInboundTaskFeedback: vi.fn(async () => ({ ok: true })),
      getTaskStore: vi.fn(() => ({})),
      getReputationStore: vi.fn(() => ({})),
      getPeerDirectoryStore: vi.fn(() => ({})),
      logWarn: vi.fn(),
    };
    await handleTaskFeedbackViaRuntime(ctx, {
      envelope: { intent: "task.feedback" },
      remotePeerId: "rp",
    });
    expect(ctx.logWarn).not.toHaveBeenCalled();
  });

  it("warns when the handler rejects", async () => {
    const ctx = {
      handleInboundTaskFeedback: vi.fn(async () => ({
        ok: false,
        reason: "reputation_mismatch",
      })),
      getTaskStore: vi.fn(() => ({})),
      getReputationStore: vi.fn(() => ({})),
      getPeerDirectoryStore: vi.fn(() => ({})),
      logWarn: vi.fn(),
    };
    await handleTaskFeedbackViaRuntime(ctx, {
      envelope: { intent: "task.feedback" },
      remotePeerId: "rp",
    });
    expect(ctx.logWarn).toHaveBeenCalled();
  });
});"""

if old2 not in c2:
    raise SystemExit("test not found")
c2 = c2.replace(old2, new2, 1)
p2.write_text(c2)
print("test fixed")