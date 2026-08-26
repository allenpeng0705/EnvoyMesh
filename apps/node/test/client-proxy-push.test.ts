import { describe, expect, it, vi } from "vitest";
import { wireClientProxyPushEvents } from "../src/client-proxy-push.js";

describe("wireClientProxyPushEvents", () => {
  it("forwards home:config-updated with stamped caller profile", () => {
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

    expect(emitted).toHaveLength(1);
    expect(emitted[0]?.event).toBe("home:config-updated");
    const config = (emitted[0]?.data as { config?: Record<string, unknown> })?.config;
    expect(config?.callerFamilyProfileId).toBe("mom");
    expect(config?.callerIsOwnerProfile).toBe(false);
    expect(config?.aiBots).toEqual([]);

    unwire();
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
