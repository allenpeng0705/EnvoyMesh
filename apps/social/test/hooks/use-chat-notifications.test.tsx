/**
 * @vitest-environment jsdom
 */
import React from "react";
import { describe, expect, it, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import type { BondRecord, ChatMessage } from "@envoymesh/api";
import { useChatNotifications } from "../../src/hooks/useChatNotifications.js";

// jsdom defaults `document.hidden` to false; the hook skips the
// notification when the document is visible. Force "hidden" so the
// notification path always runs in tests.
Object.defineProperty(document, "hidden", { configurable: true, get: () => true });

function Harness({
  enabled,
  wsOpen,
  bonds,
  peerId,
  locale,
  onMount,
}: {
  enabled: boolean;
  wsOpen: boolean;
  bonds: BondRecord[];
  peerId: string;
  locale: string;
  onMount: (ns: { fire: (msg: ChatMessage) => void }) => void;
}) {
  const handlers: Array<(data: unknown) => void> = [];
  const fakeNodeService = {
    on: (_event: string, cb: (data: unknown) => void) => {
      handlers.push(cb);
      return () => {
        const i = handlers.indexOf(cb);
        if (i >= 0) handlers.splice(i, 1);
      };
    },
    isConnected: true,
    isReady: true,
  } as any;
  useChatNotifications({
    enabled,
    nodeService: fakeNodeService,
    wsOpen,
    bonds,
    peerId,
    locale,
  });
  onMount({
    fire: (msg: ChatMessage) => {
      for (const h of handlers) h(msg);
    },
  });
  return null;
}

function installNotificationRecorder(): { captured: () => { title: string; body: string } | null } {
  let last: { title: string; body: string } | null = null;
  (globalThis as any).Notification = class {
    static permission = "granted";
    constructor(title: string, opts: NotificationOptions) {
      last = { title, body: (opts.body as string) ?? "" };
    }
  } as any;
  return { captured: () => last };
}

describe("useChatNotifications (regression: no I18nProvider / NodeStateProvider)", () => {
  beforeEach(() => {
    // noop — locale is passed via props
  });

  it("does not throw when no I18nProvider or NodeStateProvider is present", () => {
    installNotificationRecorder();
    let fireRef: (msg: ChatMessage) => void = () => {};
    expect(() => {
      render(
        <Harness
          enabled={true}
          wsOpen={true}
          bonds={[]}
          peerId="self"
          locale="zh"
          onMount={(ns) => {
            fireRef = ns.fire;
          }}
        />,
      );
    }).not.toThrow();
    fireRef({
      messageId: "m1",
      content: { text: "hi", attachments: [] } as any,
      metadata: { timestamp: new Date().toISOString() } as any,
      sender: { nodeId: "other", ownerId: "envoy:owner:bob", displayName: "Bob" } as any,
      recipient: {} as any,
    } as ChatMessage);
  });

  it("forwards the original message text as notification body (en)", () => {
    const { captured } = installNotificationRecorder();
    let fireRef: (msg: ChatMessage) => void = () => {};
    render(
      <Harness
        enabled={true}
        wsOpen={true}
        bonds={[]}
        peerId="self"
        locale="en"
        onMount={(ns) => {
          fireRef = ns.fire;
        }}
      />,
    );
    fireRef({
      messageId: "m1",
      content: { text: "hello", attachments: [] } as any,
      metadata: { timestamp: new Date().toISOString() } as any,
      sender: { nodeId: "other", ownerId: "envoy:owner:bob", displayName: "Bob" } as any,
      recipient: {} as any,
    } as ChatMessage);
    expect(captured()?.body).toBe("hello");
  });

  it("uses localized 'Sent a file' fallback (zh) for attachments", () => {
    const { captured } = installNotificationRecorder();
    let fireRef: (msg: ChatMessage) => void = () => {};
    render(
      <Harness
        enabled={true}
        wsOpen={true}
        bonds={[]}
        peerId="self"
        locale="zh"
        onMount={(ns) => {
          fireRef = ns.fire;
        }}
      />,
    );
    fireRef({
      messageId: "m1",
      content: { text: "", attachments: [{ name: "x" }] } as any,
      metadata: { timestamp: new Date().toISOString() } as any,
      sender: { nodeId: "other", ownerId: "envoy:owner:bob" } as any,
      recipient: {} as any,
    } as ChatMessage);
    expect(captured()?.body).toBe("发送了一个文件");
  });

  it("uses localized 'New chat message' fallback (ko) for empty messages", () => {
    const { captured } = installNotificationRecorder();
    let fireRef: (msg: ChatMessage) => void = () => {};
    render(
      <Harness
        enabled={true}
        wsOpen={true}
        bonds={[]}
        peerId="self"
        locale="ko"
        onMount={(ns) => {
          fireRef = ns.fire;
        }}
      />,
    );
    fireRef({
      messageId: "m1",
      content: {} as any,
      metadata: { timestamp: new Date().toISOString() } as any,
      sender: { nodeId: "other", ownerId: "envoy:owner:bob" } as any,
      recipient: {} as any,
    } as ChatMessage);
    expect(captured()?.body).toBe("새 채팅 메시지");
  });

  it("uses localized 'New chat message' fallback (ja) for empty messages", () => {
    const { captured } = installNotificationRecorder();
    let fireRef: (msg: ChatMessage) => void = () => {};
    render(
      <Harness
        enabled={true}
        wsOpen={true}
        bonds={[]}
        peerId="self"
        locale="ja"
        onMount={(ns) => {
          fireRef = ns.fire;
        }}
      />,
    );
    fireRef({
      messageId: "m1",
      content: {} as any,
      metadata: { timestamp: new Date().toISOString() } as any,
      sender: { nodeId: "other", ownerId: "envoy:owner:bob" } as any,
      recipient: {} as any,
    } as ChatMessage);
    expect(captured()?.body).toBe("新しいチャットメッセージ");
  });
});
