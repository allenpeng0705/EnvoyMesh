/**
 * Tests for the wireMeshEvents runtime.
 */
import { describe, expect, it, vi } from "vitest";

import { wireMeshEventsViaRuntime } from "../src/node-service-wire-mesh-events.js";

describe("wireMeshEventsViaRuntime", () => {
  it("registers onMessage and onPeerDiscovered handlers with the mesh", () => {
    const onMessage = vi.fn(async () => undefined);
    const onPeerDiscovered = vi.fn(async () => undefined);
    const mesh = {
      onMessage: vi.fn(),
      onPeerDiscovered: vi.fn(),
    };
    wireMeshEventsViaRuntime({ mesh, onMessage, onPeerDiscovered });
    expect(mesh.onMessage).toHaveBeenCalledTimes(1);
    expect(mesh.onPeerDiscovered).toHaveBeenCalledTimes(1);
    expect(mesh.onMessage).toHaveBeenCalledWith(onMessage);
    expect(mesh.onPeerDiscovered).toHaveBeenCalledWith(onPeerDiscovered);
  });

  it("passes the same handler references that were provided", () => {
    const onMessage = vi.fn(async () => undefined);
    const onPeerDiscovered = vi.fn(async () => undefined);
    const mesh = {
      onMessage: vi.fn(),
      onPeerDiscovered: vi.fn(),
    };
    wireMeshEventsViaRuntime({ mesh, onMessage, onPeerDiscovered });
    // The registered handler is exactly the function we passed.
    const registeredMessageHandler = (mesh.onMessage as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    expect(registeredMessageHandler).toBe(onMessage);
    const registeredPeerHandler = (mesh.onPeerDiscovered as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    expect(registeredPeerHandler).toBe(onPeerDiscovered);
  });
});