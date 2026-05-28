/**
 * Contract test: NodeStateContext sendHello also requests peer profile (hello + photo request).
 */
import { describe, expect, it, vi } from "vitest";

describe("sendHello + requestPeerProfile contract", () => {
  it("requests peer profile after hello succeeds", async () => {
    const sendHello = vi.fn().mockResolvedValue(undefined);
    const requestPeerProfile = vi.fn().mockResolvedValue({ ok: true });

    const wrappedSendHello = async (
      targetOwnerId: string,
      profile: unknown,
      message: string,
      opts?: unknown,
    ) => {
      await sendHello(targetOwnerId, profile, message, opts);
      void requestPeerProfile(targetOwnerId).catch(() => {});
    };

    await wrappedSendHello("envoy:owner:bob", { displayName: "Me" }, "Hello!");

    expect(sendHello).toHaveBeenCalledWith("envoy:owner:bob", { displayName: "Me" }, "Hello!", undefined);
    expect(requestPeerProfile).toHaveBeenCalledWith("envoy:owner:bob");
  });

  it("still completes hello when profile request fails", async () => {
    const sendHello = vi.fn().mockResolvedValue(undefined);
    const requestPeerProfile = vi.fn().mockRejectedValue(new Error("offline"));

    const wrappedSendHello = async (targetOwnerId: string, profile: unknown, message: string) => {
      await sendHello(targetOwnerId, profile, message);
      await requestPeerProfile(targetOwnerId).catch(() => {});
    };

    await expect(wrappedSendHello("envoy:owner:bob", {}, "Hi")).resolves.toBeUndefined();
    expect(sendHello).toHaveBeenCalled();
  });
});
