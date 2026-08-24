/**
 * @vitest-environment jsdom
 */

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  pathFromActivitySummary,
  useEhTurnContext,
} from "../../src/hooks/useEhTurnContext.js";

describe("pathFromActivitySummary", () => {
  it("extracts path from write/edit activity summaries", () => {
    expect(pathFromActivitySummary("write src/foo.ts")).toBe("src/foo.ts");
    expect(pathFromActivitySummary("edit packages/a/index.ts")).toBe(
      "packages/a/index.ts",
    );
    expect(pathFromActivitySummary("bash npm test")).toBeUndefined();
  });
});

describe("useEhTurnContext", () => {
  it("tracks touched files from activity and files_changed events", () => {
    const activityHandlers = new Set<(event: unknown) => void>();
    const filesHandlers = new Set<(event: unknown) => void>();

    const { result } = renderHook(() =>
      useEhTurnContext({
        projectCwd: "/proj",
        subscribeActivity: (handler) => {
          activityHandlers.add(handler);
          return () => activityHandlers.delete(handler);
        },
        subscribeFilesChanged: (handler) => {
          filesHandlers.add(handler);
          return () => filesHandlers.delete(handler);
        },
      }),
    );

    act(() => {
      for (const handler of activityHandlers) {
        handler({
          kind: "tool_call",
          summary: "write src/a.ts",
        });
      }
    });
    expect(result.current.touchedFiles).toEqual(["src/a.ts"]);

    act(() => {
      for (const handler of filesHandlers) {
        handler({ files: ["src/b.ts"] });
      }
    });
    expect(result.current.touchedFiles).toEqual(["src/a.ts", "src/b.ts"]);

    act(() => {
      result.current.resetTurnContext();
    });
    expect(result.current.touchedFiles).toEqual([]);
  });

  it("ignores activity/files events from other chats (parallel turns)", () => {
    const activityHandlers = new Set<(event: unknown) => void>();
    const filesHandlers = new Set<(event: unknown) => void>();

    const { result } = renderHook(() =>
      useEhTurnContext({
        projectCwd: "/proj",
        chatId: "chat-a",
        subscribeActivity: (handler) => {
          activityHandlers.add(handler);
          return () => activityHandlers.delete(handler);
        },
        subscribeFilesChanged: (handler) => {
          filesHandlers.add(handler);
          return () => filesHandlers.delete(handler);
        },
      }),
    );

    act(() => {
      for (const handler of activityHandlers) {
        handler({
          kind: "tool_call",
          summary: "write src/other.ts",
          chatId: "chat-b",
        });
      }
    });
    expect(result.current.touchedFiles).toEqual([]);
    expect(result.current.activityLog).toEqual([]);

    act(() => {
      for (const handler of activityHandlers) {
        handler({
          kind: "tool_call",
          summary: "write src/mine.ts",
          chatId: "chat-a",
        });
      }
      for (const handler of filesHandlers) {
        handler({ files: ["src/b.ts"], chatId: "chat-b" });
      }
    });
    expect(result.current.touchedFiles).toEqual(["src/mine.ts"]);

    act(() => {
      for (const handler of filesHandlers) {
        handler({ files: ["src/c.ts"], chatId: "chat-a" });
      }
    });
    expect(result.current.touchedFiles).toEqual([
      "src/mine.ts",
      "src/c.ts",
    ]);
  });
});
