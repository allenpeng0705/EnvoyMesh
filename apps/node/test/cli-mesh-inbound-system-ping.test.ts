/**
 * Tests for cli-mesh-inbound-system-ping.ts.
 *
 * Verifies the extracted arm produces the same observable side effects
 * as the inline version in apps/node/src/index.ts:
 *   - a console.log with the ping's message/nonce
 *   - an audit event written to taskStore.appendAuditEvent
 *
 * The test uses a hand-rolled mock context, so it does not depend on
 * the full CLI bootstrap.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  handleSystemPingViaRuntime,
  type SystemPingContext,
} from "../src/cli-mesh-inbound-system-ping.js";

interface MockContext extends SystemPingContext {
  capturedEvents: unknown[];
  parseSystemPingPayload: ReturnType<typeof vi.fn>;
  createAuditEvent: ReturnType<typeof vi.fn>;
  appendAudit: ReturnType<typeof vi.fn>;
}

function makeContext(): MockContext {
  const capturedEvents: unknown[] = [];
  return {
    capturedEvents,
    taskStore: {
      appendAuditEvent: vi.fn(async (event: unknown) => {
        capturedEvents.push(event);
      }),
    },
    parseSystemPingPayload: vi.fn((payload: unknown) => {
      // Default: assume the input is a { message } or { nonce } shape.
      const p = payload as { message?: string; nonce?: string };
      return { message: p.message, nonce: p.nonce };
    }),
    createAuditEvent: vi.fn((input: unknown) => ({ ...(input as object) })),
  };
}

const NOW = 1_700_000_000_000;

describe("handleSystemPingViaRuntime", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it("writes an audit event with the inbound ping metadata", async () => {
    const ctx = makeContext();
    const receivedAt = NOW - 42;
    await handleSystemPingViaRuntime(ctx, {
      envelope: {
        messageId: "msg-1",
        senderPeerId: "12D3KooWPeer",
        createdAt: "2026-07-01T00:00:00.000Z",
        intent: "system.ping",
        payload: { nonce: "nonce-abc" },
      },
      remotePeerId: "12D3KooWPeerLibp2p",
      correlationId: "corr-1",
      receivedAt,
    });

    // The runtime logs a [verified ping] line.
    expect(logSpy).toHaveBeenCalledTimes(1);
    const logged = logSpy.mock.calls[0]?.[0] as string;
    expect(logged).toContain("[verified ping]");
    expect(logged).toContain("12D3KooWPeer"); // senderPeerId
    expect(logged).toContain("12D3KooWPeerLibp2p"); // remotePeerId
    expect(logged).toContain("nonce-abc");

    // Exactly one audit event is appended.
    expect(ctx.capturedEvents).toHaveLength(1);
    const event = ctx.capturedEvents[0] as Record<string, unknown>;
    expect(event).toMatchObject({
      type: "message.verified",
      intent: "system.ping",
      messageId: "msg-1",
      correlationId: "corr-1",
      remotePeerId: "12D3KooWPeerLibp2p",
      direction: "inbound",
      verificationStatus: "verified",
      outcome: "allow",
      summary: "Verified ping message.",
    });
    // Latency uses Date.now() at runtime, but it must equal a positive
    // number close to "now - receivedAt" or simply be a number.
    expect(typeof event.latencyMs).toBe("number");
  });

  it("prefers the ping message over the nonce in the log line", async () => {
    const ctx = makeContext();
    await handleSystemPingViaRuntime(ctx, {
      envelope: {
        messageId: "msg-2",
        senderPeerId: "sender",
        createdAt: "2026-07-01T00:00:00.000Z",
        intent: "system.ping",
        payload: { message: "hello", nonce: "nonce-xyz" },
      },
      remotePeerId: "remote",
      correlationId: "corr-2",
      receivedAt: NOW - 100,
    });
    const logged = logSpy.mock.calls[0]?.[0] as string;
    expect(logged).toContain("hello");
    // The fallback `?? payload.nonce` means the log shows the message
    // (not both). Verify it doesn't say "nonce-xyz".
    expect(logged).not.toContain("nonce-xyz");
  });

  it("falls back to the nonce when no message is provided", async () => {
    const ctx = makeContext();
    await handleSystemPingViaRuntime(ctx, {
      envelope: {
        messageId: "msg-3",
        senderPeerId: "sender",
        createdAt: "2026-07-01T00:00:00.000Z",
        intent: "system.ping",
        payload: { nonce: "fallback-nonce" },
      },
      remotePeerId: "remote",
      correlationId: "corr-3",
      receivedAt: NOW,
    });
    const logged = logSpy.mock.calls[0]?.[0] as string;
    expect(logged).toContain("fallback-nonce");
  });

  it("is a no-op for audit if taskStore is undefined", async () => {
    const ctx = makeContext();
    (ctx as { taskStore: unknown }).taskStore = undefined;
    await handleSystemPingViaRuntime(ctx, {
      envelope: {
        messageId: "msg-4",
        senderPeerId: "sender",
        createdAt: "2026-07-01T00:00:00.000Z",
        intent: "system.ping",
        payload: { nonce: "n" },
      },
      remotePeerId: "remote",
      correlationId: "corr-4",
      receivedAt: NOW,
    });
    // Should not throw even without taskStore.
    expect(logSpy).toHaveBeenCalledTimes(1);
  });
});