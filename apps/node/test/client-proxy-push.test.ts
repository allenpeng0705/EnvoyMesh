import { describe, expect, it, vi } from "vitest";
import { wireClientProxyPushEvents } from "../src/client-proxy-push.js";

describe("wireClientProxyPushEvents", () => {
  it("forwards home:config-updated with stamped caller profile", async () => {
    // Asynchronous now, because the per-caller policy is the shared
    // `transformForSession` object (its capability branch awaits a store read).
    // The push is still fire-and-forget; only the microtask it lands on changed.
    const emitted: Array<{ event: string; data: unknown }> = [];
    const nodeService = {
      on: vi.fn((_event: string, handler: (data: unknown) => void) => {
        if (_event === "home:config-updated") {
          handler({
            config: {
              callerFamilyProfileId: "owner",
              envoyHarnessChats: [{ id: "c1", cwd: "/tmp/a" }],
            },
          });
        }
        return () => {};
      }),
    } as unknown as import("../src/node-service-impl.js").NodeServiceImpl;

    const unwire = wireClientProxyPushEvents(
      nodeService,
      { profileId: "mom", isOwnerProfile: false },
      (event, data) => {
        emitted.push({ event, data });
      },
    );

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(emitted).toHaveLength(1);
    expect(emitted[0]?.event).toBe("home:config-updated");
    const config = (emitted[0]?.data as { config?: Record<string, unknown> })?.config;
    expect(config?.callerFamilyProfileId).toBe("mom");
    expect(config?.callerIsOwnerProfile).toBe(false);
    expect(config?.aiBots).toEqual([]);

    unwire();
  });

  it("masks bridge:status for a profile that has not been granted the Ext Agent", async () => {
    // The gap this file had: `bridge:status` was in `broadcastEvents`, so the
    // client-proxy transport — the one EnvoyGo uses for its DHT and circuit-relay
    // candidates — delivered `enabled: true` to a family profile the WebSocket
    // host would have masked. Same policy object, so the two cannot disagree.
    const emitted: Array<{ event: string; data: unknown }> = [];
    const nodeService = {
      on: vi.fn((event: string, handler: (data: unknown) => void) => {
        if (event === "bridge:status") handler({ enabled: true, detail: "ok" });
        return () => {};
      }),
      mayFamilyProfileUseExtAgent: vi.fn(async (profileId: string) => profileId === "dad"),
    } as unknown as import("../src/node-service-impl.js").NodeServiceImpl;

    const run = async (profileId: string, isOwnerProfile: boolean) => {
      emitted.length = 0;
      wireClientProxyPushEvents(nodeService, { profileId, isOwnerProfile }, (event, data) => {
        emitted.push({ event, data });
      })();
      await new Promise((resolve) => setTimeout(resolve, 0));
      return (emitted.find((e) => e.event === "bridge:status")?.data ?? null) as {
        enabled?: boolean;
      } | null;
    };

    expect((await run("mom", false))?.enabled).toBe(false); // not granted → masked
    expect((await run("dad", false))?.enabled).toBe(true); // granted
    expect((await run("owner", true))?.enabled).toBe(true); // owner
    // The gate is asked per caller, not globally.
    expect(nodeService.mayFamilyProfileUseExtAgent).toHaveBeenCalled();
  });

  it("masks bridge:status when the gate throws (fail closed)", async () => {
    const emitted: Array<{ event: string; data: unknown }> = [];
    const nodeService = {
      on: vi.fn((event: string, handler: (data: unknown) => void) => {
        if (event === "bridge:status") handler({ enabled: true });
        return () => {};
      }),
      mayFamilyProfileUseExtAgent: vi.fn(async () => {
        throw new Error("family store unavailable");
      }),
    } as unknown as import("../src/node-service-impl.js").NodeServiceImpl;

    wireClientProxyPushEvents(nodeService, { profileId: "mom", isOwnerProfile: false }, (event, data) => {
      emitted.push({ event, data });
    })();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect((emitted.find((e) => e.event === "bridge:status")?.data as { enabled?: boolean })?.enabled)
      .toBe(false);
  });

  it("forwards terminal:session-updated only for owner callers", () => {
    const ownerEmitted: string[] = [];
    const familyEmitted: string[] = [];

    const makeService = () =>
      ({
        on: vi.fn((event: string, handler: (data: unknown) => void) => {
          if (event === "terminal:session-updated") {
            handler({ sessions: [] });
          }
          return () => {};
        }),
      }) as unknown as import("../src/node-service-impl.js").NodeServiceImpl;

    wireClientProxyPushEvents(
      makeService(),
      { profileId: "owner", isOwnerProfile: true },
      (event) => {
        ownerEmitted.push(event);
      },
    )();

    wireClientProxyPushEvents(
      makeService(),
      { profileId: "mom", isOwnerProfile: false },
      (event) => {
        familyEmitted.push(event);
      },
    )();

    expect(ownerEmitted).toContain("terminal:session-updated");
    expect(familyEmitted).not.toContain("terminal:session-updated");
  });
});
