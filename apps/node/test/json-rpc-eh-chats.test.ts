import { describe, expect, it, vi } from "vitest";

import type { NodeService } from "@envoymesh/api";
import { routeRpcMethod } from "../src/json-rpc-router.js";
import { localOwnerCaller, runWithRpcCaller } from "../src/rpc-caller-context.js";

describe("json-rpc — envoy harness chats", () => {
  it("routes createEnvoyHarnessChat", async () => {
    const summary = {
      id: "chat-1",
      cwd: "/projects/app",
      title: "app",
      lastUsedAt: "2026-08-25T00:00:00.000Z",
    };
    const ns = {
      mayCallerUseCoding: vi.fn().mockResolvedValue(true),
      createEnvoyHarnessChat: vi.fn().mockResolvedValue(summary),
    } as unknown as NodeService;

    const result = await runWithRpcCaller(localOwnerCaller(""), () =>
      routeRpcMethod(ns, "createEnvoyHarnessChat", { cwd: "/projects/app" }),
    );

    expect(ns.createEnvoyHarnessChat).toHaveBeenCalledWith({
      cwd: "/projects/app",
      title: undefined,
    });
    expect(result).toEqual(summary);
  });

  it("routes removeEnvoyHarnessChat", async () => {
    const ns = {
      mayCallerUseCoding: vi.fn().mockResolvedValue(true),
      removeEnvoyHarnessChat: vi.fn().mockResolvedValue({ removed: true }),
    } as unknown as NodeService;

    const result = await runWithRpcCaller(localOwnerCaller(""), () =>
      routeRpcMethod(ns, "removeEnvoyHarnessChat", { chatId: "chat-1" }),
    );

    expect(ns.removeEnvoyHarnessChat).toHaveBeenCalledWith("chat-1");
    expect(result).toEqual({ removed: true });
  });

  it("routes deleteEnvoyHarnessChatTurn through the coding gate", async () => {
    const history = { sessionId: "s1", cwd: "/projects/app", turns: [], deleted: true };
    const ns = {
      mayCallerUseCoding: vi.fn().mockResolvedValue(true),
      deleteEnvoyHarnessChatTurn: vi.fn().mockResolvedValue(history),
    } as unknown as NodeService;
    const result = await runWithRpcCaller(localOwnerCaller(""), () =>
      routeRpcMethod(ns, "deleteEnvoyHarnessChatTurn", {
        chatId: "chat-1",
        turnId: "eh-msg-0",
      }),
    );
    expect(ns.deleteEnvoyHarnessChatTurn).toHaveBeenCalledWith({
      chatId: "chat-1",
      turnId: "eh-msg-0",
    });
    expect(result).toEqual(history);
  });
});
