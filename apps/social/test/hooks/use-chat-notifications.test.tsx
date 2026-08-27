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
  onMount: (ns: {
    fireMessage: (msg: ChatMessage) => void;
    fireRoomMessage: (event: { roomId: string; message: ChatMessage }) => void;
  }) => void;
}) {
  const handlers = new Map<string, Array<(data: unknown) => void>>();
  const fakeNodeService = {
    on: (event: string, cb: (data: unknown) => void) => {
      const list = handlers.get(event) ?? [];
      list.push(cb);
      handlers.set(event, list);
      return () => {
        const i = list.indexOf(cb);
        if (i >= 0) list.splice(i, 1);
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
    fireMessage: (msg: ChatMessage) => {
      for (const h of handlers.get("chat:message") ?? []) h(msg);
    },
    fireRoomMessage: (event) => {
      for (const h of handlers.get("chat:room-message") ?? []) h(event);
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
            fireRef = ns.fireMessage;
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
          fireRef = ns.fireMessage;
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
          fireRef = ns.fireMessage;
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
          fireRef = ns.fireMessage;
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
          fireRef = ns.fireMessage;
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

  it("notifies for inbound chat:room-message events", () => {
    const { captured } = installNotificationRecorder();
    let fireRoomRef: (event: { roomId: string; message: ChatMessage }) => void = () => {};
    render(
      <Harness
        enabled={true}
        wsOpen={true}
        bonds={[]}
        peerId="peer-self"
        locale="en"
        onMount={(ns) => {
          fireRoomRef = ns.fireRoomMessage;
        }}
      />,
    );
    fireRoomRef({
      roomId: "room:family-trip",
      message: {
        messageId: "rm1",
        content: { text: "dinner?", attachments: [] } as any,
        metadata: { timestamp: new Date().toISOString() } as any,
        sender: { nodeId: "other", ownerId: "mom", displayName: "Mom" } as any,
        recipient: { ownerId: "room:family-trip" } as any,
      } as ChatMessage,
    });
    expect(captured()?.title).toBe("Mom");
    expect(captured()?.body).toBe("dinner?");
  });
});
